const User = require('../../models/userSchema');
const Order = require("../../models/orderSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
const getDashboardMetrics=require('../../helpers/getDashboardMetrics');
const generatePDFReport = require('../../helpers/generatePDFReport');
// const blobStream = require('blob-stream');
const moment = require('moment');
const bcrypt = require('bcrypt');





const pageError = async (req, res) => {
    try {
        res.render('pageError')
    } catch (error) {
        res.status(500).send('Critical error')

    }
};



const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/adminDashboard')
    } else {
        res.render('adminLogin', { message: null })
    }


}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true })
        if (!admin) {
            return res.status(401).json({ success: false, message: "Admin account not found" });
        }
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }
        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password)
            if (passwordMatch) {
                req.session.admin = admin._id
                req.session.admin = true;
                return res.json({ success: true, redirectUrl: '/admin/adminDashboard' })
            } else {
                return res.json({ message: "invalid password" })
            }
        } else {
            return res.json({ message: "Please enter  Email and Password " })
        }

    } catch (error) {
        res.json({ redirectUrl: '/admin/pageError' })
    }
}

const adminLogout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                return res.redirect('/admin/pageError');
                
            }
            return res.redirect('/admin/login')
        })
    } catch (error) {
        res.redirect("/admin/pageError")
    }
}





const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) return res.redirect('/admin/login');
    const metrics = await getDashboardMetrics('monthly');

    const topProducts = await Order.aggregate([
      { $unwind: { path: '$orderItems', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'orderItems.status': 'Delivered',
          createdOn: { $gte: metrics.startDate, $lte: metrics.endDate }
        }
      },
      {
        $group: {
          _id: '$orderItems.product',
          totalSold: { $sum: { $ifNull: ['$orderItems.stock', 1] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'productDetails.category',
          foreignField: '_id',
          as: 'categoryDetails'
        }
      },
      { $unwind: { path: '$categoryDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'brands',
          localField: 'productDetails.brand',
          foreignField: '_id',
          as: 'brandDetails'
        }
      },
      { $unwind: { path: '$brandDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          totalSold: 1,
          'productDetails.productName': 1,
          'productDetails.colorVariants': 1,
          'categoryDetails.name': 1,
          'brandDetails.brandName': 1
        }
      }
    ]);

    const topCategories = await Order.aggregate([
      { $unwind: { path: '$orderItems', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'orderItems.status': 'Delivered',
          createdOn: { $gte: metrics.startDate, $lte: metrics.endDate }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderItems.product',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$productDetails.category',
          totalSold: { $sum: { $ifNull: ['$orderItems.stock', 1] } },
          totalRevenue: {
            $sum: {
              $multiply: [
                { $max: [{ $subtract: ['$orderItems.price', '$orderItems.discount'] }, 0] },
                { $ifNull: ['$orderItems.stock', 1] }
              ]
            }
          }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryDetails'
        }
      },
      { $unwind: { path: '$categoryDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: '$categoryDetails.name',
          salesCount: '$totalSold',
          revenue: '$totalRevenue'
        }
      }
    ]);

    const topBrands = await Order.aggregate([
      { $unwind: { path: '$orderItems', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'orderItems.status': 'Delivered',
          createdOn: { $gte: metrics.startDate, $lte: metrics.endDate }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderItems.product',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$productDetails.brand',
          totalSold: { $sum: { $ifNull: ['$orderItems.stock', 1] } },
          totalRevenue: {
            $sum: {
              $multiply: [
                { $max: [{ $subtract: ['$orderItems.price', '$orderItems.discount'] }, 0] },
                { $ifNull: ['$orderItems.stock', 1] }
              ]
            }
          }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'brands',
          localField: '_id',
          foreignField: '_id',
          as: 'brandDetails'
        }
      },
      { $unwind: { path: '$brandDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: '$brandDetails.brandName',
          salesCount: '$totalSold',
          revenue: '$totalRevenue'
        }
      }
    ]);

    const ledgerEntries = [];
     // === 1. Overall Totals ===
    const revenueResult = await Order.aggregate([
      { $match: {status:{$in:['Delivered','Return Request','Rejected']} } }, { $unwind: '$orderItems' },
      {
        $group: {
          _id: null, totalOrderAmount:
          {
            $sum: { $multiply: [{ $add: ['$orderItems.price', '$orderItems.discount'] }, '$orderItems.stock'] }
          },
          discountResult:{
            $sum:{$multiply:['$orderItems.discount','$orderItems.stock']}
          },
          itemsSold:{$sum:'$orderItems.stock'}
        }
      }

    ]);
    const totalDiscount = revenueResult[0]?.discountResult || 0;
    const orderList = await Order.find({ status:{$in:['Delivered','Return Request','Rejected']}})
      .populate("userId", "firstName lastName email ")
      .sort({ createdOn: -1 })
      .select("orderId userId createdOn totalPrice totalAmount finalAmount status couponCode couponDiscount paymentMethod orderItems");

    const grossSales = orderList.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + b.price * b.stock, 0), 0);   
    const netRevenue = orderList.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + (b.price - b.discount) * b.stock, 0), 0);
   
    res.render('adminDashboard', {
      ...metrics,
      currentPage: 'dashboard',
      ledgerEntries,
      topProducts,
      topCategories,
      topBrands,
      revenueLabels: ['Net Revenue', 'Gross Sales', 'Discount'],
      revenueData: [netRevenue, grossSales, totalDiscount],
      period: 'monthly'
    });
  } catch (error) {
    console.error('loadDashboard error:', error);
    res.status(500).render('admin/pageError', { error });
  }
};

