import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SavedPlaceScreen from "@/app/saved-place";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ preset: "home" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listAddresses: jest.fn(async () => []), saveAddress: jest.fn() };
});

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("Add home", () => {
  it("uses the same search and location editor as checkout, with Home locked", async () => {
    await renderInSafeArea(<SavedPlaceScreen />);

    expect(await screen.findByText("Add home")).toBeTruthy();
    expect(screen.getByLabelText("Search location")).toBeTruthy();
    expect(screen.getByLabelText("Use my location")).toBeTruthy();
    expect(screen.getByLabelText("Street and building")).toBeTruthy();
    expect(screen.getByText("Save this address")).toBeTruthy();
    expect(screen.queryByLabelText("Name this place")).toBeNull();
    expect(screen.queryByLabelText("Barangay")).toBeNull();
  });
});
