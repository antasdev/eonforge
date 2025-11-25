const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Cart = require('../../models/cartSchema')
const Wishlist = require('../../models/wishlistSchema')
const Wallet = require('../../models/walletSchema')
const env = require("dotenv").config();
const Razorpay = require('razorpay');
const crypto = require('crypto');


const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


const loadProductDetail = async (req, res) => {
  try {
    const userId = req.session.userId;
    const isLoggedIn = !!userId;
    const user = isLoggedIn ? await User.findOne({ _id: userId, isBlocked: false }) : null;

    let wishlistProductIds = [];
    if (isLoggedIn) {
      const wishlist = await Wishlist.findOne({ userId }).lean();
      if (wishlist) {
        wishlistProductIds = wishlist.products.map(item => `${item.productId}:${item.variantId}`);
      }
    }



    const productId = req.params.id
    const variantId = req.query.variant;


    const brands = await Brand.find({ isBlocked: false }).lean();
    const categories = await Category.find({ isListed: true }).lean();

    // Fetch product with validation for unblocked brand and listed category
    const product = await Product.findOne({
      _id: productId,
      isBlocked: false,
      brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') },
      category: { $in: await Category.find({ isListed: true }).distinct('_id') },
    })
      .populate('category')
      .populate('brand')
      .lean();



    let selectedVariant = product.colorVariants[0];

    if (variantId) {
      const variant = product.colorVariants.find(v => v._id.toString() === variantId);
      if (variant) selectedVariant = variant;
    }
    const cart = await Cart.findOne({ userId });

    let cartQuantity = 0;
    if (cart) {

      const item = cart.items.find((value) => value.productId.toString() === productId &&
        value.variantId.toString() === selectedVariant._id.toString()
      );
      cartQuantity = item ? item.stock : 0;
    }
    let isInCart = false;
    if (cart) {
      const item = cart.items.find((value) =>
        value.productId.toString() === productId &&
        value.variantId.toString() === selectedVariant._id.toString()
      );
      if (item) {
        cartQuantity = item.stock;
        isInCart = true;
      }
    }

    const sameBrandProducts = await Product.find({
      brand: product.brand._id,
      _id: { $ne: product._id },
      isBlocked: false
    })
    .populate('category')
      .limit(5);

      
      
      let cartCount = 0;
      
      if (cart && cart.items) {
        cartCount = cart.items.length;
      }

    res.render('product-detail', {
      user,
      isLoggedIn,
      cartCount,
      product,
      categories,
      brands,
      selectedVariant,
      sameBrandProducts,
      cartQuantity,
      isInCart,
      wishlistProductIds

    })
  } catch (error) {

    console.error('Error loading product detail:', error);
    res.redirect('/pageNotFound');
  }
}
const loadWallet = async (req, res) => {
  try {
    const userId = req.session.userId;
    const isLoggedIn = !!userId;

    if (!isLoggedIn) {
      return res.status(401).render('wallet', {
        user: null,
        isLoggedIn: false,
        walletBalance: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        transactionCount: 0,
        transactions: [],
        kycVerified: false,
        bonusAmount: 0,
        walletLocked: false,
        availableWithdrawal: 0,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID // Add Razorpay key
      });
    }

    const user = await User.findOne({ _id: userId, isBlocked: false });
    if (!user) {
      return res.status(403).render('wallet', {
        user: null,
        isLoggedIn: false,
        walletBalance: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        transactionCount: 0,
        transactions: [],
        kycVerified: false,
        bonusAmount: 0,
        walletLocked: false,
        availableWithdrawal: 0,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID // Add Razorpay key
      });
    }

    // Fetch wallet data
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0, transactions: [] });
      await wallet.save();
    }

    // Calculate wallet metrics
    const walletBalance = wallet.balance;
    const transactions = wallet.transactions.map(tx => ({
      _id: tx._id.toString(), // Ensure _id is included for frontend
      amount: tx.amount,
      description: tx.reason || (tx.type === 'credit' ? 'Added to wallet' : 'Used for purchase'),
      type: tx.type,
      status: tx.status,
      date: tx.date,
      orderId: tx.orderId ? tx.orderId.toString() : null
    }));

    const totalDeposits = wallet.transactions
      .filter(tx => tx.type === 'credit' && tx.status === 'success')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalWithdrawals = wallet.transactions
      .filter(tx => tx.type === 'debit' && tx.status === 'success')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const transactionCount = wallet.transactions.length;
    
    //cart count
     const cart=await Cart.findOne({userId})
     // cart count
     let cartCount = 0;
    
    if (cart && cart.items) {
      cartCount = cart.items.length;
    }

    // Bonus amount and withdrawal logic
    const bonusAmount = 0; // Adjust if applicable
    const isKycVerified = user.kycVerified || false;
    const walletLocked = user.walletLocked || false;
    const availableWithdrawal = walletLocked ? 0 : walletBalance;
    res.render('wallet', {
      user,
      isLoggedIn,
      cartCount,
      walletBalance,
      totalDeposits,
      totalWithdrawals,
      transactionCount,
      transactions,
      kycVerified: isKycVerified,
      bonusAmount,
      walletLocked,
      availableWithdrawal,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID // Add Razorpay key
    });
  } catch (error) {
    console.error('load wallet error:', error);
    res.status(500).render('error', { message: 'Error loading wallet' });
  }
};

