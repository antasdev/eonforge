const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');






const getBrandPage = async (req, res) => {
    try {
      
    
        let search="";
         if(req.query.search){
            search = req.query.search;
           
        }
      
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const brandData = await Brand.find({brandName:{$regex:'.*'+search+'.*',$options:'i'}}).sort({ createdOn: -1 }).skip(skip).limit(limit);
        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands / limit);
        const reverseBrand = brandData.reverse();
        res.render('brands',
            {
                data: reverseBrand,
                currentPage: page,
                totalPages: totalPages,
                totalBrands: totalBrands,
                search,
                limit
            })
    } catch (error) {
        res.redirect('/pageError')
    }
}


const addBrand = async (req,res) => {
    try {
        const brandName = req.body.name
      
        const findBrand=await Brand.findOne({brandName:{$regex:`^${brandName}$`,$options:'i'}})
        if(findBrand){
            return res.json({success:false,message:'Brand already exists'}) 
        }
           const image = req.file ? req.file.path : null;

    if (!brandName || !image) {
      return res.json({ success: false, message: 'Brand name and image are required.' });
    }

         
            const newBrand =  new Brand({
                brandName,    
                brandImage:[image],
            })
            await newBrand.save();
           return res.json({success:true,message:'brand added successfully',newBrand})
    } catch (error) {
       console.error(error);
        return res.json({success:false,error:"Internal Server Error"});
    }
    
}

const brandStatus = async (req, res) => {


  const { id } = req.params;
  const { isBlocked } = req.body;

  try {
    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    brand.isBlocked = isBlocked;
    await brand.save();

    res.status(200).json({ success: true, message: `Brand ${isBlocked ? 'blocked' : 'unblocked'} successfully.` });
  } catch (error) {
    console.error('Error:',error);
    res.status(500).json({ success: false, message: 'internal Server error' });
  }
};

const editBrand = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const image = req.file;

  try {
    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    const updateData = {};
    if (name) {
      updateData.brandName = name.toUpperCase();
    }
    if (image) {
      updateData.brandImage = [image.path];
    }

    const updatedBrand = await Brand.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, message: 'Brand updated successfully' });
  } catch (error) {
    console.error('Error updating brand:', error);
    res.status(500).json({ success: false, message: 'Server error while updating brand' });
  }
};

module.exports = {
    getBrandPage,
    addBrand,
    brandStatus,
    editBrand
}