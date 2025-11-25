const express = require('express');
const app = express();
const path = require('path')
const env = require('dotenv').config();
const session = require("express-session");
const passport = require('./config/passport')
const nocache = require('nocache')
const db = require('./config/db')
const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")
const errorController = require("./controllers/error/errorController")
db()

app.use(nocache())

app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    }
}))


app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')])
app.use(express.static(path.join(__dirname, 'public')));


app.use("/", userRouter)
app.use("/admin", adminRouter)

app.use('/admin', errorController.pageError);     
app.use('/', errorController.pageNotFound); 


app.listen(process.env.PORT, '0.0.0.0', () => {
  console.log('Server running on http://127.0.0.1:3005');
});




module.exports = app;

