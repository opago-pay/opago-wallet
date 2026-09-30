// Preserve app.json as the app configuration; credentials stay in the build environment.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ['@sentry/react-native/expo', {
      organization: 'opago-gmbh',
      project: 'react-native',
      url: 'https://sentry.io/',
      useNativeInit: false,
      // Local builds and builds without an upload credential remain usable.
      disableAutoUpload: !process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_DISABLE_AUTO_UPLOAD === 'true',
    }],
  ],
});
