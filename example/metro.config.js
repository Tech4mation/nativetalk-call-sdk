// Metro config for the example app.
//
// We tell Metro to resolve `@nativetalk/react-native-call-sdk` from the
// sibling SDK source directory so changes to `src/` show up without a publish
// step. This is only useful for the example — real consumers install the
// package from npm.

const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');

const sdkRoot = path.resolve(__dirname, '..');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = {
  ...defaultConfig,
  projectRoot: __dirname,
  watchFolders: [sdkRoot],
  resolver: {
    ...defaultConfig.resolver,
    extraNodeModules: new Proxy(
      {},
      {
        get: (target, name) => {
          if (name === '@nativetalk/react-native-call-sdk') return sdkRoot;
          return path.join(__dirname, `node_modules/${name}`);
        },
      }
    ),
  },
};
