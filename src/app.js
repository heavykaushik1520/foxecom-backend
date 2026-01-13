// src/app.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();


const { sequelize, testConnection } = require('./config/db'); 

const models = require('./models'); 

//routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes'); 
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const adminCategoryRoutes = require('./routes/adminCategoryRoutes');
const adminProductRoutes = require('./routes/adminProductRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const userAuthRoutes = require('./routes/userAuthRoutes');
const userRoutes = require('./routes/userRoutes');
const cartRoutes = require('./routes/cartRoutes'); 
const orderRoutes = require("./routes/orderRoutes"); 
const paymentRoutes = require("./routes/paymentRoutes");
const adminOrderRoutes = require('./routes/adminOrderRoutes');
const shipRoutes = require("./routes/shipRoutes");//created on 12/06

const mobileBrandsRoutes = require('./routes/mobileBrandsRoutes');
const mobileModelsRoutes = require('./routes/mobileModelsRoutes');
const caseDetailsRoutes = require('./routes/caseDetailsRoutes');

const app = express();
const port = process.env.PORT || 3000;
const path = require('path');

// Middleware 
// app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://artiststation.co.in'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


testConnection();

async function syncDatabase() {
  try {
    // await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Error synchronizing database:', error);
  }
}
syncDatabase(); 

// Use your authentication routes
app.use('/api/auth', authRoutes);

//user auth routes
app.use('/api/auth/user', userAuthRoutes);

//admin route
app.use('/api', adminRoutes); 

//user Routes
app.use('/api', userRoutes);

//product route
app.use('/api', productRoutes);

//category routes
app.use('/api', categoryRoutes);

//admin category routes
app.use('/api', adminCategoryRoutes);

//admin product routes
app.use('/api', adminProductRoutes);

//admin dashboard routes
app.use('/api', adminDashboardRoutes);

//checkout routes
app.use('/api', checkoutRoutes);

// Use your cart routes
app.use('/api', cartRoutes);

//order route
app.use('/api', orderRoutes );

//payment route
app.use("/api/payment", paymentRoutes);

//admin order routes
app.use('/api/admin', adminOrderRoutes);

//created on 12-06
app.use('/api/webhooks',shipRoutes)

//images routes

// Mobile Brands, Models, and Case Details routes
app.use('/api', mobileBrandsRoutes);
app.use('/api', mobileModelsRoutes);
app.use('/api', caseDetailsRoutes);

// Define your routes here
app.get('/', (req, res) => {
  res.send('Hello from your Node.js Express app in Devrukh!');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port} in Devrukh.`);
});

module.exports = app;