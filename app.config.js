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
    ['./plugins/with-native-crash-diagnostics', {
      dsn: 'https://87bcd96c65e4476e0f783d39cb5f4a86@o4512175942598656.ingest.de.sentry.io/4512175945154640',
    }],
  ],
});
