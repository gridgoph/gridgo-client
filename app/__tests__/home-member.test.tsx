import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import * as memberApi from "@/lib/membershipsApi";
import { useCart } from "@/store/cart";
import { useMemberships } from "@/store/memberships";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { membership, membershipMatch } from "@/test/membershipFixtures";

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

it("asks one clear question, says where the name came from, and promises only up to", async () => {
  await renderInSafeArea(<HomeScreen />);
  expect(await screen.findByText("You’re a Sample Guild member")).toBeTruthy();
  expect(screen.getByText(/Member since Sep 2025 · from your org’s list/)).toBeTruthy();
  expect(screen.getByText("Up to ₱10.00 off each of 5 orders this term")).toBeTruthy();
  expect(screen.getByText("Tap to confirm")).toBeTruthy();
  expect(screen.getByText("Not me")).toBeTruthy();
});

it("shows nothing when no list names this person", async () => {
  api.listMemberships.mockResolvedValue({ serverTime: "2026-11-26T02:00:00.000Z", memberships: [membership()], matches: [] });
  await renderInSafeArea(<HomeScreen />);
  await screen.findByLabelText("Search what GRIDGO prints");
  expect(screen.queryByTestId("member-match-card")).toBeNull();
});

// The one press, last in the file.
it("one tap confirms, and the card says it worked", async () => {
  api.confirmMembershipMatch.mockResolvedValue(membership());
  await renderInSafeArea(<HomeScreen />);
  fireEvent.press(await screen.findByText("Tap to confirm"));
  expect(await screen.findByTestId("member-confirmed-card")).toBeTruthy();
  expect(api.confirmMembershipMatch).toHaveBeenCalledWith("mle_1");
  expect(screen.getByText(/comes off at checkout by itself/)).toBeTruthy();
  expect(screen.queryByText("Tap to confirm")).toBeNull();
});
