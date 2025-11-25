const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const loadSalesReport = async (req, res) => {
  try {
    // === 1. Overall Totals ===
    const totalSalesCount = await Order.countDocuments({ status:{$in:['Delivered','Return Request','Rejected']}});

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
    const totalOrderAmount = revenueResult[0]?.totalOrderAmount || 0;
    const totalItemsSold=revenueResult[0]?.itemsSold ||0;
    


    



    // === 2. Order-wise Details ===
    const orderList = await Order.find({ status:{$in:['Delivered','Return Request','Rejected']}})
      .populate("userId", "firstName lastName email ")
      .sort({ createdOn: -1 })
      .select("orderId userId createdOn totalPrice totalAmount finalAmount status couponCode couponDiscount paymentMethod orderItems");

       const grossSales = orderList.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + b.price * b.stock, 0), 0);
    
    const netRevenue = orderList.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + (b.price - b.discount) * b.stock, 0), 0);
  

    // Format data for report
    const formattedOrders = orderList.map(order => ({
      orderId: order.orderId.slice(1, 8),
      status:order.status,
      customer: order.userId ? `${order.userId.firstName} ${order.userId.lastName}` : "Guest",
      date: order.createdOn ? order.createdOn.toLocaleDateString("en-IN") : "N/A",
      orderAmount: order.orderItems.reduce((a, b) => a + ((b.price + b.discount) * b.stock), 0),
      discount: order.orderItems.reduce((a, b) => {
        return a + (b.discount * b.stock)
      }, 0),
      paymentMethod: order.paymentMethod.toUpperCase(),
      couponDiscount: order.couponDiscount || 0,
      finalAmount: order.finalAmount || 0
    }));

   

    // === 3. Prepare Sales Data ===
    const salesData = {
      grossSales ,
      netRevenue,
      totalSalesCount,
      totalOrderAmount,
      totalDiscount,
      totalItemsSold,
      orders: formattedOrders
    };

    res.render("salesReport", { salesData });

  } catch (error) {
    
    res.status(500).send("Error loading sales report");
  }
};

const filterSalesReport=async (req,res) => {
   try {
        
     const { period, startDate, endDate,status } = req.query;
  
    let matchQuery = {}
    const statusMap={
       delivered: ["Delivered"],
       returnRequest: ["Return Request"],
       rejected: ["Rejected"],
       all: ["Delivered", "Return Request", "Rejected"]
         }

     
    // Build query
      matchQuery = { status:{ $in: statusMap[status] || statusMap.all }};
       
     const now = new Date();

if (period === 'custom' && startDate && endDate) {
  matchQuery.createdOn = {
    $gte: new Date(startDate),
    $lte: new Date(endDate)
  };

} else if (period === 'daily') {
  const start = new Date(now.setHours(0, 0, 0, 0)); // start of today
  const end = new Date(now.setHours(23, 59, 59, 999)); // end of today
  matchQuery.createdOn = { $gte: start, $lte: end };

} else if (period === 'weekly') {
  const start = new Date();
  start.setDate(now.getDate() - now.getDay()); // start of week (Sunday)
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setDate(start.getDate() + 6); // end of week (Saturday)
  end.setHours(23, 59, 59, 999);
  matchQuery.createdOn = { $gte: start, $lte: end };

} else if (period === 'monthly') {
  const start = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of month
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // last day of month
  matchQuery.createdOn = { $gte: start, $lte: end };

} else if (period === 'yearly') {
  const start = new Date(now.getFullYear(), 0, 1); // Jan 1
  const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // Dec 31
  matchQuery.createdOn = { $gte: start, $lte: end };
}


    
    const orders = await Order.find(matchQuery)
      .populate('userId')
      .lean();

       const grossSales = orders.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + b.price * b.stock, 0), 0);
       const netRevenue = orders.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + (b.price - b.discount) * b.stock, 0), 0);
   
    // Calculate summary
    const totalSalesCount = orders.length;
    const totalItemsSold = orders.reduce((sum, order) => {
      return sum + order.orderItems.reduce((a, b) => a + b.stock, 0);
    }, 0);
    const totalOrderAmount = orders.reduce((sum, order) => {
      return sum + order.orderItems.reduce((a, b) => a + (b.price + b.discount) * b.stock, 0);
    }, 0);
    const totalDiscount = orders.reduce((sum, order) => {
      return sum + order.orderItems.reduce((a, b) => a + b.discount * b.stock, 0) + (order.couponDiscount || 0);
    }, 0);

    // Format orders for table
    const salesData = orders.map(order => ({
      orderId: order.orderId,
      status:order.status,
      customerName: order.userId ? `${order.userId.firstName} ${order.userId.lastName}` : 'Guest',
      date: order.createdOn.toLocaleDateString(),
      orderAmount:  order.orderItems.reduce((a, b) => a + ((b.price + b.discount) * b.stock), 0),
      discount: order.orderItems.reduce((a, b) => {
        return a + (b.discount * b.stock)
      }, 0),
      paymentMethod: order.paymentMethod.toUpperCase(),
      couponDiscount: order.couponDiscount || 0,
      finalAmount: order.finalAmount || 0
    }));
   

    res.json({
      grossSales,
      netRevenue,
      totalSalesCount,
      totalItemsSold,
      totalOrderAmount,
      totalDiscount,
      salesData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }  
}

