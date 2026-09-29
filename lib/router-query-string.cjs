'use strict';

// Expo Router 6 expects query-string's older named CommonJS exports. Keep that
// interface while using the maintained parser; do not copy or fork its decoder.
module.exports = require('query-string').default;
