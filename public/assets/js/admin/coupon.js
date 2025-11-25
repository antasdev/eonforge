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

      function applyFilters(){
        const status = document.getElementById('isActive-filter').value;
        const sort = document.getElementById('sort-order').value;
         const search = document.querySelector('input[name="search"]').value;
        window.location.href = `/admin/coupon?search=${encodeURIComponent(search)}&status=${status}&sort=${sort}`;
      }

      document.getElementById('isActive-filter').addEventListener('change',applyFilters);
      document.getElementById('sort-order').addEventListener('change',applyFilters);

      // Initialize Inline Validation
      addInlineValidation('create');
      addInlineValidation('edit');
      document.getElementById('create-coupon-form').addEventListener('submit', createCoupon);
      document.getElementById('edit-coupon-form').addEventListener('submit', updateCoupon);
    });

    // Modal Functions
    function openCreateCouponModal() {
      document.getElementById('create-coupon-modal').classList.remove('hidden');
      clearFormErrors('create');
    }

    function closeCreateCouponModal() {
      document.getElementById('create-coupon-form').reset();
      clearFormErrors('create');
      document.getElementById('create-coupon-modal').classList.add('hidden');
    }

    function openEditCouponModal(id, code, discountType, discountValue, minimumPurchaseAmount, usageLimit, expiryDate, isActive, description) {
      document.getElementById('edit-coupon-id').value = id;
      document.getElementById('edit-code').value = code;
      document.getElementById('edit-discount-type').value = discountType;
      document.getElementById('edit-discount-value').value = discountValue;
      document.getElementById('edit-minimum-purchase').value = minimumPurchaseAmount;
      document.getElementById('edit-usage-limit').value = usageLimit;
      document.getElementById('edit-expiry-date').value = expiryDate;
      document.getElementById('edit-is-active').checked = isActive === 'true';
      document.getElementById('edit-description').value = description;
      clearFormErrors('edit');
      document.getElementById('edit-coupon-modal').classList.remove('hidden');
    }

    function closeEditCouponModal() {
      document.getElementById('edit-coupon-form').reset();
      clearFormErrors('edit');
      document.getElementById('edit-coupon-modal').classList.add('hidden');
    }

    // Validation Functions
    function showFieldError(input, errorElement, message = 'This field is required') {
      input.classList.add('error');
      errorElement.classList.remove('hidden');
      errorElement.textContent = message;
    }

    function hideFieldError(input, errorElement) {
      input.classList.remove('error');
      errorElement.classList.add('hidden');
    }

    function clearFormErrors(formPrefix) {
      document.querySelectorAll(`#${formPrefix}-coupon-form .input-field`).forEach(input => input.classList.remove('error'));
      document.querySelectorAll(`#${formPrefix}-coupon-form .form-error`).forEach(error => error.classList.add('hidden'));
    }

    function validateCreateForm() {
      let isValid = true;
      const fields = [
        { id: 'create-code', validate: value => /^[A-Za-z]{3}\d{4}$/.test(value), message: 'Coupon code must be 3 letters followed by 4 numbers (e.g., ABC1234)' },
        { id: 'create-discount-type', validate: value => ['Percentage', 'Flat'].includes(value), message: 'Select a valid discount type' },
        { id: 'create-discount-value', validate: (value, form) => {
            const num = parseFloat(value);
            const discountType = form.querySelector('#create-discount-type').value;
            return !isNaN(num) && num >= 0 && (discountType !== 'Percentage' || num <= 100);
          }, message: 'Enter a valid discount value (0-100 for Percentage)' },
        { id: 'create-usage-limit', validate: value => !isNaN(parseInt(value)) && parseInt(value) >= 1, message: 'Enter a valid usage limit (at least 1)' },
        { id: 'create-expiry-date', validate: value => {
            const date = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return !isNaN(date) && date >= today;
          }, message: 'Enter a valid future or current date' },
        { id: 'create-minimum-purchase', validate: value => !value || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0), message: 'Enter a valid amount (0 or greater)' }
      ];

      const form = document.getElementById('create-coupon-form');
      fields.forEach(({ id, validate, message }) => {
        const input = document.getElementById(id);
        const error = document.getElementById(`${id}-error`);
        const value = input.value.trim();
        if (!value || !validate(value, form)) {
          showFieldError(input, error, message);
          isValid = false;
        } else {
          hideFieldError(input, error);
        }
      });

      return isValid;
    }

    function validateEditForm() {
      let isValid = true;
      const fields = [
        { id: 'edit-discount-type', validate: value => ['Percentage', 'Flat'].includes(value), message: 'Select a valid discount type' },
        { id: 'edit-discount-value', validate: (value, form) => {
            const num = parseFloat(value);
            const discountType = form.querySelector('#edit-discount-type').value;
            return !isNaN(num) && num >= 0 && (discountType !== 'Percentage' || num <= 100);
          }, message: 'Enter a valid discount value (0-100 for Percentage)' },
        { id: 'edit-usage-limit', validate: value => !isNaN(parseInt(value)) && parseInt(value) >= 1, message: 'Enter a valid usage limit (at least 1)' },
        { id: 'edit-expiry-date', validate: value => {
            const date = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return !isNaN(date) && date >= today;
          }, message: 'Enter a valid future or current date' },
        { id: 'edit-minimum-purchase', validate: value => !value || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0), message: 'Enter a valid amount (0 or greater)' }
      ];

      const form = document.getElementById('edit-coupon-form');
      fields.forEach(({ id, validate, message }) => {
        const input = document.getElementById(id);
        const error = document.getElementById(`${id}-error`);
        const value = input.value.trim();
        if (!value || !validate(value, form)) {
          showFieldError(input, error, message);
          isValid = false;
        } else {
          hideFieldError(input, error);
        }
      });

      return isValid;
    }

    function addInlineValidation(formPrefix) {
      const fields = [
        ...(formPrefix === 'create' ? [
          { id: `${formPrefix}-code`, validate: value => /^[A-Za-z]{3}\d{4}$/.test(value), message: 'Coupon code must be 3 letters followed by 4 numbers (e.g., ABC1234)' }
        ] : []),
        { id: `${formPrefix}-discount-type`, validate: value => ['Percentage', 'Flat'].includes(value), message: 'Select a valid discount type' },
        { id: `${formPrefix}-discount-value`, validate: (value, form) => {
            const num = parseFloat(value);
            const discountType = form.querySelector(`#${formPrefix}-discount-type`).value;
            return !isNaN(num) && num >= 0 && (discountType !== 'Percentage' || num <= 100);
          }, message: 'Enter a valid discount value (0-100 for Percentage)' },
        { id: `${formPrefix}-usage-limit`, validate: value => !isNaN(parseInt(value)) && parseInt(value) >= 1, message: 'Enter a valid usage limit (at least 1)' },
        { id: `${formPrefix}-expiry-date`, validate: value => {
            const date = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return !isNaN(date) && date >= today;
          }, message: 'Enter a valid future or current date' },
        { id: `${formPrefix}-minimum-purchase`, validate: value => !value || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0), message: 'Enter a valid amount (0 or greater)' }
      ];

      fields.forEach(({ id, validate, message }) => {
        const input = document.getElementById(id);
        const error = document.getElementById(`${id}-error`);
        input.addEventListener('input', () => {
          const value = input.value.trim();
          if (!value || !validate(value, document.getElementById(`${formPrefix}-coupon-form`))) {
            showFieldError(input, error, message);
          } else {
            hideFieldError(input, error);
          }
        });
        input.addEventListener('blur', () => {
          const value = input.value.trim();
          if (!value || !validate(value, document.getElementById(`${formPrefix}-coupon-form`))) {
            showFieldError(input, error, message);
          } else {
            hideFieldError(input, error);
          }
        });
      });
    }

    // Fetch Functions
    async function createCoupon(event) {
      event.preventDefault();
      if (!validateCreateForm()) return;

      const form = document.getElementById('create-coupon-form');
      const submitButton = document.getElementById('create-submit-button');
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

      const formData = new FormData(form);
      const couponData = {
        code: formData.get('code'),
        discountType: formData.get('discountType'),
        discountValue: parseFloat(formData.get('discountValue')),
        minimumPurchaseAmount: formData.get('minimumPurchaseAmount') ? parseFloat(formData.get('minimumPurchaseAmount')) : null,
        usageLimit: parseInt(formData.get('usageLimit')),
        expiryDate: new Date(formData.get('expiryDate')),
        isActive: formData.get('isActive') === 'on',
        description: formData.get('description') || null
      };

      try {
        const response = await fetch('/admin/coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(couponData)
        });
        const result = await response.json();
        if (response.ok) {
          Swal.fire({
            title: 'Success',
            text: 'Coupon created successfully!',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
            position: 'center',
            timerProgressBar:true
          });
          closeCreateCouponModal();
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          Swal.fire('Error', result.message || 'Failed to create coupon', 'error');
        }
      } catch (error) {
        Swal.fire('Error', 'An error occurred while creating the coupon', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Create';
      }
    }

    async function updateCoupon(event) {
      event.preventDefault();
      if (!validateEditForm()) return;

      const form = document.getElementById('edit-coupon-form');
      const submitButton = document.getElementById('edit-submit-button');
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

      const formData = new FormData(form);
      const couponData = {
        id:formData.get('couponId'),
        code: formData.get('code'),
        discountType: formData.get('discountType'),
        discountValue: parseFloat(formData.get('discountValue')),
        minimumPurchaseAmount: formData.get('minimumPurchaseAmount') ? parseFloat(formData.get('minimumPurchaseAmount')) : null,
        usageLimit: parseInt(formData.get('usageLimit')),
        expiryDate: new Date(formData.get('expiryDate')),
        isActive: formData.get('isActive') === 'on',
        description: formData.get('description') || null
      };
      console.log(couponData)
      try {
        const response = await fetch(`/admin/coupon`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(couponData)
        });
        const result = await response.json();
        if (response.ok) {
          Swal.fire({
            title: 'Success',
            text: 'Coupon updated successfully!',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
          });
          closeEditCouponModal();
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          Swal.fire('Error', result.message || 'Failed to update coupon', 'error');
        }
      } catch (error) {
        Swal.fire('Error', 'An error occurred while updating the coupon', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Update';
      }
    }

    async function deleteCoupon(couponId) {
      const result = await Swal.fire({
        title: 'Are you sure?',
        text: 'This action cannot be undone!',
        icon: 'warning',
        showCancelButton: true,
        toast:true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete it!'
      });

      if (result.isConfirmed) {
        try {
          const response = await fetch(`/admin/coupon/${couponId}`, {
            method: 'DELETE'
          });
          const result = await response.json();
          if (response.ok) {
            Swal.fire({
              title: 'Deleted',
              text: 'Coupon deleted successfully!',
              icon: 'success',
              timer: 2000,
              toast:true,
              position:'top-end',
              showConfirmButton: false,
            });
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          } else {
            Swal.fire('Error', result.message || 'Failed to delete coupon', 'error');
          }
        } catch (error) {
          Swal.fire('Error', 'An error occurred while deleting the coupon', 'error');
        }
      }
    }
