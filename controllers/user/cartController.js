// controllers/user/cartController.js
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema')
const Category=require('../../models/categorySchema')

const addToCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId, variantId } = req.body;

    if (!userId) return res.status(401).json({ message: 'Login required' });

    const user = await User.findById(userId);
    if (!user || user.isBlocked) {
      return res.status(403).json({ success: false, message: 'You are blocked from making purchases' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const selectedVariant = product.colorVariants.find(v => v._id.toString() === variantId);
    if (!selectedVariant) return res.status(400).json({ message: 'Invalid variant selected' });

    const stock = selectedVariant.stock;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], cartTotal: 0 });
    }

    const existingItem = cart.items.find(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    // ⭐ IF EXISTS → REMOVE PRODUCT
    if (existingItem) {
      cart.items = cart.items.filter(
        item => !(item.productId.toString() === productId && item.variantId.toString() === variantId)
      );

      cart.cartTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
      await cart.save();

      return res.status(200).json({
        message: 'Removed from cart',
        inCart: false,
        cartCount: cart.items.length
      });
    }

    // ⭐ IF NOT EXISTS → ADD PRODUCT
    const price = Number(selectedVariant.offerPrice ?? selectedVariant.regularPrice);
    const newItem = {
      productId,
      variantId,
      quantity: 1,
      price,
      totalPrice: price
    };

    cart.items.push(newItem);
    cart.cartTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    await cart.save();

    return res.status(200).json({
      message: 'Added to cart',
      inCart: true,
      cartCount: cart.items.length
    });

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const loadCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const cartData = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'brand', select: 'brandName' },
          { path: 'category', select: 'name offerPrice hasOffer isListed' }
        ]
      });
      // delivery fee
       const deliveryFee = 50;

    if (!cartData || !cartData.items.length) {
      
      return res.render('cart', { cartItems: [],deliveryFee });
    }

    const updatedCartItems = await Promise.all(
      cartData.items.map(async (item) => {
        const product = item.productId;
        const variant = product?.colorVariants.find(
          v => v._id.toString() === item.variantId.toString()
        );

        if (!product || !variant) {
          console.error(`Invalid product or variant for item: ${item._id}`);
          return null;
        }

        const isBlocked = product.isBlocked || variant.isBlocked;
           
      if (isBlocked) {
        await Cart.updateOne(
          { userId },
          { $pull: { items: { _id: item._id } } }
        );
       return null;
      }
             
 

        // Determine price
        let variantPrice = variant.regularPrice;
        if (variant.hasOffer && !isBlocked && variant.offerPrice !== null) {
          variantPrice = variant.offerPrice;
        }

        let categoryDiscountPrice = null;
        if (product.category?.hasOffer && product.category?.isListed && !isBlocked) {
          const discountPercent = product.category.offerPrice;
          categoryDiscountPrice = variant.regularPrice - (variant.regularPrice * discountPercent / 100);
        }

        const latestPrice = categoryDiscountPrice
          ? Math.min(categoryDiscountPrice, variantPrice)
          : variantPrice;

        
        let quantity = item.stock ?? 1;
    

        if (variant.stock < quantity) {
          quantity = variant.stock > 0 ? variant.stock : 0;

          // Update cart DB to match stock
          await Cart.updateOne(
            { userId, 'items._id': item._id },
            { $set: { 'items.$.quantity': quantity } }
          );

          console.warn(
            `Adjusted quantity for ${product.productName} (${variant.colorName}) — available stock: ${variant.stock}`
          );
        }

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
      })
    );

    const cartItems = updatedCartItems.filter(Boolean);
   

    res.render('cart', { cartItems, deliveryFee });

  } catch (error) {
    console.error('Cart page error:', error);
    res.status(500).send('Internal Server Error');
  }
};


const updateCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.userId;

   
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });
    if (!productId || !variantId || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Invalid input' });
    }
     // delivery fee
       const deliveryFee = 50;
       
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    

    const variant = product.colorVariants.find(v => v._id.toString() === variantId);
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
    

    const stock = variant.stock; 
    
    const cartLimit=3;
    if (quantity>cartLimit){
      return res.status(400).json({
        success:false,
        message:`You can only purchase up to 3 of this item`
      })
    }

    if (quantity > stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${stock} units of ${product.productName} (${variant.colorName}) available`
      });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const item = cart.items.find(
      i => i.productId.toString() === productId && i.variantId.toString() === variantId
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not in cart' });

   
    // Update cart item quantity and totalPrice
          // stock//
    item.stock = quantity;
    item.totalPrice = item.price * quantity;
    cart.cartTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

    await cart.save();

    res.json({
      success: true,
      message: 'Cart updated',
      stock: variant.stock ,
      deliveryFee
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.session.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(item => item._id.toString() !== itemId);
    if (cart.items.length === initialLength) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    cart.cartTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    await cart.save();

    res.json({ success: true, message: 'Item removed' });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};


const addWishlist = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.userId;


    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to manage wishlist' });
    }

    if (!variantId) {
      return res.status(400).json({ success: false, message: 'Variant ID is required' });
    }

    const productExists = await Product.findById(productId);
    if (!productExists) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let wishlist = await Wishlist.findOne({ userId });
    let action = '';

    if (!wishlist) {
   
      wishlist = await Wishlist.create({
        userId,
        products: [{ productId, variantId }],
      });
      action = 'added';
    } else {
      const alreadyExists = wishlist.products.find(
        p => p.productId.toString() === productId && p.variantId.toString() === variantId
      );

      if (alreadyExists) {
        // Remove it
        wishlist.products = wishlist.products.filter(
          p => !(p.productId.toString() === productId && p.variantId.toString() === variantId)
        );
        action = 'removed';
      } else {
        // Add it
        wishlist.products.push({ productId, variantId });
        action = 'added';
      }
      await wishlist.save();
    }

    return res.json({
      success: true,
      action,
      message: action === 'added' ? 'Added to wishlist' : 'Removed from wishlist',
    });

  } catch (error) {
    console.error('Add to wishlist error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};




const loadWishlist = async (req, res) => {
  try {
    
     const userId = req.session.userId;
    const isLoggedIn = !!userId;
    let user = null;
    if (isLoggedIn) user = await User.findById(userId).lean();

    if (!userId) return res.redirect('/login');

    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        populate: [{
          path: 'brand',
        },{path:'category',select:'name hasOffer offerPrice isListed'}]
      })
      .lean();
     

const wishlistItems= wishlist ? wishlist.products : []
//cart count
const cart=await Cart.findOne({userId})
let cartCount = 0;
     
     if (cart && cart.items) {
     cartCount = cart.items.length;
         }


    res.render('wishlist', {
      wishlistItems,
      user,
      cartCount
    });

  } catch (error) {
    
    res.status(500).render('500', { message: 'Something went wrong while loading wishlist' });
  }
};


const removeFromWishlist = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.userId;



    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login' });
    }

    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: 'Wishlist not found' });
    }

    // Filter out the product
    wishlist.products = wishlist.products.filter(
      item => item.variantId.toString() !== variantId
    );

    await wishlist.save();

    res.json({ success: true, message: 'Product removed from wishlist' });

  } catch (error) {
    console.error('Remove wishlist error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const addToCartFromWishlist = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
   
  

    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const variant = product.colorVariants.id(variantId);
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }

    const price = variant.offerPrice || variant.regularPrice;
    const totalPrice = price * 1; // Assuming quantity = 1

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check for duplicate product+variant
    const itemIndex = cart.items.findIndex(item =>
      item.productId.toString() === productId &&
      item.variantId.toString() === variantId
    );

    if (itemIndex > -1) {
      return res.status(400).json({ success: false, message: 'Product already in cart' });
    }

    cart.items.push({
      productId,
      variantId,
      quantity: 1,
      price,
      totalPrice
    });

    await cart.save();

    // Remove from wishlist
    await Wishlist.updateOne(
      { userId },
      { $pull: { products: { variantId } } }
    );
   
     let cartCount = 0;
     
     if (cart && cart.items) {
     cartCount = cart.items.length;
         }

    return res.json({ success: true, cartCount,message: 'Moved to cart and removed from wishlist' });

  } catch (error) {
    console.error('Add to cart from wishlist error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};





module.exports = {
  loadCart,
  addToCart,
  updateCart,
  removeFromCart,
  loadWishlist,
  addWishlist,
  addToCartFromWishlist,
  removeFromWishlist
};