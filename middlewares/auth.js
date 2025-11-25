const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
        if (req.session.userId) {
            User.findById(req.session.userId)

                .then(data => {
                    if (data && !data.isBlocked) {
                        next()
                    } else {
                        res.redirect('/login')
                    }

                })
                .catch(error => {
                
                    res.status(500).send('Internal server error')
                })
        } else {
            res.redirect('/login')
        }
    }


const isLogin = async(req, res, next) => {
    
    const user = await User.findOne({_id:req.session.userId,isBlocked:false})
    console.log(user)
    if (user) {
        
       
        return res.redirect('/');
    }
    next();
};


const isLogged = (req, res, next) => {
    if (req.session.userId) {
        return res.redirect('/');
    }
    next(); // Proceed to userController.loadHomePage if not logged in
};

const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        return next();
    } else {
        res.redirect('/admin/login');
    }
};


const adminLogin = (req, res, next) => {
    
    if (req.session.admin) {
   
        return res.redirect('/admin/adminDashboard');
    }
    next();
};

module.exports = {
    userAuth,
    isLogin,
    isLogged,
    adminAuth,
    adminLogin 
}