const { withGradleProperties } = require('@expo/config-plugins');

// bdk-rn 1.1.0 ships Rust libraries for these two Android ABIs only.
module.exports = function withBitcoinBdk(config) {
  return withGradleProperties(config, result => {
    result.modResults = result.modResults.filter(entry => entry.key !== 'reactNativeArchitectures');
    result.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a,x86_64' });
    return result;
  });
};
