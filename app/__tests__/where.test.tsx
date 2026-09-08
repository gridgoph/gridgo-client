import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhereScreen from "@/app/request/where";

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

describe("Where is it going?", () => {
  it("asks for search, current location, street and a pin — not a barangay", async () => {
    await renderInSafeArea(<WhereScreen />);

    expect(await screen.findByText("Where is it going?")).toBeTruthy();
    expect(screen.getByLabelText("Search location")).toBeTruthy();
    expect(screen.getByLabelText("Use my location")).toBeTruthy();
    expect(screen.getByLabelText("Street and building")).toBeTruthy();
    expect(screen.getByLabelText("Landmark")).toBeTruthy();
    expect(screen.getByText("Save this address")).toBeTruthy();
    expect(screen.queryByLabelText("Barangay")).toBeNull();
    expect(screen.queryByText(/barangay/i)).toBeNull();

    await waitFor(() => {
      expect(require("@/lib/api").listAddresses).toHaveBeenCalled();
    });
  });
});
