const { withGradleProperties } = require('@expo/config-plugins');

function with16KPageSize(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;

    const existingIndex = props.findIndex(
      (p) => p.key === 'android.experimental.16kPageSizeNativeLibs'
    );

    if (existingIndex >= 0) {
      props[existingIndex] = {
        type: 'property',
        key: 'android.experimental.16kPageSizeNativeLibs',
        value: 'true',
      };
    } else {
      props.push({
        type: 'property',
        key: 'android.experimental.16kPageSizeNativeLibs',
        value: 'true',
      });
    }

    return config;
  });
}

module.exports = with16KPageSize;
