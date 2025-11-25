const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet=require('../../models/walletSchema')
const Razorpay = require('razorpay');
const calculateItemRefund = require('../../helpers/calculateItemRefund');
const crypto = require('crypto');

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const loadOrders = async (req, res) => {
  try {
    const { search = '', status = '', sort = 'desc', page = 1, limit = 10 } = req.query;

    let query = {};
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    if(status=='all')query={};

    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const returnRequests = await Order.countDocuments({ status: 'Return Request' });

    const sortOption = sort === 'asc' ? { createdOn: 1 } : { createdOn: -1 };

    const orders = await Order.find(query)
      .populate('userId')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const revenueData = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } }
    ]);
    const totalRevenue = revenueData[0]?.total || 0;

    res.render('orders', {
      orders,
      currentPage: parseInt(page),
      totalPages,
      totalOrders,
      pendingOrders,
      totalRevenue,
      returnRequests,
      search,
      status,
      sort,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


const loadOrderDetail = async (req, res) => {
  try {
    const orderId = req.params.id;

    // Fetch order and populate required fields
    const order = await Order.findById(orderId)
      .populate('userId')
      .populate('orderItems.product')
      .lean();

    if (!order) return res.render('pageError');

    // Convert variantId and colorVariants._id to strings for EJS matching
    order.orderItems.forEach(item => {
      item.variantId = item.variantId?.toString();
      item.product?.colorVariants?.forEach(variant => {
        variant._id = variant._id.toString();
      });
    });

    // Determine final status based on priority
    const priority = ["Pending","Processing", "Shipped", "Delivered", "Return Request", "Returned", "Cancelled", "Rejected"];
    const statusRank = {};
    priority.forEach((s, i) => statusRank[s] = i);

    let finalStatus = order.orderItems[0]?.status || "Processing";
    order.orderItems.forEach(item => {
      if (statusRank[item.status] < statusRank[finalStatus]) {
        finalStatus = item.status;
      }
    });

    // Update the order.status in DB only if it's not already set and not in terminal states
    const terminalStatuses = ["Return Request", "Returned", "Rejected", "Cancelled", "Delivered"];
    if (!terminalStatuses.includes(order.status) && finalStatus !== order.status) {
      await Order.findByIdAndUpdate(order._id, { status: finalStatus });
      order.status = finalStatus; // Update local copy too for rendering
    }
order.paymentStatus = order.paymentStatus || 'Pending';


    res.render('order-list', { order });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};




const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;


  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status;

    if (Array.isArray(order.orderItems)) {
      order.orderItems.forEach((item, index) => {
        if (item.status !== 'Cancelled'&& item.status !=='Returned'&& item.status !=='Rejected') {
          item.status = status;
        }
      });
    }
if (order.paymentMethod.toLowerCase() === 'cod' && order.status=== 'Delivered') {
    order.paymentStatus = 'Paid';
    
}

    await order.save(); 

    res.json({ success: true, message: 'Order status updated successfully' });

  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const verifyReturnRequest = async (req, res) => {
  const { orderId } = req.params;
  const { approved } = req.body;

  

  try {
    const order = await Order.findOne({ orderId });
 

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (approved) {
  // Check if order is eligible for refund
  if (order.refunded) {
    return res.status(400).json({ success: false, message: 'Order already refunded' });
  }

  if (order.paymentStatus !== 'Paid') {
    return res.status(400).json({ success: false, message: 'Order payment not completed' });
  }
  // Refund logic
          const refundedPrice=[]

        const returnedItems = order.orderItems.filter((item)=>item.status=="Returned");
        const nonReturnedItems = order.orderItems.filter((item)=>item.status!=="Returned");
         

        if (returnedItems && returnedItems.length > 0){
            for(const item of returnedItems){
               
                const refunded=calculateItemRefund(item,order.totalPrice,order.couponDiscount)
                refundedPrice.push(refunded)
            }
        }
       
         const itemRefund=refundedPrice.reduce((a,b)=>a+b,0)
        
        let refundAmount=0;
          if (returnedItems && returnedItems.length > 0){

         refundAmount = order.finalAmount-itemRefund; 
         
         }else{
          refundAmount = order.finalAmount; 

         }
     

        if (!refundAmount || isNaN(refundAmount) || refundAmount <= 0) {
           return res.status(400).json({ success: false, message: 'Invalid refund amount calculated' });
         }

  // Update order status
  order.status = 'Returned';
  order.returnStatus = 'Approved';
  order.orderItems.forEach(item => {
            item.status='Returned'
            item.returnStatus = 'Approved';
            
        });
  order.refunded = true;

  // Find or create user wallet
  let wallet = await Wallet.findOne({ userId: order.userId });
  if (!wallet) {
    wallet = new Wallet({ userId: order.userId, balance: 0, transactions: [] });
  }

  
    
  let refundStatus = 'success';

  if (order.paymentMethod !== 'cod' && order.razorpayPaymentId) {
    // Check Razorpay refund status before attempting refund
    try {
      const payment = await razorpayInstance.payments.fetch(order.razorpayPaymentId);
      if (payment.status === 'refunded' || payment.amount_refunded >= payment.amount) {
        // Update database to reflect Razorpay's state
        order.refunded = true;
        order.paymentStatus = 'Refunded';
        await order.save();
        return res.status(400).json({ success: false, message: 'Payment already fully refunded according to Razorpay' });
      }

      // Process Razorpay refund
      const refund = await razorpayInstance.payments.refund(order.razorpayPaymentId, {
        amount: Math.round(refundAmount * 100), // Convert to paise
        speed: 'normal',
        receipt: `refund_${order.orderId}_${Date.now()}`
      });
 
    } catch (refundError) {
      console.error('Razorpay refund error:', refundError);
      if (refundError.statusCode === 400 && refundError.error.description.includes('fully refunded already')) {
        // Handle case where Razorpay indicates the payment is already refunded
        order.refunded = true;
        await order.save();
        return res.status(400).json({ success: false, message: 'Payment already fully refunded' });
      }
      refundStatus = 'failed';
      return res.status(500).json({ success: false, message: 'Failed to process Razorpay refund', error: refundError });
    }
  }

  // Update wallet balance and add transaction
  wallet.balance += refundAmount;
  wallet.transactions.push({
    type: 'credit',
    amount: refundAmount,
    reason: `Refund for order ${order.orderId}`,
    status: refundStatus,
    orderId: order._id,
    date: new Date()
  });

  await wallet.save();
  order.paymentStatus = 'Refunded';
  await order.save();

  res.json({ success: true, message: 'Return approved and refund processed' });
} else {
      order.returnStatus = 'Rejected';
      order.status = 'Rejected';
       order.orderItems.forEach(item => {
            item.status='Rejected'
            item.returnStatus = 'Rejected';
            
        });
      order.returnReason = req.body.returnReason || 'Return request rejected by admin';
      await order.save();
      res.json({ success: true, message: 'Return rejected' });
    }
  } catch (err) {
    console.error('Return verification error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


const verifyItemReturnRequest = async (req, res) => {
  const { orderId, itemId } = req.params;
  const { approved } = req.body;

  try {
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.orderItems.find(i => i.variantId.toString() === itemId.toString());
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

    if (approved) {
      item.status = 'Returned';
      item.refunded = true;

      // --- Coupon handling ---
      let refundAmount =calculateItemRefund(item,order.totalPrice,order.couponDiscount)


      // --- Wallet refund ---
      let wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) {
        wallet = new Wallet({ userId: order.userId, balance: 0, transactions: [] });
      }

      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        reason: `Refund for returned item ${item._id} in order ${order.orderId}`,
        status: 'success',
        orderId: order._id,
        itemId: item._id,
        date: new Date()
      });
      await wallet.save();

      // --- If all items returned or cancelled, reset coupon usage ---
      const allReturnedOrCancelled = order.orderItems.every(
        i => i.status === 'Returned' || i.status === 'Cancelled'
      );

 

    } else {
      item.status = 'Rejected';
    }

    await order.save();

    res.json({
      success: true,
      message: approved
        ? 'Item return approved & refund credited to wallet'
        : 'Item return rejected'
    });

  } catch (err) {
    console.error('Return verification error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};






module.exports = {
    loadOrders,
    loadOrderDetail,
    updateOrderStatus,
    verifyReturnRequest,
    verifyItemReturnRequest,
   

}