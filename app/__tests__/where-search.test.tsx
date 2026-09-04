import type { ReactElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhereScreen from "@/app/request/where";
import { SEARCH_DEBOUNCE_MS } from "@/lib/geocode";

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

jest.mock("@/lib/geocode", () => {
  const actual = jest.requireActual("@/lib/geocode");
  return {
    ...actual,
    searchNominatim: jest.fn(),
    reverseNominatim: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const geocode = require("@/lib/geocode") as {
  searchNominatim: jest.Mock;
};

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

describe("Where is it going? search", () => {
  it("lists Nominatim hits in Davao for the client to pick", async () => {
    geocode.searchNominatim.mockResolvedValue({
      status: "ok",
      suggestions: [
        {
          id: "42",
          label: "SM City Davao",
          line1: "SM City Davao, Quimpo Boulevard",
          landmark: "",
          point: { lat: 7.0494, lng: 125.588 },
        },
      ],
    });

    await renderInSafeArea(<WhereScreen />);
    fireEvent.changeText(screen.getByLabelText("Search location"), "SM City");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 30));
    });

    expect(await screen.findByLabelText("Use SM City Davao")).toBeTruthy();
    expect(geocode.searchNominatim).toHaveBeenCalled();
  });
});
