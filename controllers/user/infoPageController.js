const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');

const about = async (req,res) => {
   try {
    const userId = req.session.userId;
    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findById(userId).lean();

    const cart=await Cart.findOne({userId})
                     let cartCount = 0;
                    
                    if (cart && cart.items) {
                      cartCount = cart.items.length;
                    }

    res.render('about',{
        user,
        cartCount
    })
   } catch (error) {
     res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
    });
   } 
};

const contact = async (req,res) => {
    try {
      const userId = req.session.userId;
    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findById(userId).lean();

    const cart=await Cart.findOne({userId})
                     let cartCount = 0;
                    
                    if (cart && cart.items) {
                      cartCount = cart.items.length;
                    }

        res.render('contact',{
            user,
            cartCount
        })
    } catch (error) {
       res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
    });
    }
    
}
const privacyPolicy = async (req,res) => {
    try {
       const userId = req.session.userId;
    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findById(userId).lean();

    const cart=await Cart.findOne({userId})
                     let cartCount = 0;
                    
                    if (cart && cart.items) {
                      cartCount = cart.items.length;
                    }

        res.render('privacyPolicy',{
            user,
            cartCount
        })
    } catch (error) {
        res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
    });
    }
    
}


module.exports={
    about,
    contact,
    privacyPolicy
}