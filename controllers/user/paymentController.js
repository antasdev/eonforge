const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Coupon = require('../../models/couponSchema');

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { cartItems, address, paymentMethod, subtotal, deliveryFee, totalAmount, coupon } = req.body;

       

        if(coupon){

            const couponDoc = await Coupon.findOne({ code: coupon.code })
                    
           
                        if (!couponDoc || !couponDoc.isActive) {
                           return res.status(400).json({ message: "Coupon is no longer active" });
                       }
        }


        // Validate totalAmount
        if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid totalAmount' });
        }

        if (totalAmount > 500000) {
            return res.status(400).json({
                success: false,
                message: "Order amount exceeds Razorpay limit of ₹5,00,000"
            });
        }

        // Validate cart items and stock
        for (const item of cartItems) {
            const product = await Product.findOne({
                _id: item.productId,
                'colorVariants._id': item.variantId
            });
            if (!product) throw new Error(`Product ${item.productName} not found`);

            const variant = product.colorVariants.find(v => v._id.toString() === item.variantId);
            if (!variant || variant.stock < item.quantity) {
               return res.status(500).json({ success: false, message: `Only ${variant.stock} unit(s) left for ${item.productName} (${variant.colorName} variant).` });
            }
        }

        // Create Razorpay order
        const options = {
            amount: Math.round(totalAmount * 100),
            currency: 'INR',
            receipt: `receipt_order_${Date.now()}`
        };
        const razorpayOrder = await razorpayInstance.orders.create(options);
      
        // Send response to frontend
        return res.json({
            success: true,
            order: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            }
        });

    } catch (error) {
        console.error('Error in createRazorpayOrder:', error);
        res.status(500).json({ success: false, message: 'Unable to create Razorpay order' });
    }
};

const verifyAndPlaceOrder = async (req, res) => {
    try {
       

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, cartItems, address, paymentMethod, subtotal, deliveryFee, totalAmount, coupon} = req.body;
        const userId = req.session.userId;



   
      
        let couponApplied = false;
        let couponDiscount = 0;
        let couponCode = null;

        if (coupon && coupon.isActive && subtotal >= coupon.minimumPurchaseAmount) {
            couponApplied = true;
            couponCode = coupon.code;
            couponDiscount =
                coupon.discountType === 'Percentage'
                    ? (subtotal * coupon.discountValue) / 100
                    : coupon.discountValue;
        }

        // Build order items
        const orderItems = [];
        for (const item of cartItems) {
            const product = await Product.findOne({
                _id: item.productId,
                'colorVariants._id': item.variantId
            });
            if (!product) throw new Error(`Product ${item.productName} not found`);

            const variant = product.colorVariants.find(v => v._id.toString() === item.variantId);
            if (!variant || variant.stock < item.quantity) {
                throw new Error(`Product ${item.productName} is out of stock or insufficient quantity`);
            }

            const regularPrice = variant.regularPrice || 0;
            const sellingPrice = item.price;
            const discount = regularPrice > 0 ? (regularPrice - sellingPrice) : 0;

            orderItems.push({
                product: item.productId,
                variantId: item.variantId,
                stock: item.quantity,
                price: item.price,
                status: 'Processing',
                discount
            });
        }

        // Format address
        const orderAddress = {
  addressType: address?.addressType || 'home',
  street: address?.street || '',
  city: address?.city || '',
  state: address?.state || '',
  pin: address?.pin || '',
  country: address?.country || '',
  phone: address?.phone || '',
  isDefault: address?.isDefault || false
};

// existing order
const existingOrder = await Order.findOne({razorpayOrderId:razorpay_order_id,userId})
   

   if(existingOrder){
     await Order.findOneAndUpdate({razorpayOrderId:razorpay_order_id,userId},{paymentStatus:'Paid',status: 'Processing',razorpayPaymentId:razorpay_payment_id,'orderItems.$[].status': 'Processing'})
   }else{
const newOrder = new Order({
  userId,
  orderItems,
  address: orderAddress, 
  paymentMethod,
  paymentStatus: 'Paid',
  subtotal,
  deliveryFee,
  totalPrice: subtotal,
  finalAmount: totalAmount,
  razorpayOrderId: razorpay_order_id,
  razorpayPaymentId: razorpay_payment_id,
  status: 'Processing',
  couponCode,
  couponApplied,
  couponDiscount
});

           
        await newOrder.save();
        // order making
   }



// Then use this when creating the order



        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generatedSignature = hmac.digest('hex');



         if (generatedSignature !== razorpay_signature) {
           await Order.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                { paymentStatus: 'Failed', status: 'Pending','orderItems.$[].status': 'Pending' }
            );
            return res.status(400).json({ success: false, message: 'Signature verification failed' });
        }
  

        // Decrease product stock
        for (const item of cartItems) {
            await Product.updateOne(
                { _id: item.productId, 'colorVariants._id': item.variantId },
                { $inc: { 'colorVariants.$.stock': -item.quantity } }
            );
        }

        // Update coupon usage
        if (couponApplied && couponCode) {
            await Coupon.findOneAndUpdate(
                { code: couponCode },
                { $push: { usedBy: { user: userId, count: 1 } } },
                { new: true }
            );
        }

        // Empty the user’s cart
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
  

        res.json({ success: true, message: 'Payment verified and order placed' });

    } catch (error) {
        console.error('Error in verifyAndPlaceOrder:', error);
        res.status(500).json({ success: false, message: 'Server error while verifying payment' });
    }
};


const paymentFailure = async (req, res) => {
    try {
        const userId = req.session.userId;
        const razorpayOrderId = req.query.razorpayOrderId;
        const reason = req.query.error || "Payment failed";
 
        if (razorpayOrderId) {
            const updatedOrder = await Order.findOneAndUpdate(
                { razorpayOrderId ,userId},
                { paymentStatus: 'Failed', status: 'Pending' },
                { new: true }
            );
      
        }

        res.render('payment-failure', { errorMessage: reason,razorpayOrderId });

    } catch (error) {
        console.error('Payment failure error:', error);
       res.status(500).send('An unexpected error occurred. Please try again later.');

    }
};


const retryRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { razorpayOrderId } = req.body;

    // 🔍 Find the existing order
    const order = await Order.findOne({ razorpayOrderId, userId });
    

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Create a new Razorpay order
    const options = {
      amount: Math.round(order.finalAmount * 100), // in paise
      currency: 'INR',
      receipt: `retry_${Date.now()}_${order.orderId.slice(0, 8)}`
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
 

    // Update old order with new razorpay order ID and set payment back to pending
    order.razorpayOrderId = razorpayOrder.id;
    order.razorpayPaymentId = null;
    order.paymentStatus = 'Pending';
    order.status = 'Pending';
    await order.save();
   
    const cartItemsToSend = order.orderItems.map(i => ({
      productId: i.product.toString(),
      variantId: i.variantId.toString(),
      quantity: i.stock,
      price: i.price,
      discount: i.discount
    }));
    
    res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      order_id: razorpayOrder.id,
      cartItems: cartItemsToSend,
      address: order.address,
      paymentMethod: order.paymentMethod,
      subtotal: order.totalPrice,
      deliveryFee: 0,
      totalAmount: order.finalAmount,
      coupon: order.couponApplied ? { code: order.couponCode, isActive: true, discountValue: order.couponDiscount } : null
    });
    
    
      } catch (err) {
            console.error('Error retrying Razorpay order:', err);
        res.status(500).json({ success: false, message: 'Unable to retry payment' });
      }
};



module.exports = {
     createRazorpayOrder,
     verifyAndPlaceOrder,
     paymentFailure,
     retryRazorpayOrder
};
