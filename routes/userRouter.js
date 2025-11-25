const express = require('express');
const router = express.Router();
const nocache = require('nocache');
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const cartController = require('../controllers/user/cartController');
const checkoutController=require('../controllers/user/checkoutController');
const orderController=require('../controllers/user/orderController');
const paymentController =require('../controllers/user/paymentController');
const infoPageController = require('../controllers/user/infoPageController');
const passport = require('passport');
const cloudinary = require('../config/cloudinary');
const uploads = require('../helpers/multer');
const { userAuth, isLogin} = require('../middlewares/auth');


// router.get('/pageNotFound', userController.pageNotFound);
router.get('/signup', isLogin, userController.loadSignup);
router.post('/signup', isLogin, userController.signup);
router.post('/verify-otp',isLogin, userController.verifyOtp)
router.get('/login',nocache(), isLogin, userController.loadLogin);
router.post('/login',nocache(), isLogin, userController.login)
router.get('/verify-otp',isLogin, userController.loadVerifyotp)
router.post('/resend-otp',isLogin, userController.resendOtp)


router.get('/auth/google',nocache(), isLogin, passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback',nocache(), isLogin,passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
 
  req.session.userId = req.user._id;

  res.redirect('/')
});
router.get('/logout', userController.logout)


//============ load home page/shop page =============//

router.get('/',  userController.loadHomePage);
router.get('/shop', userController.loadShopPage);
router.get('/filter', userController.filterProducts);

//===============info page details ============//
router.get('/about',infoPageController.about);
router.get('/contact',infoPageController.contact);
router.get('/privacyPolicy',infoPageController.privacyPolicy);




//=========== profile Managenent ============//

router.get('/forgot-password', isLogin, profileController.loadForgotPassword);
router.post('/forgot-password', isLogin, profileController.forgotPassword);
router.get('/forgotPassword-otp', isLogin, profileController.loadForgotPasswordOtp);
router.post('/forgotPassword-otp', isLogin, profileController.forgotPasswordOtp);
router.post('/forgotResend-otp', isLogin, profileController.forgotResendOtp);
router.get('/reset-password', isLogin, profileController.resetPassword);
router.patch('/reset-password', isLogin, profileController.updatePassword);

router.get('/profile', userAuth, profileController.userProfile)     //userAuth//
router.get('/editProfile', userAuth, profileController.loadEditProfile)
router.post('/editProfile', userAuth, uploads.single("profileImage"), profileController.editProfile)
router.get('/change-email', userAuth, profileController.changeEmail)
router.post('/change-email', userAuth, profileController.changeEmailvalid)
router.get('/change-email-otp', userAuth, profileController.loadChangeEmailOtp)
router.post('/change-email-otp', userAuth, profileController.changeEmailOtp)
router.get('/update-email', userAuth, profileController.loadUpdateEmail)
router.post('/update-email', userAuth, profileController.updateEmail)
router.get('/change-newEmail-otp',userAuth,profileController. loadChangeNewEmailOtp)
router.post('/change-newEmail-otp',userAuth,profileController.changeNewEmailOtp)
router.post('/change-password', userAuth, profileController.changePassword)



//=============  address management  ===============//

router.get('/add-address', userAuth, profileController.addAddress)
router.post('/add-address', userAuth, profileController.postAddAddress)
router.put('/update-address', userAuth, profileController.updateAddress)
router.delete('/delete-address', userAuth, profileController.deleteAddress)


//========== cart management  ==================//

router.get('/cart',userAuth, cartController.loadCart)
router.post('/addCart',userAuth, cartController.addToCart)
router.post('/update-cart',userAuth,cartController.updateCart)
router.post('/remove-from-cart', userAuth,cartController.removeFromCart);
//================  wishlist ==================//
router.get('/wishlist',userAuth,cartController.loadWishlist)
router.post('/addWishlist',userAuth,cartController.addWishlist)
router.post('/remove-from-wishlist',cartController.removeFromWishlist);
router.post('/wishlist-to-cart', cartController.addToCartFromWishlist);




//============= checkout management  ==============//
router.get('/checkout',userAuth,checkoutController.loadCheckout);
router.post('/checkout-address',userAuth, checkoutController.addAddress);
router.put('/checkout-edit-address', checkoutController.editAddress);
router.post('/checkout-delete-address', checkoutController.deleteAddress);
//  payment  //
router.post('/place-order',userAuth,checkoutController.placeOrder);
router.get('/place-order',userAuth,checkoutController.loadPlaceOrder);

// ========== Order management  ============ //
router.get('/order-details',userAuth,orderController.orderDetails)
router.get('/orders',userAuth,orderController.orders);
router.patch('/cancel-order-item/:orderId/:itemId',userAuth,orderController.cancelOrderItem)
router.post('/return-order-item',userAuth, orderController.returnOrderItem);

router.post('/cancel-order', orderController.cancelOrder);
router.post('/return-order', orderController.returnOrder);

router.get('/invoice',orderController.loadInvoice);
router.get('/download-invoice',orderController.downloadInvoice)





//=========== product detail page ============ //

router.get('/product-detail/:id', productController.loadProductDetail)

//================== wallet =====================//

router.get('/wallet',userAuth,productController.loadWallet)
router.post('/wallet/add-funds', userAuth,productController.addFunds);
router.post('/wallet/verify-add-funds',userAuth, productController.verifyAddFunds);


// ============ payment  ============= //

router.post('/payment/create-order',paymentController.createRazorpayOrder);
router.post('/payment/verify', paymentController.verifyAndPlaceOrder);
router.get('/payment-failure',userAuth,paymentController.paymentFailure)
router.post('/payment/retry-order',userAuth,paymentController.retryRazorpayOrder);


module.exports = router;