const Category = require('../../models/categorySchema');
const { exists } = require('../../models/userSchema');


const categoryInfo = async (req,res) => {
    try {
       let search="";
        if(req.query.search){
            search = req.query.search;
           
        }
        let page=1;
        if(req.query.page){
            page =parseInt(req.query.page) 
        }
        const limit = 4;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({name:{$regex:'.*'+search+'.*',$options:'i'}})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages  =Math.ceil(totalCategories/limit);
        res.render('category',
            {cat:categoryData,
            currentPage:page,
            totalPages:totalPages,
            totalCategories:totalCategories,
            search,
            limit
        })
    } catch (error) {
         console.error(error);
         res.redirect('/pageError')
    }
    
}
  

const addOrUpdateCategory=async (req,res) => {
        let {name, description, offerPrice, isListed} = req.body 
       const hasOffer = !!req.body.hasOffer;
     
        const categoryId=req.params.id; 
        if (!name || !description){
    return res.status(400).json({error: "Name and Description are required" });
  }

  try {
    if (categoryId) {
      // Update
      const updated = await Category.findByIdAndUpdate(categoryId, {
        name,
        description,
        offerPrice,
        hasOffer,
        isListed
      }, { new: true });

      return res.status(200).json({ message:"Category updated successfully", category: updated });
    } else {                                                 
      // Add new
      const existing =await Category.findOne({name:{$regex:`^${name}$`,$options:'i'}});
      if (existing) {
        return res.status(400).json({error:"Category with this name already exists" });
      }

      const category =new Category({name, description, offerPrice, hasOffer, isListed });
      await category.save();
      return res.status(201).json({message: "Category added successfully", category });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({error:"Internal Server Error"});
  }
};


const categoryStatus =async(req,res) =>{
  try {
    const {isListed}= req.body;
    const category =await Category.findByIdAndUpdate(req.params.id,{isListed},{new: true});

    if (!category) {
      return res.status(404).json({error:'Category not found' });
    }

    res.status(200).json({ message:'Status updated',category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Something went wrong'});
  }
};

module.exports={
    categoryInfo,
    addOrUpdateCategory,
    categoryStatus

}