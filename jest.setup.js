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

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, Low: 1, Lowest: 1, High: 4, Highest: 5, BestForNavigation: 6 },
  getForegroundPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  getCurrentPositionAsync: jest.fn(),
}));

// Push is FCM through a native module, so there is nothing to exercise in Jest:
// the module's own surface is mocked to inert, and every rule the app applies to
// it lives in lib/push.ts and is unit-tested there directly. Permission is
// reported undetermined, which is the state a fresh phone is in — so a screen
// rendering PushEnableCard renders the ask, and no test accidentally asserts
// against a granted phone it never granted.
jest.mock("expo-notifications", () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: "android", data: "test-fcm-token" })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// The keyboard is a native surface, so the library ships its own Jest double:
// a plain ScrollView for the aware scroll view, a View for the avoiding view,
// and zeroed keyboard values. What the shell actually decides — which edges it
// owns, and that every screen with an input goes through it — is asserted in
// components/__tests__/keyboardCoverage.test.ts by reading the sources.
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

// A stray Nominatim / OSRM / API fetch is how the suite finished then sat
// until GitHub cancelled the job (run 34213849490). Tests that need a
// response spy on `global.fetch` themselves.
global.fetch = jest.fn(async () => ({
  ok: false,
  status: 599,
  json: async () => ({}),
  text: async () => "",
}));

// Every screen test runs as a client who has already told GRIDGO what to match
// on. The ranking is a one-off gate on the way in (lib/authLanding.ts), and
// leaving the store empty would land every one of these tests on the ranking
// screen instead of the thing it is about. The gate itself is covered directly
// in lib/__tests__/authLanding.test.ts and app/__tests__/priorities.test.tsx;
// a test that wants an unranked phone clears this store itself.
beforeEach(() => {
  const { usePriorities } = require("@/store/priorities");
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
  if (jest.isMockFunction(global.fetch)) {
    global.fetch.mockReset();
    global.fetch.mockImplementation(async () => ({
      ok: false,
      status: 599,
      json: async () => ({}),
      text: async () => "",
    }));
  }
});
