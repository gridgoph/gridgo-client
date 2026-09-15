const resolveReactNative = require("@react-native/jest-preset/jest/resolver");
const resolveWorklets = require("react-native-worklets/jest/resolver");

// Worklets 0.10 provides JS implementations for Jest. Keep its native-file
// exclusion alongside React Native's compatibility handling for subpaths.
module.exports = (request, options) =>
  resolveWorklets(request, {
    ...options,
    defaultResolver: (moduleName, workletsOptions) =>
      resolveReactNative(moduleName, {
        ...workletsOptions,
        defaultResolver: options.defaultResolver,
      }),
  });
