   document.addEventListener('DOMContentLoaded', () => {
      // Sidebar functionality
      const sidebar = document.getElementById('sidebar');
      const sidebarOverlay = document.getElementById('sidebarOverlay');
      const openSidebarBtn = document.getElementById('openSidebar');
      const closeSidebarBtn = document.getElementById('closeSidebar');
      
      function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
      
      function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
      }
      
      if (openSidebarBtn && sidebar && sidebarOverlay && closeSidebarBtn) {
        openSidebarBtn.addEventListener('click', openSidebar);
        closeSidebarBtn.addEventListener('click', closeSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
      } else {
        console.error('Sidebar elements not found');
      }
      
      // Close sidebar when clicking on a link (for mobile)
      const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
      sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
          if (window.innerWidth < 1024) {
            closeSidebar();
          }
        });
      });

      // Sales report functionality
      const reportPeriod = document.getElementById('report-period');
      const statusFilter = document.getElementById('status-filter');
      const customDateRange = document.getElementById('custom-date-range');
      const startDate = document.getElementById('start-date');
      const endDate = document.getElementById('end-date');
      const generateReportBtn = document.getElementById('generate-report');
      const downloadPdfBtn = document.getElementById('download-pdf');
      const downloadExcelBtn = document.getElementById('download-excel');
      const salesTableBody = document.getElementById('sales-table-body');
      
      // Set max attribute for start and end date inputs to today
      const today = new Date().toISOString().split('T')[0];
      startDate.setAttribute('max', today);
      endDate.setAttribute('max', today);

      // Set initial min attribute for end-date based on start-date
      if (startDate.value) {
        endDate.setAttribute('min', startDate.value);
      }

      // Update end-date's min attribute when start-date changes
      startDate.addEventListener('change', () => {
        endDate.setAttribute('min', startDate.value);
        // If end-date is before start-date, reset it to start-date
        if (endDate.value && new Date(endDate.value) < new Date(startDate.value)) {
          endDate.value = startDate.value;
        }
      });

      // Toggle custom date range visibility
      reportPeriod.addEventListener('change', () => {
        customDateRange.classList.toggle('hidden', reportPeriod.value !== 'custom');
        // Ensure end-date min is updated when custom range is selected
        if (reportPeriod.value === 'custom' && startDate.value) {
          endDate.setAttribute('min', startDate.value);
        }
      });

      // Generate report on button click
      generateReportBtn.addEventListener('click', async () => {
        const period = reportPeriod.value;
        const status = statusFilter.value;
        const params = new URLSearchParams({ period, status });
        

        if (period === 'custom') {
          const start = startDate.value;
          const end = endDate.value;

          if (!start || !end) {
            Swal.fire({
              icon: 'error',
              title: 'Invalid Input',
              text: 'Please select both start and end dates.',
              confirmButtonColor: '#4361ee',
              confirmButtonText: 'OK',
            });
            return;
          }
          if (new Date(start) > new Date(end)) {
            Swal.fire({
              icon: 'error',
              title: 'Invalid Date Range',
              text: 'Start date cannot be after end date.',
              confirmButtonColor: '#4361ee',
              confirmButtonText: 'OK',
            });
            return;
          }

          params.append('startDate', start);
          params.append('endDate', end);
        }

        try {
          // Show loading state
          Swal.fire({
            title: 'Generating Report',
            text: 'Please wait...',
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          const response = await fetch(`/admin/sales-report/filter?${params.toString()}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch sales report');
          }

          const data = await response.json();

          // Update summary cards
          document.getElementById('total-orders').textContent = data.totalSalesCount || '0';
          document.getElementById('total-items-sold').textContent = data.totalItemsSold || '0';
          document.getElementById('gross-sales').textContent = (data.grossSales || 0).toFixed(2);
          document.getElementById('total-discount').textContent = (data.totalDiscount || 0).toFixed(2);
          document.getElementById('net-revenue').textContent = (data.netRevenue || 0).toFixed(2);

          // Update sales table
          salesTableBody.innerHTML = '';

          if (data.salesData && data.salesData.length > 0) {
            data.salesData.forEach(sale => {
              const row = document.createElement('tr');
              row.classList.add('hover:bg-gray-50');
              row.innerHTML = `
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">#ORD${sale.orderId.slice(1,8)}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${sale.date}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${sale.customerName}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">₹${sale.orderAmount.toFixed(2)}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">₹${sale.discount.toFixed(2)}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">₹${sale.couponDiscount || '0.00'}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">₹${sale.finalAmount || 'N/A'}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${sale.paymentMethod || 'N/A'}</td>
                <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${sale.status || 'N/A'}</td>
              `;
              salesTableBody.appendChild(row);
            });
          } else {
            salesTableBody.innerHTML = `
              <tr>
                <td colspan="9" class="px-4 py-3 text-center text-gray-500">
                  No sales data available for the selected period.
                </td>
              </tr>
            `;
          }

          Swal.fire({
            icon: 'success',
            title: 'Report Generated',
            text: 'Sales report has been successfully updated.',
            confirmButtonColor: '#4361ee',
            confirmButtonText: 'OK',
            timer: 2000,
            timerProgressBar: true,
          });
        } catch (error) {
          console.error('Error generating report:', error);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'An error occurred while generating the report. Please try again.',
            confirmButtonColor: '#4361ee',
            confirmButtonText: 'OK',
          });
        }
      });

      // Download PDF
      downloadPdfBtn.addEventListener('click', async () => {
        const period = reportPeriod.value;
        const status = statusFilter.value;
        const params = new URLSearchParams({ period, status });

        if (period === 'custom') {
          const start = startDate.value;
          const end = endDate.value;
          if (!start || !end || new Date(start) > new Date(end)) {
            Swal.fire({
              icon: 'error',
              title: 'Invalid Date Range',
              text: 'Please select a valid date range for download.',
              confirmButtonColor: '#4361ee',
              confirmButtonText: 'OK',
            });
            return;
          }
          params.append('startDate', start);
          params.append('endDate', end);
        }

        Swal.fire({
          title: 'Preparing PDF',
          text: 'Your download will start shortly...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        window.location.href = `/admin/sales-report/download/pdf?${params.toString()}`;
        Swal.close();
      });

      // Download Excel
      downloadExcelBtn.addEventListener('click', async () => {
        const period = reportPeriod.value;
        const status = statusFilter.value;
        const params = new URLSearchParams({ period, status });

        if (period === 'custom') {
          const start = startDate.value;
          const end = endDate.value;
          if (!start || !end || new Date(start) > new Date(end)) {
            Swal.fire({
              icon: 'error',
              title: 'Invalid Date Range',
              text: 'Please select a valid date range for download.',
              confirmButtonColor: '#4361ee',
              confirmButtonText: 'OK',
            });
            return;
          }
          params.append('startDate', start);
          params.append('endDate', end);
        }

        Swal.fire({
          title: 'Preparing Excel',
          text: 'Your download will start shortly...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        window.location.href = `/admin/sales-report/download/excel?${params.toString()}`;
        Swal.close();
      });
    });