const downloadSalesReport = async (req, res) => {
  try {
    const { type } = req.params;   
    const { period, startDate, endDate,status } = req.query;
     let matchQuery = {}
    const statusMap={
       delivered: ["Delivered"],
       returnRequest: ["Return Request"],
       rejected: ["Rejected"],
       all: ["Delivered", "Return Request", "Rejected"]
         }

         
    // Build query
      matchQuery = { status:{ $in: statusMap[status] || statusMap.all }};

    const now = new Date();

    if (period === 'custom' && startDate && endDate) {
      matchQuery.createdOn = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (period === 'daily') {
      const start = new Date(now.setHours(0, 0, 0, 0));
      const end = new Date(now.setHours(23, 59, 59, 999));
      matchQuery.createdOn = { $gte: start, $lte: end };
    } else if (period === 'weekly') {
      const start = new Date();
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      matchQuery.createdOn = { $gte: start, $lte: end };
    } else if (period === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      matchQuery.createdOn = { $gte: start, $lte: end };
    } else if (period === 'yearly') {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      matchQuery.createdOn = { $gte: start, $lte: end };
    }

    // Fetch orders
    const orders = await Order.find(matchQuery).populate('userId').lean();

    // Format data
    const salesData = orders.map(order => ({
      orderId: order.orderId,
      customerName: order.userId ? `${order.userId.firstName} ${order.userId.lastName}` : 'Guest',
      date: order.createdOn,
      orderAmount:  order.orderItems.reduce((a, b) => a + ((b.price + b.discount) * b.stock), 0),
      discount: order.orderItems.reduce((a, b) => a + b.discount * b.stock, 0),
      couponCode: order.couponDiscount || '0.00',
      finalAmount: order.finalAmount || 0,
      paymentMethod: order.paymentMethod || 'N/A'
    }));

    // Calculate summary metrics
    const totalOrders = orders.length;
    const totalItemsSold = orders.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + b.stock, 0), 0);
    const grossSales = orders.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + ((b.price + b.discount) * b.stock), 0),0)
    const totalDiscount = orders.reduce((sum, order) => sum + order.orderItems.reduce((a, b) => a + b.discount * b.stock, 0), 0);
    const netRevenue = orders.reduce((sum, order) => sum + order.finalAmount,0);

    if (type === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      res.setHeader('Content-Disposition', 'attachment; filename="sales_report.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);

      // Header
      doc.fontSize(20).fillColor('#4361ee').text('Eon Forge - Sales Report', { align: 'center' });
      doc.fontSize(12).fillColor('black').text(
        `Period: ${period === 'custom' ? `${startDate} to ${endDate}` : period.charAt(0).toUpperCase() + period.slice(1)}`,
        { align: 'center' }
      );
      doc.fontSize(12).fillColor('black').text(
        `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        { align: 'center' }
      );

      doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")}`, { align: 'center' });
      doc.moveDown(2);

      // Summary Table
      const summaryTop = 100;
      let y = summaryTop;
      const summaryHeaders = ['Total Items Sold','Total Orders', 'Gross Sales', 'Total Discount', 'Net Revenue'];
      const summaryData = [
        totalItemsSold.toString(),
        totalOrders.toString(),
        `₹${grossSales.toFixed(2)}`,
        `₹${totalDiscount.toFixed(2)}`,
        `₹${netRevenue.toFixed(2)}`
      ];
      const summaryColumnWidths = [110, 110, 110, 110, 110 ];

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#4361ee');
      doc.text('Summary', 30, y, { align: 'left' });
      y += 20;

      doc.fontSize(10).font('Helvetica-Bold').fillColor('black');
      let x = doc.page.margins.left;
      summaryHeaders.forEach((header, i) => {
        doc.text(header, x + 5, y + 5, { width: summaryColumnWidths[i], align: 'left' });
        doc.rect(x, y, summaryColumnWidths[i], 20).stroke();
        x += summaryColumnWidths[i];
      });
      y += 20;

      doc.fontSize(9).font('Helvetica');
      x = doc.page.margins.left;
      summaryData.forEach((data, i) => {
        doc.text(data, x + 5, y + 5, { width: summaryColumnWidths[i] - 10, align: 'left', ellipsis: true });
        doc.rect(x, y, summaryColumnWidths[i], 20).stroke();
        x += summaryColumnWidths[i];
      });
      y += 30;

      // Main Table
      const tableTop = y;
      const headers = [
        'Order ID',
        'Customer',
        'Date',
        'Order\nAmount',
        'Discount',
        'Coupon',
        'Final\nAmount',
        'Payment\n Method'
      ];
      const columnWidths = [120, 80, 60, 60, 60, 50, 60, 60];

      doc.fontSize(10).font('Helvetica-Bold');
      x = doc.page.margins.left;
      headers.forEach((header, i) => {
        doc.text(header, x + 5, y + 5, { width: columnWidths[i], align: 'left' });
        doc.rect(x, y, columnWidths[i], 25).stroke();
        x += columnWidths[i];
      });
      y += 25;

      doc.fontSize(9).font('Helvetica');
      salesData.forEach((sale, index) => {
        x = doc.page.margins.left;
        const row = [
         ` ORD${sale.orderId.slice(1,8)}`,
          sale.customerName,
          new Date(sale.date).toLocaleDateString("en-IN"),
          `₹${sale.orderAmount.toFixed(2)}`,
          `₹${sale.discount.toFixed(2)}`,
          sale.couponCode || '—',
          `₹${sale.finalAmount.toFixed(2)}`,
          sale.paymentMethod
        ];

        row.forEach((data, i) => {
          doc.text(data.toString(), x + 5, y + 5, { width: columnWidths[i] - 10, ellipsis: true });
          doc.rect(x, y, columnWidths[i], 25).stroke();
          x += columnWidths[i];
        });
        y += 25;

        if (y > doc.page.height - 50) {
          doc.addPage();
          y = tableTop;
          doc.fontSize(10).font('Helvetica-Bold');
          x = doc.page.margins.left;
          headers.forEach((header, i) => {
            doc.text(header, x + 5, y + 5, { width: columnWidths[i], align: 'left' });
            doc.rect(x, y, columnWidths[i], 25).stroke();
            x += columnWidths[i];
          });
          y += 25;
          doc.fontSize(9).font('Helvetica');
        }
      });

      // Footer
      doc.fontSize(8).font('Helvetica');
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 1; i <= pageCount; i++) {
        doc.switchToPage(i - 1);
        doc.text(`Page ${i} of ${pageCount}`, doc.page.width - 100, doc.page.height - 50, { align: 'right' });
      }

      doc.end();
    } else if (type === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 15 },
        { header: 'Customer', key: 'customerName', width: 25 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Order Amount', key: 'orderAmount', width: 15 },
        { header: 'Discount', key: 'discount', width: 15 },
        { header: 'Coupon', key: 'couponCode', width: 15 },
        { header: 'Final Amount', key: 'finalAmount', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 },
      ];

      salesData.forEach(sale => worksheet.addRow(sale));

      res.setHeader('Content-Disposition', 'attachment; filename="sales_report.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.status(400).json({ error: 'Invalid type parameter' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
};

module.exports = {
  loadSalesReport,
  filterSalesReport,
  downloadSalesReport
};
