const Order = require("../models/orderSchema");
const User = require('../models/userSchema');
const Category = require("../models/categorySchema");
const Product = require("../models/productSchema");
const Brand = require("../models/brandSchema");





const getDashboardMetrics = async (period = 'monthly', customStartDate = null, customEndDate = null) => {
  // Calculate date ranges
  const now = new Date();
  let startDate, endDate, prevStartDate, prevEndDate, groupBy, labels;

  if (customStartDate && customEndDate) {
    startDate = new Date(customStartDate);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(customEndDate);
    endDate.setHours(23, 59, 59, 999);
    prevStartDate = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    prevEndDate = new Date(startDate.getTime() - 1);
    prevEndDate.setHours(23, 59, 59, 999);
    groupBy = { $dayOfMonth: '$createdOn' }; // Default for custom range
    labels = Array.from(
      { length: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 },
      (_, i) => `Day ${i + 1}`
    );
  } else {
    if (period === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
      prevEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      groupBy = { $month: '$createdOn' };
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    } else if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      groupBy = { $dayOfMonth: '$createdOn' };
      labels = Array.from(
        { length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() },
        (_, i) => `Day ${i + 1}`
      );
    } else if (period === 'weekly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      prevStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
      prevEndDate.setHours(23, 59, 59, 999);
      groupBy = { $dayOfWeek: '$createdOn' };
      labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    } else if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
      prevEndDate.setHours(23, 59, 59, 999);
      groupBy = { $hour: '$createdOn' };
      labels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    }
  }

 

  // Helper function for aggregation with delivered items
  const aggregateDelivered = async (pipeline) => {
    return await Order.aggregate([
      { $match: { createdOn: { $gte: startDate, $lte: endDate } } },
      { $unwind: { path: '$orderItems', preserveNullAndEmptyArrays: true } },
      { $match: { 'orderItems.status': 'Delivered' } },
      ...pipeline
    ]);
  };

  // Total Sales and Sales Change
  const totalSalesResult = await aggregateDelivered([
    {
      $group: {
        _id: null,
        totalOrderAmount: {
          $sum: {
            $multiply: [
              { $max: [{ $subtract: ['$orderItems.price', '$orderItems.discount'] }, 0] },
              { $ifNull: ['$orderItems.stock', 1] }
            ]
          }
        }
      }
    }
  ]);

  const prevTotalSalesResult = await aggregateDelivered([
    {
      $match: { createdOn: { $gte: prevStartDate, $lte: prevEndDate } }
    },
    {
      $group: {
        _id: null,
        totalOrderAmount: {
          $sum: {
            $multiply: [
              { $max: [{ $subtract: ['$orderItems.price', '$orderItems.discount'] }, 0] },
              { $ifNull: ['$orderItems.stock', 1] }
            ]
          }
        }
      }
    }
  ]);

  const totalSales = totalSalesResult[0]?.totalOrderAmount || 0;
  const prevTotalSales = prevTotalSalesResult[0]?.totalOrderAmount || 0;
  const salesChange = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales * 100).toFixed(2) : totalSales > 0 ? 100 : 0;

  // New Users and Change
  const newUsersResult = await User.aggregate([
    { $match: { createdOn: { $gte: startDate, $lte: endDate } } },
    { $count: 'newUsersCount' }
  ]);
  const prevNewUsersResult = await User.aggregate([
    { $match: { createdOn: { $gte: prevStartDate, $lte: prevEndDate } } },
    { $count: 'newUsersCount' }
  ]);
  const newUsersCount = newUsersResult[0]?.newUsersCount || 0;
  const prevNewUsersCount = prevNewUsersResult[0]?.newUsersCount || 0;
  const newUsersChange = prevNewUsersCount > 0 ? ((newUsersCount - prevNewUsersCount) / prevNewUsersCount * 100).toFixed(2) : newUsersCount > 0 ? 100 : 0;

  // Products and Change
  const newProductsResult = await Product.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    { $count: 'totalProducts' }
  ]);
  const prevNewProductsResult = await Product.aggregate([
    { $match: { createdAt: { $gte: prevStartDate, $lte: prevEndDate } } },
    { $count: 'totalProducts' }
  ]);
  const totalProducts = newProductsResult[0]?.totalProducts || 0;
  const prevTotalProducts = prevNewProductsResult[0]?.totalProducts || 0;
  const productsChange = prevTotalProducts > 0 ? ((totalProducts - prevTotalProducts) / prevTotalProducts * 100).toFixed(2) : totalProducts > 0 ? 100 : 0;

  // Conversion Rate and Change
  const totalOrdersResult = await aggregateDelivered([{ $count: 'totalOrders' }]);
  const totalUsersResult = await User.aggregate([
    { $match: { createdOn: { $lte: endDate } } },
    { $count: 'totalUsers' }
  ]);
  const prevTotalOrdersResult = await aggregateDelivered([
    { $match: { createdOn: { $gte: prevStartDate, $lte: prevEndDate } } },
    { $count: 'totalOrders' }
  ]);
  const prevTotalUsersResult = await User.aggregate([
    { $match: { createdOn: { $lte: prevEndDate } } },
    { $count: 'totalUsers' }
  ]);

  const totalOrders = totalOrdersResult[0]?.totalOrders || 0;
  const totalUsers = totalUsersResult[0]?.totalUsers || 0;
  const conversionRate = totalUsers > 0 ? ((totalOrders / totalUsers) * 100).toFixed(2) : 0;
  const prevTotalOrders = prevTotalOrdersResult[0]?.totalOrders || 0;
  const prevTotalUsers = prevTotalUsersResult[0]?.totalUsers || 0;
  const prevConversionRate = prevTotalUsers > 0 ? ((prevTotalOrders / prevTotalUsers) * 100).toFixed(2) : 0;
  const conversionRateChange = prevConversionRate > 0 ? ((conversionRate - prevConversionRate) / prevConversionRate * 100).toFixed(2) : conversionRate > 0 ? 100 : 0;

  // Sales Chart Data
  const sales = await aggregateDelivered([
    { $group: { _id: groupBy, total: { $sum: { $multiply: [{ $max: [{ $subtract: ['$orderItems.price', '$orderItems.discount'] }, 0] }, { $ifNull: ['$orderItems.stock', 1] }] } } }},
    { $sort: { '_id': 1 } }
  ]);

  const salesData = labels.map((_, index) => {
    const sale = sales.find(s => s._id === (period === 'yearly' ? index + 1 : period === 'daily' ? index : index + 1));
    return sale ? sale.total : 0;
  });

  return {
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    totalSales,
    salesChange,
    newUsersCount,
    newUsersChange,
    totalProducts,
    productsChange,
    conversionRate,
    conversionRateChange,
    salesLabels: labels,
    salesData,
  };
};

module.exports=getDashboardMetrics