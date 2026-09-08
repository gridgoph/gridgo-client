import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhereScreen from "@/app/request/where";
import * as deviceLocation from "@/lib/deviceLocation";
import * as geocode from "@/lib/geocode";

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

describe("Where is it going? Use my location", () => {
  it("pins here and fills the street on grant", async () => {
    jest.spyOn(deviceLocation, "requestCurrentLocation").mockResolvedValue({
      status: "ok",
      point: { lat: 7.0731, lng: 125.6128 },
    });
    jest.spyOn(geocode, "reverseNominatim").mockResolvedValue({
      status: "ok",
      suggestion: {
        id: "rev",
        label: "12 J.P. Laurel Avenue",
        line1: "12 J.P. Laurel Avenue",
        landmark: "",
        point: { lat: 7.0731, lng: 125.6128 },
      },
    });

    await renderInSafeArea(<WhereScreen />);
    fireEvent.press(screen.getByLabelText("Use my location"));

    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.value).toBe("12 J.P. Laurel Avenue");
    });
    expect(screen.getByText("Tap again anywhere to move the pin.")).toBeTruthy();
  });
});
