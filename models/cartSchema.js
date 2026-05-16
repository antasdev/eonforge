const mongoose = require("mongoose")
const { Schema } = mongoose
const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        variantId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        stock: {
            type: Number,
            default: 1
        },

        status: {
            type: String,  
            enum: ["Available", "Blocked", "Out of Stock"],
            default: "Available"
        },
        cancellationReason: {
            type: String,
            default: "none"
        }

    }]

})


const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;