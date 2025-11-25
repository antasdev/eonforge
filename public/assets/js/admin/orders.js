    const statusOrder = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
    
    document.addEventListener('DOMContentLoaded', function() {
      // Mobile sidebar toggle
      const sidebar = document.getElementById('sidebar');
      const sidebarOverlay = document.getElementById('sidebarOverlay');
      const openSidebarBtn = document.getElementById('openSidebar');
      const closeSidebarBtn = document.getElementById('closeSidebar');
      
      if (openSidebarBtn && sidebar && sidebarOverlay && closeSidebarBtn) {
        openSidebarBtn.addEventListener('click', () => {
          sidebar.classList.remove('-translate-x-full');
          sidebarOverlay.classList.add('active');
        });
        
        closeSidebarBtn.addEventListener('click', () => {
          sidebar.classList.add('-translate-x-full');
          sidebarOverlay.classList.remove('active');
        });
        
        sidebarOverlay.addEventListener('click', () => {
          sidebar.classList.add('-translate-x-full');
          sidebarOverlay.classList.remove('active');
        });
      } else {
        console.error('Sidebar elements not found');
      }

      // Filters
      function applyFilters() {
        const status = document.getElementById('status-filter').value;
        const sort = document.getElementById('sort-order').value;
        const search = document.querySelector('input[name="search"]').value;
        
        window.location.href = `/admin/orders?search=${encodeURIComponent(search)}&status=${status}&sort=${sort}`;
      }

      document.getElementById('status-filter').addEventListener('change', applyFilters);
      document.getElementById('sort-order').addEventListener('change', applyFilters);

      // Status Modal Event Listeners
      document.getElementById('close-status-modal').addEventListener('click', () => {
        document.getElementById('status-modal').classList.add('hidden');
      });

      document.getElementById('cancel-status-btn').addEventListener('click', () => {
        document.getElementById('status-modal').classList.add('hidden');
      });

      // Update Status
      document.getElementById('status-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = document.getElementById('order-id').value;
        const newStatus = document.getElementById('new-status').value;

        try {
          const res = await fetch(`/admin/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          const data = await res.json();
          if (data.success) {
            Swal.fire('Success', 'Order status updated!', 'success').then(() => {
              document.getElementById('status-modal').classList.add('hidden');
              location.reload();
            });
          } else {
            Swal.fire('Error', data.message || 'Failed to update status', 'error');
          }
        } catch (err) {
          Swal.fire('Error', 'Failed to update status', 'error');
        }
      });
    });

    // Open Status Modal
    function openStatusModal(orderId, currentStatus) {
      document.getElementById('status-modal').classList.remove('hidden');
      document.getElementById('order-id').value = orderId;
      const select=document.getElementById('new-status')  
      select.value=currentStatus;
      const currentIndex=statusOrder.indexOf(currentStatus);
      console.log('currentindex',currentIndex)
      for(let i=0;i<select.options.length;i++){
        const optionValue=select.options[i].value;
        const optionIndex=statusOrder.indexOf(optionValue)
        select.options[i].disabled= optionIndex !==currentIndex+1 && optionValue!=='Cancelled'
      }
    }

    function verifyReturn(orderId, returnReason) {
      Swal.fire({
        title: 'Verify Return Request',
        html: `<b>Reason:</b> ${returnReason}`,
        icon: 'question',
        showConfirmButton: true,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Approve',
        denyButtonText: 'Reject',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
          // Disable buttons to prevent multiple clicks
          Swal.showLoading();
          Swal.getConfirmButton().disabled = true;
          Swal.getDenyButton().disabled = true;
          Swal.getCancelButton().disabled = true;
        }
      }).then(async (result) => {
        if (result.isConfirmed || result.isDenied) {
          try {
            const res = await fetch(`/admin/orders/${orderId}/return`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approved: result.isConfirmed })
            });
            const data = await res.json();
            Swal.close();

            if (data.success) {
              const msg = result.isConfirmed
                ? 'Return approved and refunded!'
                : 'Return rejected!';
              Swal.fire('Success', msg, 'success').then(() => location.reload());
            } else {
              Swal.fire('Error', data.message || 'Failed to process return', 'error');
            }
          } catch (err) {
            Swal.fire('Error', 'Failed to process return', 'error');
          }
        } else {
          console.log('Modal dismissed without action');
        }
      });
    }
