const { Order, OrderItem, Product, Cart, CartItem , ProductImage  } = require('../models');
const validator = require("validator");
// const { Op } = require("sequelize");

function isValidIndianPincode(pincode) {
  const regex = /^[1-9][0-9]{5}$/;
  return regex.test(pincode);
}
function isRealPincode(pincode) {
  return validator.isPostalCode(pincode, 'IN'); // 'IN' for India, 'US' for US, etc.
}

module.exports = {
  isValidIndianPincode,
  isRealPincode
};