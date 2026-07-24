const { withAndroidManifest } = require('@expo/config-plugins');

function withAndroidPageSize(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];

    const pageSizeProperty = {
      $: {
        'android:name': 'android.hardware.page_size',
        'android:value': '16',
      },
    };

    const existingIndex = app['property']?.findIndex(
      (prop) => prop.$['android:name'] === 'android.hardware.page_size'
    );

    if (existingIndex !== undefined && existingIndex >= 0) {
      app['property'][existingIndex] = pageSizeProperty;
    } else {
      if (!app['property']) {
        app['property'] = [];
      }
      app['property'].push(pageSizeProperty);
    }

    return config;
  });
}

module.exports = withAndroidPageSize;
