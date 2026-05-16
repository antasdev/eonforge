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



const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.redirect('/login');
        



        //   user data getting
        const user = await User.findById(userId).lean();

        const userName = `${user.firstName} ${user.lastName}`;


        //  cart data getting
        const cartData = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: [
                    { path: 'brand', select: 'brandName' },
                    { path: 'category', select: 'name offerPrice hasOffer isListed' }
                ]
            });


        if (!cartData || !cartData.items || cartData.items.length === 0) {
            return res.redirect('/cart');
        }
        const cartItems = cartData.items.map(item => {
            const product = item.productId;
            const variant = product?.colorVariants.find(
                v => v._id.toString() === item.variantId.toString()
            );
            const liveStock=variant.stock
          if(liveStock<=0){
            console.error('order is out of stock')
             return null;  
          }
            if (!product || !variant) {
                console.error(`Invalid product or variant for item: ${item._id}`);
                return null;
            }


            const isBlocked = product.isBlocked || variant.isBlocked;
            if (isBlocked) {
                return null

            }
            let variantPrice = variant.regularPrice;

            if (variant.hasOffer && !isBlocked) {
                if (variant.offerPrice !== null) {
                    variantPrice = variant.offerPrice;
                }
            }

            let categoryDiscountPrice = null;
            if (product.category?.hasOffer && product.category?.isListed && !isBlocked) {
                const discountPercent = product.category.offerPrice;
                categoryDiscountPrice = variant.regularPrice - (variant.regularPrice * discountPercent / 100);
            }

            const latestPrice = categoryDiscountPrice
                ? Math.min(categoryDiscountPrice, variantPrice)
                : variantPrice;

            const quantity = item.quantity ?? item.stock ?? 1;

            return {
                id: item._id.toString(),
                productId: product._id.toString(),
                variantId: item.variantId.toString(),
                productName: product.productName || 'N/A',
                productImage: variant.productImage?.[0] || '/placeholder.svg',
                color: variant.colorName || 'N/A',
                price: latestPrice,
                quantity,
                total: (product.isBlocked || variant.isBlocked) ? 0 : latestPrice * quantity,
                brandName: product.brand?.brandName || 'N/A',
                categoryName: product.category?.name || 'N/A',
                stock: variant.stock,
                status: isBlocked
                    ? 'Blocked'
                    : variant.stock > 0
                        ? 'Available'
                        : 'Out of Stock'
            };
        }).filter(Boolean);

      

        // address getting
        const addressDoc = await Address.findOne({ userId });
    

        let defaultAddress = null;
        let otherAddresses = [];

        if (addressDoc?.address?.length > 0) {
            const defaults = addressDoc.address.filter(addr => addr.isDefault);
            defaultAddress = defaults.length > 0 ? defaults[0] : addressDoc.address[0];
            otherAddresses = addressDoc.address.filter(addr => addr._id.toString() !== defaultAddress._id.toString());

        }


      

        const coupons = await Coupon.find()
        

        let subtotal = 0;
        if (cartItems.length > 0) {
            subtotal = cartItems.reduce((sum, item) => sum + (item.total || 0), 0);
        }
        

        const deliveryFee = 50;
        const totalAmount = subtotal + deliveryFee;
      
        const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
        res.render('checkout', {
            userId,
            razorpayKeyId,
            userName,
            cartItems,
            defaultAddress,
            otherAddresses,
            subtotal,
            deliveryFee,
            totalAmount,
            coupons
        });

    } catch (error) {
       
        res.status(500).send('Internal Server Error');
    }
};




