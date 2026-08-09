// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();

// Theme / draft stores persist through AsyncStorage; the native module is null in Jest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// react-native-maps has no JS-only implementation. The delivery card's own
// contract — region, markers, staleness — is covered by lib/tracking tests, so
// here the map is just a host view that must render without a native module.
jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const passthrough = (name) => {
    const Component = (props) => React.createElement(View, props, props.children);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    default: passthrough("MapView"),
    Marker: passthrough("Marker"),
    Polyline: passthrough("Polyline"),
  };
});
