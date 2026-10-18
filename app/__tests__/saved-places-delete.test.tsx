import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SavedPlacesScreen from "@/app/saved-places";
import type { ClientAddress } from "@/lib/api";
import { useAddressDeletion } from "@/store/addressDeletion";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listAddresses: jest.fn(), deleteAddress: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOME: ClientAddress = {
  id: "addr_home",
  label: "Home",
  addressLine: "12 Quimpo Blvd, Davao City",
  point: { lat: 7.049, lng: 125.588 },
  isDefault: true,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const SHOPFRONT: ClientAddress = { ...HOME, id: "addr_stall", label: "Stall", isDefault: false };

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

// One press per test (see AGENTS.md): the question is preset in the store.
it("deletes the default once confirmed, then says no default is set", async () => {
  api.listAddresses.mockResolvedValueOnce([HOME, SHOPFRONT]).mockResolvedValue([SHOPFRONT]);
  api.deleteAddress.mockResolvedValue({ defaultCleared: true });
  useAddressDeletion.getState().ask("saved-places", HOME, [HOME, SHOPFRONT]);

  await renderInSafeArea(<SavedPlacesScreen />);
  expect(await screen.findByText("Delete Home?")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Delete address"));

  expect(
    await screen.findByText(
      "Home deleted. No default address is set now, so GRIDGO will ask where to deliver on your next order.",
    ),
  ).toBeTruthy();
  expect(api.deleteAddress).toHaveBeenCalledWith("addr_home");
  await waitFor(() => expect(screen.queryByLabelText("Delete Home")).toBeNull());
  expect(screen.getByLabelText("Delete Stall")).toBeTruthy();
  // Home is gone, so Saved Places invites it again.
  expect(screen.getByLabelText("Add home")).toBeTruthy();
});
