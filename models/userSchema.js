const mongoose = require('mongoose')
const { Schema } = mongoose;


const userSchema = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    profileImage: {
        type: String,
        required: false,  
        default: ''       
    },

    phone: {
        type: String,
        unique: true,
        sparse: true,
        required:false
    },

    dob: {
        type: Date,
        required: false,
        default: null
    },

    bio: {
        type: String,
        maxlength: 300,
        default: ''
    },


    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    password: {
        type: String,
        required: false,
        unique: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: 'cart',
    }],
    walletBalance : {
        type : Number,
        default : 0,
    },
   
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: 'Order'
    }],
    createdOn: {
        type: Date,
        default: Date.now,
    },
    referralCode: {
        type: String,
        unique: true
    },
    redeemed: {
        type: Boolean,
        default: false 
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
         ref :"User",
         default: []
    }],
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: 'category',
        },
        brand: {
            type: String,
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }],


})



const User = mongoose.model('User', userSchema);

module.exports = User;