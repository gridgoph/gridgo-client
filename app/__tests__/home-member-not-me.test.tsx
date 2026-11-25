import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import * as memberApi from "@/lib/membershipsApi";
import { useCart } from "@/store/cart";
import { useMemberships } from "@/store/memberships";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { membershipMatch } from "@/test/membershipFixtures";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
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
    getSeasonWindows: jest.fn(async () => ({ windows: [], banners: [] })),
  };
});

jest.mock("@/lib/membershipsApi");
const api = jest.mocked(memberApi);

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
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useSession.setState({
    user: { id: "user_1", name: "Rina Cruz", email: "rina@example.com", role: "client", accountType: "personal" },
    token: "tok_test",
  } as never);
  useMemberships.getState().reset();
  api.listMemberships.mockResolvedValue({ serverTime: "2026-11-26T02:00:00.000Z", memberships: [], matches: [membershipMatch()] });
});

// Presses, alone in its file.
it("Not me asks first, then takes the person off the list", async () => {
  await renderInSafeArea(<HomeScreen />);
  fireEvent.press(await screen.findByText("Not me"));
  expect(await screen.findByText("Not a Sample Guild member?")).toBeTruthy();
  expect(screen.getByText(/You can still join later/)).toBeTruthy();
  expect(api.dismissMembershipMatch).not.toHaveBeenCalled();
});
