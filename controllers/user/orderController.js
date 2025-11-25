const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const calculateItemRefund = require('../../helpers/calculateItemRefund');
const env = require("dotenv").config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require("fs");
const path = require('path');
const logoPath = path.join(__dirname, "../../public/assets/others/watch_logo.png")

const logoBase64 = fs.readFileSync(logoPath).toString("base64");



const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});




const orderDetails = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.redirect('/login');
        const { orderId } = req.query
        

        // Find the most recent order for the user
        const order = await Order.findOne({ userId, orderId })
            .sort({ createdOn: -1 })
            .populate({
                path: 'orderItems.product',
                populate: { path: 'brand' } // Populate brand if needed
            })
            .lean();

        if (!order) {
            return res.redirect('/orders'); // Redirect to orders page if no order found
        }

        const user = await User.findById(userId);
        

        // Process order items for display
        let orderItems = [];
        let subtotal = 0;

        if (order.orderItems && order.orderItems.length > 0) {
            orderItems = order.orderItems.map(item => {
                const product = item.product;
                if (!product) {
                    console.error(`Product not found for order item: ${item._id}`);
                    return null;
                }

                // Find the variant in the product
                const variant = product.colorVariants?.find(
                    v => v._id.toString() === item.variantId.toString()
                ) || {};

                return {
                    id: item._id.toString(),
                    productId: product._id.toString(),
                    variantId: item.variantId.toString(),
                    productName: product.productName || 'N/A',
                    productImage: variant.productImage?.[0] || '/placeholder.svg',
                    color: variant.colorName || 'N/A',
                    price: item.price,
                    discount: item.discount || 0,
                    quantity: item.stock, // Quantity ordered
                    total: item.price * item.stock,
                    brandName: product.brand?.brandName || 'N/A',
                    status: item.status || 'Ordered' // Use order item status
                };
            }).filter(Boolean); // Remove any null items

            subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
        }

        

        // Prepare address data from order
        const addresses = [{
            _id: 'order-address',
            address: order.address.street || 'N/A',
            city: order.address.city || 'N/A',
            state: order.address.state || 'N/A',
            pinCode: order.address.pin || 'N/A',
            country: order.address.country || 'N/A',
            phone: order.address.phone || 'N/A',
            isDefault: order.address.isDefault || false
        }];

        // Calculate delivery fee if not stored separately
        const deliveryFee = 50

        res.render('order-details', {
            paymentMethod: order.paymentMethod,
            orderId: order.orderId,
            cartItems: orderItems, // Note: Still called cartItems for template compatibility
            addresses: addresses,
            subtotal: order.totalPrice,
            deliveryFee: deliveryFee > 0 ? deliveryFee : 0,
            order: order,
            fullName: user?.firstName || 'Customer',
            email: user?.email || '',
            discount: order.discount || 0,
            tax: 0, // Add if applicable
            orderDate: order.createdOn || new Date(),
            orderStatus: order.status || 'Pending'
        });

    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const orders = async (req, res) => {
    try {
         const userId = req.session.userId;
            const isLoggedIn = !!userId;
            let user = null;
            if (isLoggedIn) user = await User.findById(userId).lean();
        

        if (!userId) return res.redirect('/login');

        const search = req.query.search?.trim() || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const query = { userId };
        if (search) {
            query.orderId = { $regex: search, $options: 'i' };
        }

        const orders = await Order.find(query)
            .populate({
                path: 'orderItems.product',
                select: 'productName colorVariants',
                populate:{
                    path:'brand category',
                    select:'brandName name',
                }
            })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit)
            .lean();


        orders.forEach(order => {
            order.orderItems.forEach(item => {
                const product = item.product;
                if (product && product.colorVariants) {
                    const variant = product.colorVariants.find(
                        v => v._id.toString() === item.variantId.toString()
                    );
                    item.variantData = variant || null;
                } else {
                    item.variantData = null;
                }
            });
        });

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);
        

        // cart count
          const cart=await Cart.findOne({userId})
                 let cartCount = 0;
                
                if (cart && cart.items) {
                  cartCount = cart.items.length;
                }
        

        res.render('orders-list', {
            orders,
            user,
            cartCount,
            search,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error('Order listing page error:', error);
        res.status(500).send("Something went wrong.");
    }
};





