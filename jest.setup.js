// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();

// Theme / draft stores persist through AsyncStorage; the native module is null in Jest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
