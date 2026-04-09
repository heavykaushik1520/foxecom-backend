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
const ProductRatingSummary = require('./productRatingSummary');
const Banner = require('./banner');
const DealOfTheWeek = require('./dealOfTheWeek');
const DealOfTheWeekProduct = require('./dealOfTheWeekProduct');
const BuyOneGetOne = require('./buyOneGetOne');
const BuyOneGetOneProduct = require('./buyOneGetOneProduct');
const FoxcomOriginals = require('./foxcomOriginals');
const FoxcomOriginalsProduct = require('./foxcomOriginalsProduct');
const CustomerReview = require('./customerReview');
const ReviewReminder = require("./reviewReminder");
const VisitorSession = require("./visitorSession");
const SellerReview = require("./sellerReview");
const Blog = require("./blog");
const BlogTag = require("./blogTag");
const BlogTagMap = require("./blogTagMap");
const BlogRelatedProduct = require("./blogRelatedProduct");

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
  ProductRatingSummary,
  Banner,
  DealOfTheWeek,
  DealOfTheWeekProduct,
  BuyOneGetOne,
  BuyOneGetOneProduct,
  FoxcomOriginals,
  FoxcomOriginalsProduct,
  CustomerReview,
  ReviewReminder,
  VisitorSession,
  SellerReview,
  Blog,
  BlogTag,
  BlogTagMap,
  BlogRelatedProduct,
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