const mongoose = require('mongoose');
const { features } = require('process');
const ObjectId = mongoose.Types.ObjectId;



const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;

        const order = await Order.findOne({ orderId });
       
       
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        
        const item = order.orderItems.find(i => i._id.toString() === itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });
        if (item.status === 'Cancelled') return res.json({ success: false, message: 'Item already cancelled' });

        // Mark item as cancelled
        item.status = 'Cancelled';
        item.cancelReason = reason || null;
        item.refunded = true;
   // refund amout finding
        let refundAmount = calculateItemRefund(item,order.totalPrice,order.couponDiscount)
    


      // Always refund to wallet
      let wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) {
        wallet = new Wallet({ userId: order.userId, balance: 0, transactions: [] });
      }
  if (order.paymentMethod !=='cod'){
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        reason: `Refund for returned item ${item._id} in order ${order.orderId}`,
        status: 'success',
        orderId: order._id,
        itemId: item._id,
        date: new Date()
      });
      await wallet.save();
    }

      

       // --- Coupon handling ---
const allCancelled = order.orderItems.every(i => i.status === 'Cancelled');

// Update order status
if (allCancelled) {
  order.status = 'Cancelled';
  order.cancelReason = 'All items cancelled';
}



        // Restore product stock
        await Product.updateOne(
            { _id: item.product, 'colorVariants._id': item.variantId },
            { $inc: { 'colorVariants.$.stock': item.stock } }
        );

       
        await order.save();

        return res.json({ success: true, message: 'Item cancelled and stock restored' });

    } catch (err) {
        console.error('Cancel item error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};


// return order item
const returnOrderItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;
    

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({ orderId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Find the item in orderItems
        const item = order.orderItems.find(i => i._id.toString() === itemId);
      
        if (!item) {
            return res.status(404).json({ success: false, message: 'Order item not found' });
        }

        // if (item.status !== 'Delivered') {
        //   return res.status(400).json({ success: false, message: 'Only delivered items can be returned' });
        // }

        // Update item status only
        item.status = 'Return Request';
        item.returnReason = reason;

        await order.save();

        res.json({ success: true, message: 'Return request submitted successfully' });

    } catch (err) {
        console.error('Return order error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};







// Cancel Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        
        const order = await Order.findOne({ orderId });
     

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!order.finalAmount || isNaN(order.finalAmount)) {
          return res.status(400).json({ success: false, message: 'Invalid order amount' });
        }
        
        if (order.paymentMethod !== 'cod' && order.paymentMethod !== 'wallet' && !order.razorpayPaymentId) {
          return res.status(400).json({ success: false, message: 'No Razorpay payment found for online order' });
        }

        if (order.status === 'Cancelled') {
            return res.json({ success: false, message: 'Order is already cancelled' });
        }
    
        // Refund logic
          const refundedPrice=[]

        const canceledItems = order.orderItems.filter((item)=>item.status=="Cancelled");
        const nonCanceledItems = order.orderItems.filter((item)=>item.status!=="Cancelled");
        

        if (canceledItems && canceledItems.length > 0){
            for(const item of canceledItems){
               
                const refunded=calculateItemRefund(item,order.totalPrice,order.couponDiscount)
                refundedPrice.push(refunded)
            }
        }
     
         const itemRefund=refundedPrice.reduce((a,b)=>a+b,0)
      
        let refundAmount=0;
          if (canceledItems && canceledItems.length > 0){

         refundAmount = order.finalAmount-itemRefund; 
         
         }else{
          refundAmount = order.finalAmount; 

         }
   

        if (!refundAmount || isNaN(refundAmount) || refundAmount <= 0) {
           return res.status(400).json({ success: false, message: 'Invalid refund amount calculated' });
         }

         let refundStatus = 'success';
    
        for (const item of nonCanceledItems) {
            item.status = 'Cancelled';
            item.cancelReason = reason || null;

            // Return stock to inventory
            await Product.updateOne(
                { _id: item.product, 'colorVariants._id': item.variantId },
                { $inc: { 'colorVariants.$.stock': item.stock } }
            );
        }
     
        // Update order-level status
        order.status = 'Cancelled';
        order.cancelReason = reason || null;
        
        
        let wallet = await Wallet.findOne({ userId: order.userId });
          if (!wallet) {
            wallet = new Wallet({ userId: order.userId, balance: 0, transactions: [] });
          }

        
          if (order.paymentMethod !== 'cod' && order.razorpayPaymentId) {
  try {
    const payment = await razorpayInstance.payments.fetch(order.razorpayPaymentId);

    if (payment.status !== 'captured') {
      return res.status(400).json({ success: false, message: `Cannot refund, payment not captured (${payment.status})` });
    }

    if (payment.method === 'wallet') {
      order.paymentStatus = 'Refunded';
      order.refunded = true;
      await order.save();

      // Still add refund to wallet if needed
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        reason: `Auto refund for wallet order ${order.orderId}`,
        status: 'success',
        orderId: order._id,
        date: new Date()
      });
      await wallet.save();

      return res.json({ success: true, message: 'Wallet-based order cancelled and refund handled automatically by Razorpay' });
    }

    // For normal card / UPI payments
    const refund = await razorpayInstance.payments.refund(order.razorpayPaymentId, {
      amount: Math.round(refundAmount * 100),
      speed: 'normal',
      receipt: `refund_${order.orderId}_${Date.now()}`
    });

   
    order.paymentStatus = 'Refunded';
    order.refunded = true;

  } catch (refundError) {
    console.error(' Razorpay refund error (details):', refundError);
    return res.status(500).json({
      success: false,
      message: refundError.error?.description || 'Refund failed'
    });
  }
}

        
          // Update wallet balance and add transaction
          if(order.paymentMethod !=='cod'){
          wallet.balance += refundAmount;
          wallet.transactions.push({
            type: 'credit',
            amount: refundAmount,
            reason: `Refund for order ${order.orderId}`,
            status: refundStatus,
            orderId: order._id,
            date: new Date()
          });
        
          await wallet.save();
          order.paymentStatus = 'Refunded';
          
        }
        await order.save();
        

        return res.json({ success: true, message: 'Order cancelled and stock restored' });

    } catch (error) {
        console.error('Cancel order error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};



//     Return Order
const returnOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
     

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }


        const order = await Order.findOne({ orderId });
     
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }


        // Update overall order status
        order.status = 'Return Request';
        order.returnStatus = "Requested"
        order.returnReason = reason

        // Update each item's return status and reason
        order.orderItems.forEach(item => {
            
            item.returnStatus = 'Requested';
            item.returnReason = reason;
        });


        await order.save();

        res.json({ success: true, message: 'Return request submitted successfully' });

    } catch (err) {
        console.error('Return order error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


const loadInvoice = async (req, res) => {
    try {

        const userId = req.session.userId;
            const isLoggedIn = !!userId;
            let user = null;
            if (isLoggedIn) user = await User.findById(userId).lean();
        

        if (!userId) return res.redirect('/login');
        const { orderId } = req.query; // /order/:orderId/invoice
       

        // Find order and populate user and product details
        const order = await Order.findOne({ orderId })
            .populate("userId") // Populate user details (e.g., name)
            .populate({
              path: "orderItems.product",
              populate: { path: "brand" }  // this populates the brand inside product
            })
            .lean();

        if (!order) {
            return res.status(404).render('error', {
                message: 'Order not found',
                statusCode: 404,
                link: '/orders',
                linkText: 'View Orders'
            });
        }

        
        const userFullName = order.userId?.name || 'Customer'; 

        // Define deliveryFee (customize based on business logic)
        const deliveryFee = 50; 

        // Enhance orderItems with product details (if not already included)
        order.orderItems = order.orderItems.map(item => {
               const product = item.product;

    // Find the selected variant
      const variant = product?.colorVariants?.find(
        v => v._id.toString() === item.variantId.toString()
    ); 
        return{
            ...item,
            productName: product.productName,
            brandName: item.product?.brand.brandName || 'Eon Forge',
            color: variant?.colorName || 'N/A',
            regularPrice:variant?.regularPrice,
        };
        });
   
        // Pass order details to EJS
        res.render("invoice", {
            order,
            userFullName,
            deliveryFee
        });
    } catch (error) {
        console.error("Invoice error:", error);
        res.status(500).render('error', {
            message: 'An error occurred while generating the invoice',
            statusCode: 500,
            link: '/orders',
            linkText: 'View Orders'
        });
    }
};

const PdfPrinter = require("pdfmake");

const fonts = {
    Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
    },
};
const printer = new PdfPrinter(fonts);



const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.query;

        const order = await Order.findOne({ orderId })
            .populate("userId")
            .populate("orderItems.product")
            .lean();

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const userFullName = (order.userId?.firstName || "") + " " + (order.userId?.lastName || "");
        const deliveryFee =50;

        // Build invoice definition
        const docDefinition = {
            pageSize: "A4",
            pageMargins: [40, 40, 40, 40],
            content: [
                {
                    image: `data:image/png;base64,${logoBase64}`,
                    width: 120,
                    alignment: "center",
                    margin: [0, 0, 0, 20]
                },
                { text: "Eon Forge - Invoice", style: "header", alignment: "center" },

                { text: `#ORD-${order.orderId.slice(1,8)}`, style: "subheader", margin: [0, 10, 0, 20], alignment: "center" },

                {
                    columns: [
                        [
                            { text: "From", style: "sectionHeader" },
                            { text: "Eon Forge", bold: true },
                            { text: "123 Luxury Lane, Mumbai" },
                            { text: "Maharashtra, India 400001" },
                            { text: "support@eonforge.com" },
                            { text: "+1 (800) 555-1234" },
                        ],
                        [
                            { text: "To", style: "sectionHeader" },
                            { text: userFullName, bold: true },
                            { text: order.address?.street || "" },
                            { text: `${order.address?.city || ""}, ${order.address?.state || ""} ${order.address?.pin || ""}` },
                            { text: order.address?.country || "India" },
                            { text: `Phone: ${order.address?.phone || "N/A"}` },
                        ],
                    ],
                    columnGap: 40,
                    margin: [0, 0, 0, 20],
                },

                { text: "Order Details", style: "sectionHeader" },
                {
                    table: {
                        widths: ["*", "auto", "auto", "auto", "auto"],
                        body: [
                            ["Item", "Qty", "Unit Price", "Discount", "Total"],
                            ...order.orderItems.map((item) => [
                                item.product.productName || "Product",
                                item.stock || 1,
                                `₹${(item.price || 0).toLocaleString()}`,
                                item.discount > 0 ? `₹${(item.discount).toLocaleString()}` : "–",
                                `₹${(
                                    (item.price - (item.discount || 0)) * (item.stock || 1)
                                ).toLocaleString()}`,
                            ]),
                        ],
                    },
                    layout: "lightHorizontalLines",
                    margin: [0, 0, 0, 20],
                },
                { text: "Order Summary", style: "sectionHeader" },
                {
                    columns: [
                        { width: "*", text: "" },
                        {
                            width: "auto",

                            table: {
                                body: [
                                    ["Subtotal", `₹${(order.totalPrice || 0).toLocaleString()}`],
                                    ["Coupon discount", `₹${(order.couponDiscount || 0).toLocaleString()}`],
                                    ["Delivery Fee", deliveryFee === 0 ? "Free" : `₹${deliveryFee}`],
                                    order.paymentMethod === "cod" ? ["COD Fee", "₹50"] : null,
                                    ["Total", `₹${(order.finalAmount || 0).toLocaleString()}`],
                                ].filter(Boolean),
                            },
                            layout: "noBorders",
                        },
                    ],
                },

                { text: "Payment Details", style: "sectionHeader", margin: [0, 20, 0, 10] },
                {
                    text: `${order.paymentMethod.toUpperCase()} - Status: ${order.paymentStatus}`,
                },
            ],
            styles: {
                header: { fontSize: 22, bold: true, margin: [0, 0, 0, 15] },
                subheader: { fontSize: 14, margin: [0, 5, 0, 15] },
                sectionHeader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
            },
            defaultStyle: { font: "Helvetica" },
        };


        // Generate PDF
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const chunks = [];
        pdfDoc.on("data", (chunk) => chunks.push(chunk));
        pdfDoc.on("end", () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename=invoice-${orderId}.pdf`,
            });
            res.end(pdfBuffer);
        });
        pdfDoc.end();
    } catch (err) {
        console.error("Download invoice error:", err);
        res.status(500).send("Failed to generate invoice PDF");
    }
};



module.exports={
       orderDetails,
        orders,
        cancelOrderItem,
        cancelOrder,
        returnOrder,
        returnOrderItem,
        loadInvoice,
        downloadInvoice
}