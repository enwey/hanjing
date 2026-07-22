const authApi = require('./modules/auth-api');
const directoryApi = require('./modules/directory-api');
const appointmentApi = require('./modules/appointment-api');
const assessmentApi = require('./modules/assessment-api');
const treatmentApi = require('./modules/treatment-api');
const productApi = require('./modules/product-api');
const orderApi = require('./modules/order-api');
const userApi = require('./modules/user-api');
const distributionApi = require('./modules/distribution-api');
const communityApi = require('./modules/community-api');
const liveApi = require('./modules/live-api');

module.exports = Object.assign(
  {},
  authApi,
  directoryApi,
  appointmentApi,
  assessmentApi,
  treatmentApi,
  productApi,
  orderApi,
  userApi,
  distributionApi,
  communityApi,
  liveApi,
);
