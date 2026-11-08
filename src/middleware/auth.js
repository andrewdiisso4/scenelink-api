'use strict';
module.exports = require('../launch/session').makeAuth({
  jwt: require('jsonwebtoken'), pool: require('../config/database'),
  secret: process.env.JWT_SECRET, adminSecret: process.env.ADMIN_SECRET
});
