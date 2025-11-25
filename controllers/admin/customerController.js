const User = require('../../models/userSchema')


const customerInfo = async(req,res)=>{
    try {

        let search="";
        if(req.query.search){
            search = req.query.search;
           
        }
        let page=1;
        if(req.query.page){
            page =parseInt(req.query.page) 
        }
        const limit = 3;
        const userData= await User.find({
            isAdmin:false,
            $or:[
               {firstName:{$regex:'.*'+search+'.*'}},
               {lastName:{$regex:'.*'+search+'.*'}},
               {email:{$regex:'.*'+search+'.*'}},
           ]
           
        })
        .limit(limit*1)
        .skip((page-1)*limit)
        .exec();
      

        const count = await User.find({
            isAdmin:false,
            $or:[
               {firstName:{$regex:'.*'+search+'.*'}},
               {lastName:{$regex:'.*'+search+'.*'}},
               {email:{$regex:'.*'+search+'.*'}},
            ]
        }).countDocuments();

        return res.render('customers',{
            data:userData,
            totalPages:Math.ceil(count/limit),
            currentPage:page,
            search,
            limit
        })
        
    } catch (error) {
        res.redirect('/admin/pageError')
    }
}

const customerBlocked=async (req,res) => {
    try {
     
        let id=req.body.id
        await User.updateOne({_id:id},{$set:{isBlocked:true}})
      
        res.status(200).json({ success: true, redirectUrl:"/admin/users" });  
    } catch (error) {
     
        console.error("Error blocking user:", error);
        res.status(500).json({ success: false, redirectUrl: "/admin/pageError" });
        
    }
    
}
const customerUnblocked=async (req,res) => {
    try {
        let id=req.body.id
      
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
       
        res.status(200).json({ success: true, redirectUrl:"/admin/users" });  
    } catch (error) {
        console.error("Error blocking user:", error);
        res.status(500).json({ success: false, redirectUrl: "/admin/pageError" });
        
    }
    
}



module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked,

}