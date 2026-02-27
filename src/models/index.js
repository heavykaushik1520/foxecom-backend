const Admin = require('./admin');
const Category = require('./category');
const Product = require('./product');
const User = require('./user');
const Cart = require('./cart');
const CartItem = require('./cartItem');
const Order = require('./order');
const OrderItem = require('./orderItem');
const ProductImage = require('./productImage');
const MobileBrands = require('./mobileBrands');
const MobileModels = require('./mobileModels');
const CaseDetails = require('./caseDetails');
const Review = require('./review');
const Banner = require('./banner');
const DealOfTheWeek = require('./dealOfTheWeek');
const DealOfTheWeekProduct = require('./dealOfTheWeekProduct');

const models = {
  Admin,
  Category,
  Product,
  User,
  Cart,
  CartItem,
  Order,
  OrderItem,
  ProductImage,
  MobileBrands,
  MobileModels,
  CaseDetails,
  Review,
  Banner,
  DealOfTheWeek,
  DealOfTheWeekProduct,
};

// Apply associations
Object.keys(models).forEach((key) => {
  if (models[key].associate) {
    models[key].associate(models);
  }
});

module.exports = {
  ...models,
  sequelize: Admin.sequelize,
  Sequelize: Admin.Sequelize,
};
