'use strict';
module.exports = {
  beginPerformanceSpan: () => () => {},
  measurePerformance: (_stage, work) => work(),
  recordPerformanceDuration: () => {},
  markNavigationStart: () => {},
  markNavigationReady: () => {},
  performanceTracingEnabled: () => false,
  getPerformanceReport: () => '{}',
  startEventLoopMonitor: () => () => {},
};
