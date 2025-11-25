const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema');
const { generateReferralCode, applyReferral } =require('../../helpers/refferal');
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")
const pageNotFound = async (req, res) => {
  try {
    res.render('page-404')
  }
  catch (error) {
    res.redirect('/pageNotFound')
  }
}


//===========  home page  ============//


const loadHomePage = async (req, res) => {
  try {
    const userId = req.session.userId;
    const categories = await Category.find({ isListed: true });

    let productData = await Product.find({
      isBlocked: false,
      category: { $in: categories.map(c => c._id) },
      colorVariants: { $elemMatch: { stock: { $gt: 0 } } }
    })
      .populate('brand')
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();

    const brands = await Brand.find({ isBlocked: false }).limit(13).lean();
    const p = await Product.findOne().lean();

    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findOne({_id:userId,isBlocked:false})
  

    const cart = await Cart.findOne({ userId });


let cartCount = 0;

if (cart && cart.items) {
  cartCount = cart.items.length;
}

    return res.render('home', {
      isLoggedIn,
      user,
      products: productData,
      brands,
      categories,
      cartCount
    });
  } catch (err) {
    console.error("Error in loadHomePage:", err);
    return res.status(500).send("Internal Server Error");
  }
};

// =============  loading signup  ==============//

const loadSignup = async (req, res) => {
  try {
    return res.render('signup', { message: 'null', title: 'Sign Up - EON FORGE' });
  } catch (error) {
  
    res.status(500).send("Server Error ")
  }
}

//===========  otp generate  ===========//

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

//============   verification mail sending ============//

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLs: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    })



    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'verify your account',
      text: `Your OTP is ${otp}`,
      html: `<p>your OTP is:<strong> ${otp}</strong></p>`,
    })
  
    return info.accepted.length > 0


  } catch (error) {
    console.error('Error sending email', error);
    return false;
  }
}

//==========  load otp page  ==========//


const loadVerifyotp = async (req, res) => {
  try {
    res.render('verify-otp')

  } catch (error) {
    console.error('Error loading Otp page', error);
    res.redirect('/pageNotFound')
  }
}

//===========  verify signup  ===========//

const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword, referralCode } = req.body;


    if (password != confirmPassword) {
      return res.json({ success: false, message: "Password do not match" })
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      if (findUser.googleId) {
        return res.json({ success: false, message: 'This email is registered via Google. Please login using Google.' })
      } else {
        return res.json({ success: false, message: "User with this email already exists" })
      }

    };

     //  Referral validation 
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.json({ success: false, message: "Invalid referral code" });
      }
      if (referrer.email === email) {
        return res.json({ success: false, message: "You cannot use your own referral code" });
      }
    }

    const otp = generateOtp()
    const emailSent = await sendVerificationEmail(email, otp)
    if (!emailSent) {
      return res.json('email-error')
    }

    req.session.userOtp = otp;
    req.session.otpExpiresAt = Date.now() + 60 * 1000;
    req.session.userData = { lastName, firstName, email, password,referralCode }

 

    return res.json({ success: true, redirectUrl: "/verify-otp" })


  } catch (error) {
    console.error('Error for save user', error)
    res.status(500).send('Internal server Error')
  }

}

const securePassword = async (password) => {
  try {

    const passwordHash = await bcrypt.hash(password, 10)
    return passwordHash;

  } catch (error) {
    console.error("Error hashing password", error);
    throw error;
  }
}

//=========  verifying otp  ==========//

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body
 
    if (otp == req.session.userOtp) {
      const user = req.session.userData
      const passwordHash = await securePassword(user.password);
      const saveUserData = new User({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        password: passwordHash,
        referralCode: generateReferralCode(user.firstName, user.lastName)
      })
      await saveUserData.save();

      if (user.referralCode) {
  try {
    await applyReferral(saveUserData._id, user.referralCode);
  } catch (err) {
    console.error("Referral error:", err.message);
    // optional: show message but don't block signup
  }
}


      req.session.userId = saveUserData._id;

      req.session.save(() => {
        
        res.json({ success: true, redirectUrl: '/' });
      });

    } else {
      res.status(400).json({ success: false, message: "Invalid OTP Please try again" })
    }

  } catch (error) {
    console.error('Error verifying OTP', error);
    res.status(500).json({ success: false, message: 'An error occured' })
  }
}

