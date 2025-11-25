const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Order=require("../../models/orderSchema");
const Cart = require('../../models/cartSchema');
const nodemailer = require('nodemailer');
const bcrypt = require("bcrypt");
const session = require('express-session');
require('dotenv').config();

const loadForgotPassword = async (req, res) => {
  try {
    res.render('forgot-password');
  } catch (error) {
    console.error('Error loading forgot password:', error);
    res.redirect('/pageNotFound');
  }
};

function generateOtp() {
  const digits = '1234567890';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: `"Eon Forge" <${process.env.NODEMAILER_EMAIL}>`,
      to: email,
      subject: 'Your OTP for Password Reset',
      text: `Your OTP is ${otp}`,
      html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await User.findOne({ email });

    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.email = email;
        req.session.otp = otp;
        req.session.otpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
        req.session.resendOtpAllowedAt = Date.now() + 60 * 1000;
        return res.json({ success: true, redirectUrl: '/forgotPassword-otp' });
      } else {
        return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
      }
    } else {
      return res.json({ success: false, message: 'User with this email does not exist.' });
    }
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    return res.redirect('/pageNotFound');
  }
};

const loadForgotPasswordOtp = async (req, res) => {
  try {
    if (!req.session.email) {
      return res.redirect('/forgot-password');
    }
    res.render('forgotPass-otp');
  } catch (error) {
    console.error('Error loading OTP page:', error);
    res.redirect('/pageNotFound');
  }
};

const forgotPasswordOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.otp || !req.session.otpExpiresAt) {
      return res.json({ success: false, message: 'Session expired. Please start over.' });
    }

    if (Date.now() > req.session.otpExpiresAt) {
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (otp === req.session.otp) {
      return res.json({ success: true, redirectUrl: '/reset-password' });
    } else {
      return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.json({ success: false, message: 'An error occurred. Please try again.' });
  }
};

