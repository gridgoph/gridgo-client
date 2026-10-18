import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SavedPlacesScreen from "@/app/saved-places";
import type { ClientAddress } from "@/lib/api";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listAddresses: jest.fn(async () => []) };
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

describe("Saved Places", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("invites Home, Work and a new place when nothing is saved", async () => {
    await renderInSafeArea(<SavedPlacesScreen />);

    expect(await screen.findByLabelText("Add home")).toBeTruthy();
    expect(screen.getByLabelText("Add work")).toBeTruthy();
    expect(screen.getByLabelText("Add a new place")).toBeTruthy();
    expect(screen.queryByLabelText("Delete")).toBeNull();
    expect(screen.queryByLabelText(/trash/i)).toBeNull();
  });

  it("puts a delete control on each saved place, naming it", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@/lib/api");
    const home: ClientAddress = {
      id: "addr_home",
      label: "Home",
      addressLine: "12 Quimpo Blvd, Davao City",
      point: { lat: 7.049, lng: 125.588 },
      isDefault: true,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    api.listAddresses.mockResolvedValueOnce([home]);
    await renderInSafeArea(<SavedPlacesScreen />);

    expect(await screen.findByLabelText("Delete Home")).toBeTruthy();
    expect(screen.getByLabelText("Home, default address")).toBeTruthy();
  });

  it("opens the editor to add a new place", async () => {
    await renderInSafeArea(<SavedPlacesScreen />);
    fireEvent.press(await screen.findByLabelText("Add a new place"));
    expect(mockPush).toHaveBeenCalledWith("/saved-place");
  });
});
