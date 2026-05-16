    let currentInput = null;
    let cropper = null;
    let currentFile = null;
    let currentVariantEntry = null;
    const wrap = document.getElementById("cropper-wrapper");
    const imgTag = document.getElementById("cropper-image");

    // Mobile sidebar toggle
    document.addEventListener('DOMContentLoaded', function() {
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
      }
    });

    // Toggle variants display
    function toggleVariants(productId) {
      const variantRows = document.querySelectorAll(`[id^="variant-row-${productId}"]`);
      const toggleBtn = document.getElementById(`toggle-btn-${productId}`);
      const icon = toggleBtn.querySelector('i');
      
      variantRows.forEach((row) => row.classList.toggle("hidden"));
      
      if (variantRows[0].classList.contains("hidden")) {
        icon.className = "fas fa-chevron-right text-xs";
      } else {
        icon.className = "fas fa-chevron-down text-xs";
      }
    }

    // Toggle product status
    async function toggleProductStatus(productId, isBlocked) {
      const action = isBlocked === 'true' ? 'unblock' : 'block';
      
      try {
        const res = await fetch(`/admin/products/${productId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isBlocked: action === 'block' })
        });
        const data = await res.json();
        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: `Product ${action}ed`,
            text: `Product ${action}ed successfully.`,
            timer: 2000,
            showConfirmButton: false
          }).then(() => {
            location.reload();
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: data.message || `Failed to ${action} product.`
          });
        }
      } catch (err) {
        console.error("Error toggling product status:", err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Something went wrong while toggling product status.'
        });
      }
    }

    // Toggle variant status
    async function toggleVariantStatus(productId, variantId, isBlocked) {
      const action = isBlocked === 'true' ? 'unblock' : 'block';
      try {
        const endpoint = `/admin/products/${productId}/variants/${variantId}/status`;
        const response = await fetch(endpoint, {
          method: "PATCH",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isBlocked: action === 'block' })
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: `Variant ${action}ed`,
            text: `Variant ${action}ed successfully.`,
            timer: 2000,
            showConfirmButton: false
          }).then(() => {
            location.reload();
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: data.message || `Failed to ${action} variant.`
          });
        }
      } catch (err) {
        console.error("Error toggling variant status:", err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Something went wrong while toggling variant status.'
        });
      }
    }

    // Image cropping functionality
    function hookCropperOn(input, variantEntry) {
      input.addEventListener("change", (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        if (!file.type.startsWith('image/')) {
          variantEntry.querySelector(`.image-error`).textContent = "Please select a valid image file.";
          variantEntry.querySelector(`.image-error`).classList.remove("hidden");
          e.target.value = "";
          return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
          variantEntry.querySelector(`.image-error`).textContent = "Image size must be less than 5MB.";
          variantEntry.querySelector(`.image-error`).classList.remove("hidden");
          e.target.value = "";
          return;
        }
        
        const existingImages = variantEntry.querySelector('.variant-image-preview-container').querySelectorAll('img').length;
        if (existingImages >= 4) {
          variantEntry.querySelector(`.image-error`).textContent = "Maximum 4 images allowed per variant.";
          variantEntry.querySelector(`.image-error`).classList.remove("hidden");
          e.target.value = "";
          return;
        }
        
        currentInput = e.target;
        currentFile = file;
        currentVariantEntry = variantEntry;
        processImage();
      });
    }

    function processImage() {
      if (!currentFile) return;
      
      imgTag.src = URL.createObjectURL(currentFile);
      wrap.classList.remove("hidden");
      if (cropper) cropper.destroy();
      cropper = new Cropper(imgTag, {
        viewMode: 2,
        aspectRatio: 1,
        responsive: true,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
      });
    }

    function updateImageCounter(variantEntry) {
      const container = variantEntry.querySelector('.variant-image-preview-container');
      const imageCount = container.querySelectorAll('img').length;
      const counter = variantEntry.querySelector('.image-counter');
      
      if (counter) {
        counter.textContent = `${imageCount}/4 Images`;
        counter.className = `image-counter ${imageCount >= 3 && imageCount <= 4 ? 'valid' : 'invalid'}`;
      }
      
      const errorDiv = variantEntry.querySelector('.image-error');
      if (imageCount < 3) {
        errorDiv.textContent = "Please add between 3-4 images for this variant.";
        errorDiv.classList.remove("hidden");
      } else {
        errorDiv.classList.add("hidden");
      }
    }

    // Remove image function
    window.removeImage = function(button, variantIndex) {
      const imageDiv = button.parentElement;
      const variantEntry = imageDiv.closest('.variant-entry');
      
      if (variantEntry.uploadedFiles) {
        const imgIndex = Array.from(imageDiv.parentElement.children).indexOf(imageDiv);
        const existingImagesCount = variantEntry.querySelectorAll('input[name*="existingImage"]').length;
        
        if (imgIndex >= existingImagesCount) {
          const newImageIndex = imgIndex - existingImagesCount;
          if (newImageIndex >= 0 && newImageIndex < variantEntry.uploadedFiles.length) {
            variantEntry.uploadedFiles.splice(newImageIndex, 1);
          }
        }
      }
      
      imageDiv.remove();
      updateImageCounter(variantEntry);
    };

    // Modal functionality
    document.addEventListener("DOMContentLoaded", function () {
      const addProductBtn = document.getElementById("add-product-btn");
      const productModal = document.getElementById("product-modal");
      const closeModalBtn = document.getElementById("close-modal");
      const cancelBtn = document.getElementById("cancel-btn");
      const productForm = document.getElementById("product-form");
      const modalTitle = document.getElementById("modal-title");
      const productIdInput = document.getElementById("product-id");
      const variantIdInput = document.getElementById("variant-id");
      const submitBtnText = document.getElementById("submit-btn-text");
      const submitBtn = document.getElementById("submit-btn");
      const colorVariantsContainer = document.getElementById("color-variants-container");
      const addColorVariantBtn = document.getElementById("add-color-variant");

      // Add color variant function
      function addColorVariant(variant = { _id: "", colorName: "", colorValue: "#000000", regularPrice: "", discountPercentage: "", stock: "", productImage: [], hasOffer: false }) {
        const index = colorVariantsContainer.children.length;
        const variantEntry = document.createElement("div");
        variantEntry.className = "variant-entry relative border p-4 rounded-md mb-4";
        
        const images = Array.isArray(variant.productImage) ? variant.productImage : variant.productImage ? [variant.productImage] : [];
        const imageCount = images.length;
        
        variantEntry.uploadedFiles = [];
        
        variantEntry.innerHTML = `
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-gray-800 flex items-center">
              <span class="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs mr-2">${index + 1}</span>
              Color Variant ${index + 1}
            </h4>
            <div class="image-counter ${imageCount >= 3 && imageCount <= 4 ? 'valid' : 'invalid'}">
              ${imageCount}/4 Images
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div class="group">
              <label for="color-name-${index}" class="block text-xs font-medium text-gray-700 mb-1">Color Name <span class="text-red-500">*</span></label>
              <input type="text" id="color-name-${index}" name="colorVariants[${index}].colorName" 
                     value="${variant.colorName || ""}" 
                     pattern="[A-Za-z]+" oninput="this.value=this.value.replace(/[^A-Za-z]/g,'')"
                     class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" 
                     placeholder="e.g., Ocean Blue">
              <span id="error5-${index}" class="error-message text-red-500"></span>
            </div>
            <div class="group">
              <label for="color-value-${index}" class="block text-xs font-medium text-gray-700 mb-1">Color</label>
              <div class="flex items-center space-x-2">
                <input type="color" id="color-value-${index}" name="colorVariants[${index}].colorValue" 
                       value="${variant.colorValue || "#000000"}" 
                       class="w-10 h-8 border border-gray-300 rounded cursor-pointer">
                <input type="text" value="${variant.colorValue || "#000000"}" 
                       class="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-xs"
                       onchange="document.getElementById('color-value-${index}').value = this.value">
              </div>
            </div>
            <div class="group">
              <label for="regular-price-${index}" class="block text-xs font-medium text-gray-700 mb-1">Regular Price <span class="text-red-500">*</span></label>
              <div class="relative">
                <span class="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">₹</span>
                <input type="number" id="regular-price-${index}" name="colorVariants[${index}].regularPrice" 
                       value="${variant.regularPrice || ""}" step="0.01" min="0" 
                       class="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm" 
                       placeholder="0.00">
              </div>
              <span id="error6-${index}" class="error-message text-red-500"></span>
            </div>
            <div class="group">
              <label for="discount-percentage-${index}" class="block text-xs font-medium text-gray-700 mb-1">Discount % <span class="text-red-500">*</span></label>
              <div class="relative">
                <span class="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">%</span>
                <input type="number" id="discount-percentage-${index}" name="colorVariants[${index}].discountPercentage" 
                       value="${variant.discountPercentage || ""}" step="1" min="0" max="100" 
                       class="w-full pr-6 pl-2 py-2 border border-gray-300 rounded-lg text-sm" 
                       placeholder="0">
              </div>
              <span id="error7-${index}" class="error-message text-red-500"></span>
              <div class="text-xs text-gray-500 mt-1">
                Offer Price: <span id="calculated-offer-price-${index}">—</span>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="group">
              <label for="stock-${index}" class="block text-xs font-medium text-gray-700 mb-1">Stock Quantity <span class="text-red-500">*</span></label>
              <input type="number" id="stock-${index}" name="colorVariants[${index}].stock" 
                     value="${variant.stock || ""}" min="0" 
                     class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" 
                     placeholder="0">
              <span id="error8-${index}" class="error-message text-red-500"></span>
            </div>
            <div class="flex items-end">
              <label class="flex items-center space-x-2 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100">
                <input type="checkbox" id="has-offer-${index}" name="colorVariants[${index}].hasOffer" 
                       class="w-4 h-4 text-blue-500 border-gray-300 rounded" 
                       ${variant.hasOffer ? "checked" : ""}>
                <span class="text-xs font-medium text-gray-700">Enable Variant Offer</span>
              </label>
            </div>
          </div>
          <div class="mb-3">
            <label class="block text-xs font-medium text-gray-700 mb-2">
              Product Images <span class="text-red-500">*</span>
              <span class="text-xs text-gray-500 ml-1">(Add 3-4 images one by one)</span>
            </label>
            <div class="image-upload-area mb-3" onclick="document.getElementById('product-image-${index}').click()">
              <div class="flex flex-col items-center">
                <div class="w-8 h-8 bg-blue-500 bg-opacity-10 rounded-full flex items-center justify-center mb-2">
                  <i class="fas fa-plus text-blue-500 text-sm"></i>
                </div>
                <p class="text-xs font-medium text-gray-700 mb-1">Add Image</p>
                <p class="text-xs text-gray-500">PNG, JPG up to 5MB</p>
              </div>
              <input type="file" id="product-image-${index}" name="colorVariants[${index}].productImage[]" 
                     accept="image/*" class="hidden">
            </div>
            <span id="error9-${index}" class="error-message text-red-500"></span>
            <div class="variant-image-preview-container grid grid-cols-4 gap-2 mb-2">
              ${images.map((img, imgIdx) => `
                <div class="relative group">
                  <img src="${img}" class="variant-image-preview w-full h-16 object-cover rounded-lg" />
                  <button type="button" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100"
                          onclick="removeImage(this, ${index})">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              `).join("")}
            </div>
            <div class="image-error text-red-600 text-xs mt-1 hidden flex items-center">
              <i class="fas fa-exclamation-triangle mr-1"></i>
              <span></span>
            </div>
            ${images.length > 0 ? `
              <div class="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" id="remove-image-${index}" name="colorVariants[${index}].removeImage[]" 
                         class="w-3 h-3 text-yellow-600 border-yellow-300 rounded">
                  <span class="text-xs text-yellow-800">Replace all existing images</span>
                </label>
              </div>
              ${images.map((img, imgIdx) => `<input type="hidden" name="colorVariants[${index}].existingImage[${imgIdx}]" value="${img}">`).join("")}
            ` : ""}
            <input type="hidden" name="colorVariants[${index}]._id" value="${variant._id || ""}">
          </div>
          <button type="button" class="remove-variant-btn  text-sm" title="Remove this variant">
            <i class="fas fa-trash"></i>
          </button>
        `;
        
        colorVariantsContainer.appendChild(variantEntry);

        const imageInput = variantEntry.querySelector(`input[name="colorVariants[${index}].productImage[]"]`);
        if (imageInput) {
          hookCropperOn(imageInput, variantEntry);
        }

        const uploadArea = variantEntry.querySelector(".image-upload-area");
        uploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
          uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragover');
          
          const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
          if (files.length > 0) {
            const file = files[0];
            const dt = new DataTransfer();
            dt.items.add(file);
            imageInput.files = dt.files;
            imageInput.dispatchEvent(new Event('change'));
          }
        });

        const removeBtn = variantEntry.querySelector(".remove-variant-btn");
        if (removeBtn) {
          removeBtn.addEventListener("click", () => {
            if (colorVariantsContainer.children.length <= 1) {
              const errorDiv = variantEntry.querySelector(`#error5-${index}`);
              errorDiv.textContent = "At least one color variant is required.";
              errorDiv.style.display = 'block';
              return;
            }
            
            variantEntry.remove();
            Array.from(colorVariantsContainer.children).forEach((entry, idx) => {
              const title = entry.querySelector('h4');
              if (title) {
                title.innerHTML = `
                  <span class="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs mr-2">${idx + 1}</span>
                  Color Variant ${idx + 1}
                `;
                updateCalculatedOfferPrice(idx);
              }
            });
          });
        }

        const regularPriceInput = variantEntry.querySelector(`#regular-price-${index}`);
        const discountInput = variantEntry.querySelector(`#discount-percentage-${index}`);
        const updateOfferPrice = () => updateCalculatedOfferPrice(index);
        regularPriceInput.addEventListener("input", updateOfferPrice);
        discountInput.addEventListener("input", updateOfferPrice);
        updateOfferPrice();

        return variantEntry;
      }

      function updateCalculatedOfferPrice(index) {
        const regularPriceInput = document.getElementById(`regular-price-${index}`);
        const discountInput = document.getElementById(`discount-percentage-${index}`);
        const offerPriceSpan = document.getElementById(`calculated-offer-price-${index}`);
        
        const regularPrice = parseFloat(regularPriceInput.value) || 0;
        const discountPercentage = parseFloat(discountInput.value) || 0;
        
        if (regularPrice > 0 && discountPercentage >= 0 && discountPercentage <= 100) {
          const offerPrice = regularPrice * (1 - discountPercentage / 100);
          offerPriceSpan.textContent = `₹${offerPrice.toFixed(2)}`;
        } else {
          offerPriceSpan.textContent = "—";
        }
      }

      // Form validation
      function validateForm() {
        let isValid = true;

        document.querySelectorAll('.error-message').forEach(span => {
          span.style.display = 'none';
          span.textContent = '';
        });

        const productName = document.getElementById("product-name").value.trim();
        const brand = document.getElementById("product-brand").value;
        const category = document.getElementById("product-category").value;
        const description = document.getElementById("product-description").value.trim();

        if (!productName) {
          document.getElementById("error1").textContent = "Product name is required.";
          document.getElementById("error1").style.display = 'block';
          isValid = false;
        }

        if (!brand) {
          document.getElementById("error2").textContent = "Please select a brand.";
          document.getElementById("error2").style.display = 'block';
          isValid = false;
        }

        if (!category) {
          document.getElementById("error3").textContent = "Please select a category.";
          document.getElementById("error3").style.display = 'block';
          isValid = false;
        }

        if (!description) {
          document.getElementById("error4").textContent = "Product description is required.";
          document.getElementById("error4").style.display = 'block';
          isValid = false;
        }

        const variants = document.querySelectorAll("#color-variants-container .variant-entry");
        if (variants.length === 0) {
          const errorDiv = document.getElementById("error5-0") || document.createElement('div');
          errorDiv.id = "error5-0";
          errorDiv.className = "error-message text-red-500";
          colorVariantsContainer.appendChild(errorDiv);
          errorDiv.textContent = "At least one color variant is required.";
          errorDiv.style.display = 'block';
          isValid = false;
        }

        variants.forEach((entry, idx) => {
          const colorName = entry.querySelector(`input[name="colorVariants[${idx}].colorName"]`).value.trim();
          const regularPrice = entry.querySelector(`input[name="colorVariants[${idx}].regularPrice"]`).value;
          const discountPercentage = entry.querySelector(`input[name="colorVariants[${idx}].discountPercentage"]`).value;
          const stock = entry.querySelector(`input[name="colorVariants[${idx}].stock"]`).value;
          const existingImages = entry.querySelectorAll(`input[name="colorVariants[${idx}].existingImage"]`).length;
          const newImages = entry.uploadedFiles ? entry.uploadedFiles.length : 0;
          const removeImage = entry.querySelector(`input[name="colorVariants[${idx}].removeImage"]`)?.checked || false;
          const variantId = entry.querySelector(`input[name="colorVariants[${idx}]._id"]`).value;

          const totalImages = removeImage ? newImages : newImages + existingImages;

          if (!colorName) {
            entry.querySelector(`#error5-${idx}`).textContent = `Color name is required for variant ${idx + 1}.`;
            entry.querySelector(`#error5-${idx}`).style.display = 'block';
            isValid = false;
          }

          if (!regularPrice || parseFloat(regularPrice) <= 0) {
            entry.querySelector(`#error6-${idx}`).textContent = `Valid regular price is required for variant ${idx + 1}.`;
            entry.querySelector(`#error6-${idx}`).style.display = 'block';
            isValid = false;
          }

          if (discountPercentage === "" || parseFloat(discountPercentage) < 0 || parseFloat(discountPercentage) > 100) {
            entry.querySelector(`#error7-${idx}`).textContent = `Discount percentage must be between 0 and 100 for variant ${idx + 1}.`;
            entry.querySelector(`#error7-${idx}`).style.display = 'block';
            isValid = false;
          }

          if (!stock || parseInt(stock) < 0) {
            entry.querySelector(`#error8-${idx}`).textContent = `Valid stock quantity is required for variant ${idx + 1}.`;
            entry.querySelector(`#error8-${idx}`).style.display = 'block';
            isValid = false;
          }

          if (!variantId && totalImages < 3) {
            entry.querySelector(`#error9-${idx}`).textContent = `Minimum 3 images required for variant ${idx + 1}.`;
            entry.querySelector(`#error9-${idx}`).style.display = 'block';
            isValid = false;
          }

          if (totalImages > 4) {
            entry.querySelector(`#error9-${idx}`).textContent = `Maximum 4 images allowed for variant ${idx + 1}.`;
            entry.querySelector(`#error9-${idx}`).style.display = 'block';
            isValid = false;
          }
        });

        return isValid;
      }

      // Form submission
      productForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        if (!validateForm()) {
          return;
        }

        const formData = new FormData();
        const variants = buildVariantsJson();

        formData.append("productName", document.getElementById("product-name").value);
        formData.append("brand", document.getElementById("product-brand").value);
        formData.append("category", document.getElementById("product-category").value);
        formData.append("description", document.getElementById("product-description").value);
        formData.append("hasOffer", document.getElementById("product-offer").checked);

        variants.forEach((variant, idx) => {
          formData.append(`colorVariants[${idx}][colorName]`, variant.colorName);
          formData.append(`colorVariants[${idx}][colorValue]`, variant.colorValue);
          formData.append(`colorVariants[${idx}][regularPrice]`, variant.regularPrice);
          formData.append(`colorVariants[${idx}][discountPercentage]`, variant.discountPercentage);
          formData.append(`colorVariants[${idx}][stock]`, variant.stock);
          formData.append(`colorVariants[${idx}][hasOffer]`, variant.hasOffer);
          formData.append(`colorVariants[${idx}][removeImage]`, variant.removeImage);
          if (variant._id) {
            formData.append(`colorVariants[${idx}][_id]`, variant._id);
          }
          variant.existingImage.forEach((img, imgIdx) => {
            formData.append(`colorVariants[${idx}][existingImage][${imgIdx}]`, img);
          });
        });

        document.querySelectorAll("#color-variants-container .variant-entry").forEach((entry, idx) => {
          if (entry.uploadedFiles && entry.uploadedFiles.length >= 3) {
            entry.uploadedFiles.forEach((file, fileIdx) => {
              formData.append(`colorVariants[${idx}][productImage][]`, file);
            });
          } else if (!entry.querySelector(`input[name="colorVariants[${idx}]._id"]`).value) {
            entry.querySelector(`#error9-${idx}`).textContent = `Variant ${idx + 1} must have at least 3 images.`;
            entry.querySelector(`#error9-${idx}`).style.display = 'block';
            return;
          }
        });

        const productId = productIdInput.value;
        const variantId = variantIdInput.value;
        const url = variantId 
          ? `/admin/products/${productId}/variants/${variantId}` 
          : productId 
            ? `/admin/product/${productId}` 
            : "/admin/addProducts";
        const method = productId ? "PUT" : "POST";

        try {
            submitBtn.disabled = true;
            submitBtnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
          const response = await fetch(url, {
            method,
            body: formData,
          });
              
          const result = await response.json();
          if (response.ok && result.success) {
            Swal.fire({
              icon: 'success',
              title: 'Success',
              text: result.message || "Product saved successfully.",
              showConfirmButton: true
            }).then(() => {
              productModal.classList.add("hidden");
              location.reload();
            });
          } else {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: result.message || `Server error (Status: ${response.status}).`
            });
          }
        } catch (err) {
          console.error("Error submitting form:", err);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to connect to the server. Please try again.'
          });
        }
      });

      // Cropper functionality
      document.getElementById("cropper-cancel").onclick = () => {
        wrap.classList.add("hidden");
        if (cropper) {
          cropper.destroy();
          cropper = null;
        }
        if (currentInput) {
          currentInput.value = "";
        }
        currentInput = null;
        currentFile = null;
        currentVariantEntry = null;
      };

      document.getElementById("cropper-done").onclick = async () => {
        if (!cropper || !currentInput || !currentVariantEntry) return;
        
        cropper.getCroppedCanvas({ 
          width: 800, 
          height: 800
        }).toBlob((blob) => {
          const fileName = `crop_${Date.now()}.png`;
          const file = new File([blob], fileName, { type: "image/png" });
          
          if (!currentVariantEntry.uploadedFiles) {
            currentVariantEntry.uploadedFiles = [];
          }
          currentVariantEntry.uploadedFiles.push(file);
          
          const previewContainer = currentVariantEntry.querySelector('.variant-image-preview-container');
          const div = document.createElement("div");
          div.className = "relative group";
          div.innerHTML = `
            <img src="${URL.createObjectURL(file)}" class="variant-image-preview w-full h-16 object-cover rounded-lg" />
            <button type="button" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100"
                    onclick="removeImage(this, ${Array.from(colorVariantsContainer.children).indexOf(currentVariantEntry)})">
              <i class="fas fa-times"></i>
            </button>
          `;
          previewContainer.appendChild(div);
          
          updateImageCounter(currentVariantEntry);
          
          currentInput.value = "";
          wrap.classList.add("hidden");
          cropper.destroy();
          cropper = null;
          currentInput = null;
          currentFile = null;
          currentVariantEntry = null;
        }, "image/png");
      };

      // Add variant button
      addColorVariantBtn.addEventListener("click", () => addColorVariant());

      // Modal open/close
      addProductBtn.addEventListener("click", () => {
        productModal.classList.remove("hidden");
        modalTitle.textContent = "Add New Product";
        submitBtnText.textContent = "Add Product";
        productForm.reset();
        colorVariantsContainer.innerHTML = "";
        addColorVariant();
        productIdInput.value = "";
        variantIdInput.value = "";
      });

      closeModalBtn.addEventListener("click", () => {
        productModal.classList.add("hidden");
      });

      cancelBtn.addEventListener("click", () => {
        productModal.classList.add("hidden");
      });

      productModal.addEventListener("click", (e) => {
        if (e.target === productModal) {
          productModal.classList.add("hidden");
        }
      });

      function buildVariantsJson() {
        const variants = [];
        document.querySelectorAll("#color-variants-container .variant-entry").forEach((entry, idx) => {
          const variant = {
            colorName: entry.querySelector(`input[name="colorVariants[${idx}].colorName"]`).value,
            colorValue: entry.querySelector(`input[name="colorVariants[${idx}].colorValue"]`).value,
            regularPrice: parseFloat(entry.querySelector(`input[name="colorVariants[${idx}].regularPrice"]`).value) || 0,
            discountPercentage: parseFloat(entry.querySelector(`input[name="colorVariants[${idx}].discountPercentage"]`).value) || 0,
            stock: parseInt(entry.querySelector(`input[name="colorVariants[${idx}].stock"]`).value) || 0,
            hasOffer: entry.querySelector(`input[name="colorVariants[${idx}].hasOffer"]`).checked,
            _id: entry.querySelector(`input[name="colorVariants[${idx}]._id"]`).value || "",
            removeImage: entry.querySelector(`input[name="colorVariants[${idx}].removeImage"]`)?.checked || false,
            existingImage: Array.from(entry.querySelectorAll(`input[name="colorVariants[${idx}].existingImage"]`)).map(input => input.value)
          };
          variants.push(variant);
        });
        return variants;
      }

      // Edit modal function
      window.openEditModal = async function(productId, variantId = null) {
        try {
          const response = await fetch(`/admin/products/${productId}`);
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          
          if (!data.success) {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: data.message || "Failed to fetch product data."
            });
            return;
          }

          const product = data.product;
          productModal.classList.remove("hidden");
          modalTitle.textContent = variantId ? "Edit Variant" : "Edit Product";
          submitBtnText.textContent = "Update Product";
          productIdInput.value = productId;
          variantIdInput.value = variantId || "";

          document.getElementById("product-name").value = product.productName || "";
          document.getElementById("product-brand").value = product.brand?._id || "";
          document.getElementById("product-category").value = product.category?._id || "";
          document.getElementById("product-description").value = product.description || "";
          document.getElementById("product-offer").checked = product.hasOffer || false;

          colorVariantsContainer.innerHTML = "";
          if (variantId) {
            const variant = product.colorVariants.find(v => v._id === variantId);
            if (variant) {
              addColorVariant({
                _id: variant._id,
                colorName: variant.colorName,
                colorValue: variant.colorValue,
                regularPrice: variant.regularPrice,
                discountPercentage: variant.discountPercentage,
                stock: variant.stock,
                productImage: variant.productImage,
                hasOffer: variant.hasOffer
              });
            }
          } else {
            product.colorVariants.forEach(variant => {
              addColorVariant({
                _id: variant._id,
                colorName: variant.colorName,
                colorValue: variant.colorValue,
                regularPrice: variant.regularPrice,
                discountPercentage: variant.discountPercentage,
                stock: variant.stock,
                productImage: variant.productImage,
                hasOffer: variant.hasOffer
              });
            });
          }

          document.getElementById("product-name").removeAttribute("disabled");
          document.getElementById("product-brand").removeAttribute("disabled");
          document.getElementById("product-category").removeAttribute("disabled");
        } catch (err) {
          console.error("Error fetching product data:", err);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Something went wrong while fetching product data.'
          });
        }
      };
    });
