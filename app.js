const express = require('express');
const app = express();
const path = require('path')
const env = require('dotenv').config();
const session = require("express-session");
const passport = require('./config/passport')
const nocache = require('nocache')
const db = require('./config/db')
const MongoStore = require('connect-mongo');
const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")
const errorController = require("./controllers/error/errorController")
db()

app.use(nocache())

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb",extended: true }))

// Trust proxy (required if behind Nginx/HTTPS)
app.set("trust proxy", 1);

// Session configuration (production-ready)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, // use the same DB connection
        collectionName: "sessions",
        ttl: 72 * 60 * 60 // 3 days in seconds
    }),
    cookie: {
        secure: process.env.NODE_ENV === "production", // HTTPS only in prod
        httpOnly: true,
        sameSite: "lax",
        maxAge: 72 * 60 * 60 * 1000 // 3 days in ms
    }
}));

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
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});




module.exports = app;