const getChartData = async (req, res) => {
  try {
    const { period, date } = req.query;

    if (!['yearly', 'monthly', 'weekly', 'daily'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }

    const metrics = await getDashboardMetrics(period, date ? date : null, date ? date : null);

    

    res.json({
      labels: metrics.salesLabels,
      values: metrics.salesData,
      totalSales: metrics.totalSales,
      salesChange: metrics.salesChange,
      newUsersCount: metrics.newUsersCount,
      newUsersChange: metrics.newUsersChange,
      totalProducts: metrics.totalProducts,
      productsChange: metrics.productsChange,
      conversionRate: metrics.conversionRate,
      conversionRateChange: metrics.conversionRateChange
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const generateLedger = async (req, res) => {
  try {
    const { startDate, endDate, period:reqPeriod } = req.body;
   
    const period = reqPeriod ;

 
    const metrics = (startDate && endDate)
      ? await getDashboardMetrics('custom', startDate, endDate)
      : await getDashboardMetrics(period);

    const generatedOn = new Date();

    const periodLabel = startDate && endDate
      ? 'CUSTOM'
      : period;


 
    const formatDate = (date) =>
      new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

   const orders = await Order.aggregate([
  { 
    $match: { 
      createdOn: { 
        $gte: metrics.startDate, 
        $lte: metrics.endDate 
      } 
    } 
  },
  { $unwind: { path: '$orderItems', preserveNullAndEmptyArrays: true } },
 //  Lookup Product Details
  {
    $lookup: {
      from: 'products',
      localField: 'orderItems.product',
      foreignField: '_id',
      as: 'productDetails'
    }
  },
  { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true } },
  //  Lookup User Details (this was missing)
  {
    $lookup: {
      from: 'users',          
      localField: 'userId', 
      foreignField: '_id',
      as: 'userDetails'
    }
  },
  { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
  // Group back order data
  {
    $group: {
      _id: '$_id',
      orderId: { $first: '$orderId' },
      createdOn: { $first: '$createdOn' },
      totalPrice: { $first: '$totalPrice' },
      finalAmount: { $first: '$finalAmount' },
      paymentMethod: { $first: '$paymentMethod' },
      status: { $first: '$status' },
      // Customer name (first + last)
      customerName: { 
        $first: { 
          $concat: [
            { $ifNull: ['$userDetails.firstName', ''] },
            ' ',
            { $ifNull: ['$userDetails.lastName', ''] }
          ]
        }
      },
      items: {
        $push: {
          productName: '$productDetails.productName',
          price: '$orderItems.price',
          discount: '$orderItems.discount',
          stock: { $ifNull: ['$orderItems.stock', 1] },
          itemTotal: {
            $multiply: [
              { $max: [{ $subtract: ['$orderItems.price', '$orderItems.discount'] }, 0] },
              { $ifNull: ['$orderItems.stock', 1] }
            ]
          }
        }
      }
    }
  },
  {
    $project: {
      orderId: 1,
      createdOn: 1,
      totalPrice: 1,
      finalAmount: 1,
      paymentMethod: 1,
      status: 1,
      customerName: 1, 
      items: 1
    }
  }
]);

    let groupByFormat;
    switch (period) {
      case 'yearly': groupByFormat = '%Y'; break;
      case 'monthly': groupByFormat = '%m-%Y'; break;
      case 'weekly': groupByFormat = '%Y-%U'; break;
      default: groupByFormat = '%d-%m-%Y'; 
    }

    const summaryData = await Order.aggregate([
      { $match: { createdOn: { $gte: metrics.startDate, $lte: metrics.endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: groupByFormat, date: '$createdOn' } },
          totalOrders: { $sum: 1 },
          paidOrders: {
            $sum: { $cond: [{ $in: ['$paymentMethod', ['Card', 'Wallet', 'UPI']] }, 1, 0] }
          },
          codOrders: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'COD'] }, 1, 0] }
          },
          refundedOrders: {
            $sum: { $cond: [{ $in: ['$status', ['Returned', 'Refunded']] }, 1, 0] }
          },
          totalRevenue: { $sum: '$finalAmount' }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const pdfConfig = {
      title: 'ORDER LEDGER REPORT',
      period: periodLabel,
      dateRange: {
        start: formatDate(metrics.startDate),
        end: formatDate(metrics.endDate),
      },
      generatedOn,
      sections: [
        {
          title: 'Executive Summary',
          type: 'content',
          content: summaryData.map(summary => ({
            period: summary._id,
            totalOrders: summary.totalOrders,
            paidOrders: summary.paidOrders,
            codOrders: summary.codOrders,
            refundedOrders: summary.refundedOrders,
            totalRevenue: summary.totalRevenue,
            successRate: summary.totalOrders
              ? ((summary.paidOrders / summary.totalOrders) * 100).toFixed(1)
              : 0
          }))
        },
        {
          title: 'Detailed Transaction Ledger',
          table: {
            headers: ['Order ID', 'Customer', 'Product', 'Qty', 'Payment', 'Status', 'Order Date'],
            headerBackgroundColor: '#565966ff',
            headerTextColor: '#2b2828ff',
            rows: orders.flatMap(order =>
              order.items.map(item => [
                order.orderId,
                order.customerName,
                item.productName || 'N/A',
                item.stock.toString(),
                order.paymentMethod,
                order.status,
                new Date(order.createdOn).toLocaleDateString('en-GB')
              ])
            )
          },
          headerFontSize: 8,
          rowFontSize: 7,
          tableWidth: 550,
          columnSpacing: 5
        }
      ]
    };

   
    const pdfBuffer = await generatePDFReport(pdfConfig);
    const filename = `ledger-${periodLabel}-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('generateLedger error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    getChartData,
    generateLedger,
    pageError,
    adminLogout
}