const addFunds = async (req, res) => {
    try {
        const { amount, paymentMethod } = req.body;
          const user = await User.findById(req.session.userId);
        const userId = req.session.userId;
        // Validate user
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }
      


        // Validate input
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        if (!['razorpay', 'upi', 'card'].includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method' });
        }

        // Find or create wallet
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
        }

        // Create Razorpay order with a shorter receipt
        const shortUserId = userId.slice(-8); // Last 8 characters of userId
        const receipt = `wallet_${shortUserId}_${Date.now().toString().slice(-6)}`; // Ensure < 40 chars
        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: receipt
        };

        const razorpayOrder = await razorpayInstance.orders.create(options);

        // Add pending transaction
        wallet.transactions.push({
            type: 'credit',
            amount,
            reason: `Added funds via ${paymentMethod}`,
            status: 'pending',
            date: new Date()
        });
        await wallet.save();

        // Return response with wallet data
        res.json({
            success: true,
            razorpayOrder: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            },
             user: {
        name:user.firstName ,     // 👈 assuming req.user is available (from session/middleware)
        email:user.email 
    },
     razorpayKeyId: process.env.RAZORPAY_KEY_ID ,
            walletBalance: wallet.balance,
            totalDeposits: wallet.transactions
                .filter(tx => tx.type === 'credit' && tx.status === 'success')
                .reduce((sum, tx) => sum + tx.amount, 0),
            totalWithdrawals: wallet.transactions
                .filter(tx => tx.type === 'debit' && tx.status === 'success')
                .reduce((sum, tx) => sum + tx.amount, 0),
            availableWithdrawal: wallet.balance,
            transactions: wallet.transactions.map(tx => ({
                _id: tx._id.toString(),
                date: tx.date,
                type: tx.type,
                amount: tx.amount,
                status: tx.status,
                description: tx.reason,
                orderId: tx.orderId ? tx.orderId.toString() : null
            }))
        });
    } catch (error) {
        console.error('error from addfunds to wallet', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const verifyAddFunds = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.session.userId;

        // Validate user
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        // Validate Razorpay details
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing Razorpay payment details' });
        }

        // Verify Razorpay signature
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Signature verification failed' });
        }

        // Find wallet
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
        }

        // Find pending transaction
        const pendingTx = wallet.transactions.find(tx => tx.status === 'pending' && tx.type === 'credit');
        if (!pendingTx) {
            return res.status(400).json({ success: false, message: 'No pending transaction found' });
        }

        // Update wallet balance and transaction status
        wallet.balance += pendingTx.amount;
        pendingTx.status = 'success';
        await wallet.save();

        // Return updated wallet data
        res.json({
            success: true,
               amount: pendingTx.amount,
            walletBalance: wallet.balance,
            totalDeposits: wallet.transactions
                .filter(tx => tx.type === 'credit' && tx.status === 'success')
                .reduce((sum, tx) => sum + tx.amount, 0),
            totalWithdrawals: wallet.transactions
                .filter(tx => tx.type === 'debit' && tx.status === 'success')
                .reduce((sum, tx) => sum + tx.amount, 0),
            availableWithdrawal: wallet.balance,
            transactions: wallet.transactions.map(tx => ({
                _id: tx._id.toString(),
                date: tx.date,
                type: tx.type,
                amount: tx.amount,
                status: tx.status,
                description: tx.reason,
                orderId: tx.orderId ? tx.orderId.toString() : null
            }))
        });
    } catch (error) {
        console.error('verify adding funds', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};






module.exports = {
  loadProductDetail,
  loadWallet,
  addFunds,
  verifyAddFunds,
 
};