const addAddress = async (req, res) => {
    try {
        const userId = req.session.userId;
       
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { type, fullName, phone, street, city, state, pinCode, country, isDefault } = req.body;

        // Validate all required fields
        if (!type || !fullName || !phone || !street || !city || !state || !pinCode || !country) {
            return res.status(400).json({ message: 'All required fields must be provided' });
        }


        const newAddress = {
            type,
            fullName,
            phone,
            street,
            city,
            state,
            pin: pinCode,
            country,
            isDefault: isDefault === true || isDefault === 'true'
        };

        let addressDoc = await Address.findOne({ userId });

        if (!addressDoc) {
            // Create new document
            addressDoc = new Address({
                userId,
                address: [newAddress]
            });
        } else {
            // If isDefault is true, unset other default addresses
            if (newAddress.isDefault) {
                addressDoc.address.forEach(addr => {
                    addr.isDefault = false;
                });
            }
            addressDoc.address.push(newAddress);
        }

        await addressDoc.save();
        res.status(200).json({ message: 'Address added successfully' });

    } catch (error) {
        console.error('checkout page add address error:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};


const editAddress = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const {
            type, fullName, phone,
            street, city, state, pinCode, country, isDefault
        } = req.body;

   

        const updateAddress = await Address.findOneAndUpdate(
            { userId: userId, "address.type": type },
            {
                $set: {
                    "address.$.fullName": fullName,
                    "address.$.phone": phone,
                    "address.$.street": street,
                    "address.$.city": city,
                    "address.$.state": state,
                    "address.$.pin": pinCode,
                    "address.$.country": country,
                    "address.$.isDefault": isDefault
                }
            },
            { new: true }
        );

       

        if (!updateAddress) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        res.status(200).json({ success: true, message: "Address updated successfully" });

    } catch (error) {
        
        res.status(500).json({ success: false, message: "Server error" });
    }
};


const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.body;
        const userId = req.session.userId;

        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

       



        const deletedAddress = await Address.findOneAndUpdate(
            { userId: userId },
            { $pull: { address: { _id: addressId } } },
            { new: true }
        );

        if (!deletedAddress) {
            return res.status(404).json({ success: false, message: 'Address not found or already deleted' });
        }

        res.status(200).json({ success: true, message: 'Address deleted successfully' });

    } catch (error) {
      
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


const placeOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { cartItems, address, paymentMethod, subtotal, deliveryFee, totalAmount, coupon } = req.body;
        const product = await Promise.all(
            cartItems.map(async (item) => {
                const product = await Product.findById(item.productId)
                const variant = product.colorVariants.id(item.variantId)
                return { ...item, regularPrice: variant.regularPrice }
            })
        )
       
   
        let codLimit=25000;

    if(totalAmount>codLimit && paymentMethod=='cod'){
        return res.status(400).json({ success: false, message: 'Order above Rs 25000 should not be allowed for COD.' })
    }
    

        let couponApplied = false;
        let couponDiscount = 0;
        let couponCode=null;
      
          
        

        if (coupon && coupon.isActive) {
            couponApplied = true
            couponCode=coupon.code
            
            if (subtotal >= coupon.minimumPurchaseAmount) {
                if (coupon.discountType === 'Percentage') {
                    couponDiscount = (subtotal * coupon.discountValue) / 100;
                } else if (coupon.discountType === 'Flat') {
                    couponDiscount = coupon.discountValue;
                }
            }

            const couponDoc = await Coupon.findOne({ code: coupon.code })
          

             if (!couponDoc || !couponDoc.isActive) {
                return res.status(400).json({ message: "Coupon is no longer active" });
            }
             if (couponDoc) {
                const existUser = couponDoc.usedBy.find(u => u.user.toString() == userId.toString())
                


                if (existUser) {
                    await Coupon.findOneAndUpdate({ code: coupon.code, 'usedBy.user': userId }, { $inc: { 'usedBy.$.count': 1 } }, { new: true })
                } else {
                    await Coupon.findOneAndUpdate({ code: coupon.code }, { $push: { usedBy: { user: userId, count: 1 } } }, { new: true })
                }
            } 

        }


        if (!userId || !cartItems || !address || !paymentMethod) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Validate and map address fields
        const addressFields = {
            addressType: address.addressType || address.type,
            street: address.street,
            city: address.city,
            state: address.state,
            pin: address.pin,
            country: address.country,
            phone: address.phone,
            isDefault: address.isDefault || false
        };


        if (!addressFields.addressType || !addressFields.street || !addressFields.city ||
            !addressFields.state || !addressFields.pin || !addressFields.country || !addressFields.phone) {
            return res.status(400).json({ success: false, message: 'Missing required address fields' });
        };
        let orderItems = [];
        for (const item of cartItems) {
            const product = await Product.findOne(
                { _id: item.productId, 'colorVariants._id': item.variantId },
                { 'colorVariants.$': 1 }
            );
           
            if (!product || product.colorVariants.length === 0) {
                return res.status(404).json({ success: false, message: 'Product or variant not found.' });
            }

            const variant = product.colorVariants[0];
        
            const regularPrice = variant.regularPrice || 0;
            const sellingPrice = item.price;
            const discount = regularPrice > 0 ? (regularPrice - sellingPrice) : 0;
         
            if (variant.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Only ${variant.stock} unit(s) left for ${item.productName} (${variant.colorName} variant).`
,
                });
            }
            orderItems.push({
                product: item.productId,
                variantId: item.variantId,
                stock: item.quantity,
                price: sellingPrice,
                regularPrice,
                discount
            });
        };

        let paymentStatus = 'Pending';
        //wallet checking
         if(paymentMethod==='wallet'){
            
        const wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            return res.status(400).json({
              success: false,
              message: 'Wallet not found!',
            });
          }
        
     
        
          const walletBalance = wallet.balance;
        
         
          if (walletBalance < totalAmount) {
            return res.status(400).json({
              success: false,
              message: `Insufficient balance! You only have ₹${walletBalance.toLocaleString()}.`,
            });
          }
        
          // Deduct wallet amount
          wallet.balance -= totalAmount;
        
          //  Add transaction entry
          wallet.transactions.push({
            type: 'debit',
            amount: totalAmount,
            reason: 'Order payment',
            status: 'success',
            date: new Date(),
          });
        
          await wallet.save();

          paymentStatus = 'Paid';
        
            };

        const newOrder = new Order({
            userId,
            paymentMethod,
            paymentStatus,
            orderItems,
            totalPrice: subtotal,
            finalAmount: totalAmount,
            address: addressFields,
            status: "Processing",
            invoiceDate: new Date(),
            couponCode,
            couponApplied,
            couponDiscount
        });

        await newOrder.save();
        
        

        for (const item of cartItems) {
            await Product.updateOne(
                { _id: item.productId, 'colorVariants._id': item.variantId },
                { $inc: { 'colorVariants.$.stock': -item.quantity } }
            );
        }

        await Cart.findOneAndDelete({ userId })

        res.status(200).json({
            success: true,
            orderId: newOrder.orderId,
            redirecturl: '/place-order'
        });


    } catch (error) {
        console.error('Place order error:', error);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ success: false, message: 'Validation error', errors });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const loadPlaceOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.redirect('/login');
        const order = await Order.findOne({ userId })
            .sort({ createdOn: -1 })
            .populate({
                path: 'orderItems.product',
                populate: { path: 'brand' }
            })
            .lean();

        if (!order) {
            return res.redirect('/cart');
        }

        const user = await User.findById(userId);

        // Process order items
        const orderItems = order.orderItems.map(item => {
            const product = item.product;
            const variant = product?.colorVariants?.find(
                v => v._id.toString() === item.variantId.toString()
            ) || {};

            return {
                id: item._id.toString(),
                productId: product?._id.toString(),
                variantId: item.variantId.toString(),
                productName: product?.productName || 'N/A',
                productImage: variant.productImage?.[0] || '/placeholder.svg',
                color: variant.colorName || 'N/A',
                price: item.price,
                quantity: item.stock, // Quantity ordered
                total: item.price * item.stock,
                brandName: product?.brand?.brandName || 'N/A',
                status: item.status || 'Ordered'
            };
        }).filter(Boolean);

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
        const deliveryFee = 50;
      
        res.render('place-order', {
            paymentMethod: order.paymentMethod,
            orderId: order.orderId,
            cartItems: orderItems,
            addresses: addresses,
            subtotal: order.totalPrice,
            deliveryFee: deliveryFee > 0 ? deliveryFee : 0, // Ensure non-negative
            order: order,
            fullName: user?.firstName || 'Customer',
            email: user?.email || '',
            discount: order.discount || 0,
            tax: 0 // Add if applicable
        });

    } catch (error) {
        console.error('Error loading order confirmation:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};














module.exports = {
    loadCheckout,
    addAddress,
    editAddress,
    deleteAddress,
    placeOrder,
    loadPlaceOrder,
}