const resendOtp = async (req, res) => {
  try {

    const userData = req.session.userData
   
    const otpExpiresAt = req.session.otpExpiresAt;
    if (!userData || !userData.email) {
      return res.status(400).json({ success: false, message: 'Email not found in session' })
    }

    if (otpExpiresAt && Date.now() < otpExpiresAt) {
      const secondsLeft = Math.ceil((otpExpiresAt - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${secondsLeft}s before resending OTP`
      });
    }




    const email = userData.email


    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
    
      res.status(200).json({ success: true, message: 'OTP Resend Succeccfully' })

    } else {
      res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again' })
    }
  } catch (error) {
    console.error('Error resending OTP', error);
    res.status(500).json({ success: false, message: 'Internal Server Error . Please try again' })

  }
}
//=========   LOAD LOGIN  ==========//

const loadLogin = async (req, res) => {
  try {
    if (!req.session.User) {
      return res.render('login', { success: false, message: "" });
    } else {
      return res.redirect('/');
    }
  } catch (error) {
    return res.redirect('/pageNotFound');
  }
};


//========== verifying login  ===========//
const login = async (req, res) => {
  try {

    const { email, password, googleId } = req.body;
    

    let findUser;
    if (googleId) {
      findUser = await User.findOne({ email })
      
      if (!findUser) {
        findUser = new User({ email: email, googleId: googleId, isBlocked: false })
    
        await findUser.save();
      }
      if (!findUser.googleId) {
        return res.json({ success: false, message: 'This email is registered using password. Please use normal login.' })
      }
      if (findUser.isBlocked) {
        return res.json({ success: false, message: 'User  is blocked by admin' })
      }

      req.session.userId = findUser._id;
      return res.json({ success: true, redirectUrl: '/' });
    } else {

      findUser = await User.findOne({ isAdmin: 0, email: email, isBlocked: false });
      if (!email || !password) {
        return res.json({ success: false, message: 'username and password are required.' })
      }
      if (!findUser) {
        return res.json({ success: false, message: 'Invalid email address' })
      }
      if (findUser.googleId) {
        return res.json({ success: false, message: 'This account is registered via Google. Please login using Google.' })
      }

      if (findUser.isBlocked) {
        return res.json({ success: false, message: 'User  is blocked by admin' })
      }
      const passwordMatch = await bcrypt.compare(password, findUser.password);
      if (!passwordMatch) {
        return res.json({ success: false, message: 'Password is incorrect' });
      }

      req.session.userId = findUser._id;
      return res.json({ success: true, redirectUrl: "/" })
    }

  } catch (error) {
    console.error('login error', error);
    res.json({ success: false, message: 'signin failed. Please try again later ' })
  }
}

//==========  FORGOT PASSWORD  ==========//

const logout = async (req, res) => {
  try {

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).render("pageNotFound", {
            message: "Failed to log you out. Please try again."
        });
      }

      res.clearCookie('connect.sid'); 
      res.redirect('/login');

    })
  } catch (error) {
    
    res.redirect('/pageNotFound')
  }
}


const loadShopPage = async (req, res) => {
  try {
    // Query parameters
    let search = req.query.search || '';
    let selectedBrands = req.query.brand || [];
    let selectedCategories = req.query.category || [];
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const sort = req.query.sort || 'featured';
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    const userId = req.session.userId;
    const isLoggedIn = !!userId;
    const user = isLoggedIn ? await User.findOne({_id:userId,isBlocked:false}) : null;
    let wishlistProductIds = [];
    if (isLoggedIn) {
      const wishlist = await Wishlist.findOne({ userId }).lean();
      if (wishlist) {
        wishlistProductIds = wishlist.products.map(item => item.productId.toString());
      }
    };
    let cartProduct=[];
    if(isLoggedIn){
      const existCart = await Cart.findOne({userId}).lean();
      if(existCart){
        cartProduct = existCart.items.map(item => item.productId.toString());
      }
    };

    // Ensure brands and categories are arrays
    if (!Array.isArray(selectedBrands)) selectedBrands = selectedBrands ? [selectedBrands] : [];
    if (!Array.isArray(selectedCategories)) selectedCategories = selectedCategories ? [selectedCategories] : [];

    // Fetch all brands and categories for the template
    const brands = await Brand.find({ isBlocked: false }).lean();
    const categories = await Category.find({ isListed: true }).lean();
   

    // Build query
    let query = { isBlocked: false, 'colorVariants.stock': { $gt: 0 } };
    if (search) {
      const brandIds = await Brand.find({ brandName: { $regex: search, $options: 'i' }, isBlocked: false }).distinct('_id');
      const categoryIds = await Category.find({ name: { $regex: search, $options: 'i' }, isListed: true }).distinct('_id');
      query.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { brand: { $in: brandIds } },
        { category: { $in: categoryIds } },
      ];
    }
    if (selectedBrands.length > 0) {
      const brandIds = await Brand.find({ brandName: { $in: selectedBrands }, isBlocked: false }).distinct('_id');
      if (brandIds.length > 0) {
        query.brand = { $in: brandIds };
      }
    }
    if (selectedCategories.length > 0) {
      const categoryIds = await Category.find({ _id: { $in: selectedCategories }, isListed: true }).distinct('_id');
      if (categoryIds.length > 0) {
        query.category = { $in: categoryIds };
      }
    }
    if (minPrice || maxPrice) {
      query['colorVariants.offerPrice'] = {};
      if (minPrice) query['colorVariants.offerPrice'].$gte = minPrice;
      if (maxPrice) query['colorVariants.offerPrice'].$lte = maxPrice;
    }

    // Sorting
    let sortOption = { createdAt: -1 }; // Default: featured (newest first)
    if (sort === 'price-low-high') sortOption = { 'colorVariants.offerPrice': 1 };
    if (sort === 'price-high-low') sortOption = { 'colorVariants.offerPrice': -1 };
    if (sort === 'name-a-z') sortOption = { productName: 1 };
    if (sort === 'name-z-a') sortOption = { productName: -1 };

    const products = await Product.find(query)
      .populate('brand')
      .populate('category')
      .sort(sortOption)
      .limit(limit)
      .skip(skip)
      .lean();
      // get variant id


   const filteredProducts = products.filter(product => {
  return product.brand && product.brand.isBlocked === false &&
         product.category && product.category.isListed === true;
}).map(product => {
  product.selectedVariant = product.colorVariants[0]; // first variant as default
  return product;
});
   
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);
    const cart = await Cart.findOne({ userId });


let cartCount = 0;

if (cart && cart.items) {
  cartCount = cart.items.length;
}
 
    res.render('shop', {
      cartCount,
      isLoggedIn,
      user,
      products: filteredProducts,
      brand: brands,
      category: categories,
      search,
      selectedBrands,
      selectedCategories,
      minPrice,
      maxPrice,
      sort, // Pass sort to the template
      totalPages,
      currentPage: page,
      totalProducts,
       wishlistProductIds,
       cartProduct,
      noResults: products.length === 0 && (search || selectedBrands.length > 0 || selectedCategories.length > 0 || minPrice || maxPrice) ? `No products found.` : null
    });
  } catch (error) {
    console.error('Error in shop route:', error);
    res.status(500).render('error', { message: 'An error occurred while loading the shop page.' });
  }
};
const filterProducts = async (req, res) => {
  try {
    const userId = req.session.userId;
    const isLoggedIn = !!userId;
    const user = isLoggedIn ? await User.findById(userId) : null;

    
    let wishlistProductIds = [];
    if (isLoggedIn) {
      const wishlist = await Wishlist.findOne({ userId }).lean();
      if (wishlist) {
        wishlistProductIds = wishlist.products.map(item => item.productId.toString());
      }
    };
    let cartProduct=[];
    if(isLoggedIn){
      const existCart = await Cart.findOne({userId}).lean();
      if(existCart){
        cartProduct = existCart.items.map(item=> item.productId.toString());
      }
    };
    
    // Query parameters
    const search = req.query.search || '';
    let selectedBrands = req.query.brand || [];
    let selectedCategories = req.query.category || [];
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const sort = req.query.sort || 'featured';
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
   



    // Ensure brands and categories are arrays
    if (!Array.isArray(selectedBrands)) selectedBrands = selectedBrands ? [selectedBrands] : [];
    if (!Array.isArray(selectedCategories)) selectedCategories = selectedCategories ? [selectedCategories] : [];

    // Build query
    const query = {
      isBlocked: false,
      'colorVariants.stock': { $gt: 0 }
    };

    if (selectedCategories.length > 0) {
      const findCategories = await Category.find({ _id: { $in: selectedCategories }, isListed: true }).distinct('_id');
      if (findCategories.length > 0) {
        query.category = { $in: findCategories };
      }
    }

    if (selectedBrands.length > 0) {
      const findBrands = await Brand.find({ brandName: { $in: selectedBrands }, isBlocked: false }).distinct('_id');
      if (findBrands.length > 0) {
        query.brand = { $in: findBrands };
      }
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { productName: regex },
        { brand: { $in: await Brand.find({ brandName: regex, isBlocked: false }).distinct('_id') } },
        { category: { $in: await Category.find({ name: regex, isListed: true }).distinct('_id') } }
      ];
    }



    if (minPrice || maxPrice) {
      query['colorVariants.offerPrice'] = {};
      if (minPrice) query['colorVariants.offerPrice'].$gte = minPrice;
      if (maxPrice) query['colorVariants.offerPrice'].$lte = maxPrice;
    }

    // Sorting
    let sortOption = { createdAt: -1 }; // Default: featured (newest first)
    if (sort === 'price-low-high') sortOption = { 'colorVariants.offerPrice': 1 };
    if (sort === 'price-high-low') sortOption = { 'colorVariants.offerPrice': -1 };
    if (sort === 'name-a-z') sortOption = { productName: 1 };
    if (sort === 'name-z-a') sortOption = { productName: -1 };

    // Fetch all categories and brands for template
    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({ isBlocked: false }).lean();

    // Fetch products
    const products = await Product.find(query)
      .populate('brand')
      .populate('category')
      .sort(sortOption)
      .limit(limit)
      .skip(skip)
      .lean();
// get variant id
products.forEach(product => {
  product.selectedVariant = product.colorVariants?.[0]; // pick the first variant
});

    const filteredProducts = products.filter(product => {
      const isValid = product.brand && !product.brand.isBlocked &&
        product.category && product.category.isListed &&
        !product.isBlocked &&
        product.colorVariants.length > 0 &&
        product.colorVariants.every(variant =>
          !variant.isBlocked &&
          variant.offerPrice >= minPrice &&
          variant.offerPrice <= maxPrice
        );

      return isValid;
    });





    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);


    
        const cart=await Cart.findOne({userId})
                         let cartCount = 0;
                        
                        if (cart && cart.items) {
                          cartCount = cart.items.length;
                        }

    res.render('shop', {
      user,
      cartCount,
      isLoggedIn,
      search,
      products: filteredProducts,
      brand: brands,
      category: categories,
      selectedBrands,
      selectedCategories,
      minPrice,
      maxPrice,
      sort,
      totalPages,
      currentPage: page,
      totalProducts,
       wishlistProductIds,
       cartProduct,
      noResults: products.length === 0 && (search || selectedCategories.length > 0 || selectedBrands.length > 0 || minPrice || maxPrice) ? `No products found.` : null
    });
  } catch (error) {
    console.error('Error in filterProducts:', error);
    res.redirect('/pageNotFound');
  }
};


module.exports = {
  loadHomePage,
  loadShopPage,
  filterProducts,
  loadSignup,
  pageNotFound,
  signup,
  loadVerifyotp,
  verifyOtp,
  loadLogin,
  login,
  resendOtp,
  logout

}