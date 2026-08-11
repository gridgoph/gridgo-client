// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();

// Theme / draft stores persist through AsyncStorage; the native module is null in Jest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The map is Leaflet inside a WebView, so there is no JS-only implementation.
// What the map draws is decided by lib/mapHtml and lib/tracking, which are
// unit-tested directly; here the WebView is a host view that must render.
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  const WebView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }));
    return React.createElement(View, props, props.children);
  });
  WebView.displayName = "WebView";
  return { __esModule: true, WebView, default: WebView };
});

// The keyboard is a native surface, so the library ships its own Jest double:
// a plain ScrollView for the aware scroll view, a View for the avoiding view,
// and zeroed keyboard values. What the shell actually decides — which edges it
// owns, and that every screen with an input goes through it — is asserted in
// components/__tests__/keyboardCoverage.test.ts by reading the sources.
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);
