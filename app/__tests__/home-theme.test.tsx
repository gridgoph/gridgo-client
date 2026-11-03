import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { useThemeStore } from "@/store/theme";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    listCatalog: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getHomeSummary: jest.fn(async () => null),
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    saveAccountThemePreference: jest.fn(async (value: string) => value),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

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

beforeEach(() => {
  mockPush.mockClear();
  useCart.getState().reset();
  useSession.setState({
    user: {
      id: "user_1",
      name: "Rina Cruz",
      email: "rina@example.com",
      role: "client",
      accountType: "business",
      orgName: "Cruz Signs",
    },
    token: "tok_test",
  } as never);
});

/**
 * The switch saves the choice on the account (`PATCH /me/theme`), so every
 * screen and every phone follows it (client#335). The knob moves on the tap;
 * the theme lands under the fade a moment later (`store/themeSwitch.ts`).
 */
it("moves the knob at once, then lands the tapped theme and saves it on the account", async () => {
  useThemeStore.setState({ preference: "system", unsynced: false, owner: "user_1" });
  await renderInSafeArea(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("Dark theme"));

  expect(await screen.findByRole("radio", { name: "Dark theme", selected: true })).toBeTruthy();
  expect(useThemeStore.getState().preference).toBe("system");
  await waitFor(() => expect(useThemeStore.getState().preference).toBe("dark"));
  expect(api.saveAccountThemePreference).toHaveBeenCalledWith("dark");
});
