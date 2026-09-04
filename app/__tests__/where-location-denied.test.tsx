import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhereScreen from "@/app/request/where";
import { LOCATION_DENIED } from "@/lib/deviceLocation";
import * as deviceLocation from "@/lib/deviceLocation";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ next: "checkout" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listAddresses: jest.fn(async () => []),
    saveAddress: jest.fn(),
    setCartDropoffs: jest.fn(),
  };
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

describe("Where is it going? when location is denied", () => {
  it("says what to do next and does not invent a pin", async () => {
    jest.spyOn(deviceLocation, "requestCurrentLocation").mockResolvedValue({
      status: "denied",
      message: LOCATION_DENIED,
    });

    await renderInSafeArea(<WhereScreen />);
    fireEvent.press(screen.getByLabelText("Use my location"));

    expect(await screen.findByText(LOCATION_DENIED)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.value).toBe("");
    });
    expect(screen.queryByText("Tap again anywhere to move the pin.")).toBeNull();
    expect(screen.getByLabelText("Search location")).toBeTruthy();
  });
});