const forgotResendOtp = async (req, res) => {
  try {
    const email = req.session.email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Session expired. Please start over.' });
    }

    const resendOtpAllowedAt = req.session.resendOtpAllowedAt;
    if (resendOtpAllowedAt && Date.now() < resendOtpAllowedAt) {
      const secondsLeft = Math.ceil((resendOtpAllowedAtt - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${secondsLeft} seconds before requesting a new OTP.`
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      req.session.otp = otp;
      req.session.otpExpiresAt = Date.now() + 5 * 60 * 1000; // Set to 5 minutes
      return res.status(200).json({ success: true, message: 'OTP resent successfully.' });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Error resending OTP:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    if (!req.session.email) {
      return res.redirect('/forgot-password');
    }
    res.render('reset-password');
  } catch (error) {
    console.error('Error loading reset password:', error);
    res.redirect('/pageNotFound');
  }
};

const updatePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const email = req.session.email;

    if (!email) {
      return res.json({ success: false, message: 'Session expired. Please start over.' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ email }, { $set: { password: hashedPassword } });

    // Clear session
    req.session.destroy((err) => {
      if (err) console.error('Error destroying session:', err);
    });

    return res.json({ success: true, redirectUrl: '/login', message: 'Password updated successfully. Please login.' });
  } catch (error) {
    console.error('Error updating password:', error);
    return res.json({ success: false, message: 'An error occurred. Please try again.' });
  }
};

const userProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findById(userId).lean();
    const addressData = await Address.findOne({userId}).lean()
 const order=await Order.find({userId})
 .sort({ createdOn: -1 }) 
  .limit(3); 
 const orderCount = await Order.countDocuments({ userId });
 const totalSpent = order.reduce((sum, order) => sum + order.finalAmount, 0);
 const cart=await Cart.findOne({userId})
 // cart count
 let cartCount = 0;

if (cart && cart.items) {
  cartCount = cart.items.length;
}
 



    const walletBalance=100000
    res.render('profile', {
      user,
      isLoggedIn,
      cartCount,
      userAddress: addressData,
      order,
      orderCount,
      totalSpent,
      walletBalance
    })
  } catch (error) {
    res.redirect('/pageNotFound')
  }

}
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Load Edit Profile Page
const loadEditProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).lean();
    const  isGoogle=!!user.googleId
   
    if (!user) {
      return res.redirect('/login');
    }

     //cart count
         const cart=await Cart.findOne({userId})
         // cart count
         let cartCount = 0;
        
        if (cart && cart.items) {
          cartCount = cart.items.length;
        }


    res.render('editProfile', {
      user,
      cartCount,
      isLoggedIn: true,
      showchangepassword:!isGoogle,
    });
  } catch (error) {
    console.error('Error loading edit profile:', error);
    res.redirect('/pageNotFound');
  }
};

// Edit Profile
const editProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to update your profile.' });
    }



    const { firstName, lastName, email, phone, dob, bio } = req.body;

    // updating edit data
    const editData = {
      firstName: firstName?.trim() || '',
      lastName: lastName?.trim() || '',
      email: email?.trim() || '',
    };

    // Handle optional fields
    editData.phone = phone?.trim() || null;
    editData.bio = bio?.trim() || '';
    if (dob?.trim()) {
      const parsedDob = new Date(dob);
      editData.dob = isNaN(parsedDob) ? null : parsedDob;
    } else {
      editData.dob = null;
    }

    // Handle profile image
    if (req.file) {
      editData.profileImage = req.file.path;;
    }



    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: editData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    

    // Send email notification if email changed
    if (email?.trim() && email !== updatedUser.email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Profile Email Updated',
        text: `Your profile email has been updated to ${email}. If you did not make this change, please contact support.`,
      };
      await transporter.sendMail(mailOptions);
    }

   

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      redirect: '/profile?updated=' + Date.now(),
    });
  } catch (error) {
    console.error('Update Error:', error);
   
  }
};

const changeEmail = async (req, res) => {
  try {
    res.render('changeEmail')
  } catch (error) {
    console.error('Error loading enter email:', error);
    res.redirect('/pageNotFound');
  }

}

const changeEmailvalid = async (req, res) => {
  try {
    const { email } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) {

      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.otp = otp;
        req.session.userData = req.body;
        req.session.email = email;

        req.session.otpExpiresAt = Date.now() + 60 * 1000;
        return res.json({ success: true, redirectUrl: '/change-email-otp' });

      } else {
        return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
      }
    } else {
      return res.json({ success: false, message: 'User with this email does not exist.' });
    }
  } catch (error) {
    console.error('Error in change Email:', error);
    return res.redirect('/pageNotFound');
  }
}

const loadChangeEmailOtp = async (req, res) => {
  try {
    res.render('change-email-otp')
  } catch (error) {
    console.error('Error in change Email:', error);
    return res.redirect('/pageNotFound');
  }

}
const changeEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.otp || !req.session.otpExpiresAt) {
      return res.json({ success: false, message: 'Session expired. Please start over.' });
    }

    if (Date.now() > req.session.otpExpiresAt) {
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (otp === req.session.otp) {
      return res.json({ success: true, redirectUrl: '/update-email' });
    } else {
      return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
const loadUpdateEmail = async (req, res) => {
  try {
    if (req.session.email) {
      res.render('update-email');
    }
  } catch (error) {
    console.error('email updating field error', error)

  }

}

// 1. Send OTP to new email
const updateEmail = async (req, res) => {
  try {
    const newEmail = req.body.email?.trim(); // Trim here
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized access. Please log in." });
    }

    if (!newEmail) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "This email is already in use." });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(newEmail, otp);

    if (emailSent) {
      req.session.otp = otp;
      req.session.otpExpiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes
      req.session.newEmail = newEmail;

 
      return res.json({ success: true, redirectUrl: '/change-newEmail-otp' });
    } else {
      return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

  } catch (error) {
    console.error("Error in updateEmail:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};


// 2. Render OTP page for new email
const loadChangeNewEmailOtp = async (req, res) => {
  try {
    res.render('newEmail-otp'); // Ensure your EJS file is named correctly
  } catch (error) {
    console.error('Error loading change email OTP page:', error);
    return res.redirect('/pageNotFound');
  }
};


// 3. Verify OTP and update email in DB
const changeNewEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const { otp: sessionOtp, otpExpiresAt, newEmail, userId } = req.session;

    if (!sessionOtp || !otpExpiresAt || !newEmail || !userId) {
      return res.json({ success: false, message: 'Session expired. Please start over.' });
    }

    if (Date.now() > otpExpiresAt) {
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (otp !== sessionOtp) {
      return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }

    await User.findByIdAndUpdate(userId, { email: newEmail });
  
    // Clean up session
    req.session.otp = null;
    req.session.otpExpiresAt = null;
    req.session.newEmail = null;

    return res.json({ success: true, redirectUrl: '/editProfile', message: 'Email updated successfully.' });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};



const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;

    

    // Check if user is logged in
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized access." });
    }

    // Check new password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "New password and confirm password do not match." });
    }

    // Check password length
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.json({ success: true, message: "Password updated successfully." });

  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

const addAddress = async (req, res) => {

  try {
    const userId = req.session.userId;
    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findById(userId).lean();


    const address = await Address.findOne({ userId })

     //cart count
         const cart=await Cart.findOne({userId})
         // cart count
         let cartCount = 0;
        
        if (cart && cart.items) {
          cartCount = cart.items.length;
        }

    res.render('add-address', { user, isLoggedIn, address ,cartCount})

  } catch (error) {
    res.redirect('/pageNotFound')
  }

}

const postAddAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { type, street, city, state, pin, country, phone, isDefault } = req.body;

    // Validate required fields
    if (!type || !street || !city || !state || !pin || !country || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate address type
    if (!['home', 'work', 'other'].includes(type)) {
      return res.status(400).json({ message: 'Invalid address type' });
    }

    // Validate phone number (exactly 10 digits)
    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
    }

    const userAddress = await Address.findOne({ userId });
    const newAddress = { type, street, city, state, pin, country, phone, isDefault: isDefault === 'on' };
    

    if (userAddress) {
      userAddress.address.push(newAddress);
      await userAddress.save();
    } else {
      await Address.create({
        userId,
        address: [newAddress]
      });
    }

    res.status(200).json({ message: 'Address added successfully' });
  } catch (error) {
    console.error('address posting error:', error);
    res.status(500).json({ message: 'Failed to add address', error: error.message });
  }
};

const updateAddress = async (req, res) => {
  const userId = req.session.userId; 

  try {
    const { id, editType, street, city, state, pin, country, phone, isDefault } = req.body;


    if (!id || !editType) {
      return res.status(400).json({ message: 'id and editType are required' });
    }

   
    const user = await Address.findOne({ _id: id});
    if (!user) {
      return res.status(404).json({ message: 'User not found or unauthorized' });
    }

 
    const address = user.address.find(addr => addr.type === editType);
    if (!address) {
      return res.status(404).json({ message: `Address with type "${editType}" not found` });
    }

  

    
    const updateFields = {
      'address.$.street': street,
      'address.$.city': city,
      'address.$.state': state,
      'address.$.pin': pin,
      'address.$.country': country,
      'address.$.phone': phone,
      'address.$.isDefault': isDefault,
    };

    
    Object.keys(updateFields).forEach(key => {
      if (updateFields[key] === undefined) {
        delete updateFields[key];
      }
    });

    
    const updatedUser = await Address.findOneAndUpdate(
      { _id: id, 'address._id': address._id },
      { $set: updateFields },
      { new: true } 
    );

    if (!updatedUser) {
      return res.status(500).json({ message: 'Failed to update address' });
    }

    res.status(200).json({ message: 'Address updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error in updateAddress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
 const deleteAddress = async (req, res) => {
    try {
        const { userId ,addressId} = req.body; 
        const sessionUserId = req.session.userId; 

       
      
        const updatedUser = await Address.findOneAndUpdate(
            { _id: userId },
            { $pull: { address: { _id: addressId } } },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ message: 'User or address not found' });
        }

        res.status(200).json({ message: 'Address deleted successfully', user: updatedUser });
    } catch (error) {
        console.error('Error in deleteAddress:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


module.exports = {
  loadForgotPassword,
  forgotPassword,
  loadForgotPasswordOtp,
  forgotPasswordOtp,
  resetPassword,
  forgotResendOtp,
  updatePassword,
  userProfile,
  loadEditProfile,
  editProfile,
  changeEmail,
  changeEmailvalid,
  loadChangeEmailOtp,
  changeEmailOtp,
  loadUpdateEmail,
  updateEmail,
  loadChangeNewEmailOtp,
  changeNewEmailOtp,
  changePassword,
  addAddress,
  postAddAddress,
  updateAddress,
  deleteAddress
};