const authApi = require('./modules/auth-api');
const directoryApi = require('./modules/directory-api');
const appointmentApi = require('./modules/appointment-api');
const assessmentApi = require('./modules/assessment-api');
const treatmentApi = require('./modules/treatment-api');
const userApi = require('./modules/user-api');
const communityApi = require('./modules/community-api');
const liveApi = require('./modules/live-api');

module.exports = Object.assign(
  {},
  authApi,
  directoryApi,
  appointmentApi,
  assessmentApi,
  treatmentApi,
  userApi,
  communityApi,
  liveApi,
);
