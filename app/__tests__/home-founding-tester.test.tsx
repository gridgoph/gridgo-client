import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { FoundingTester } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { EARNED } from "@/test/foundingTesterHarness";
import { refundOrder } from "@/test/refundFixtures";

/*
  The Founding Tester missions on Home. No presses; Home re-reads the account
  on focus, so the file stays short (see AGENTS.md § "Running and testing").
*/

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getAccount: jest.fn(),
    acknowledgeTesterTracking: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function signedIn(foundingTester?: FoundingTester) {
  const user = {
    id: "user_1",
    name: "Rina Cruz",
    email: "rina@example.com",
    role: "client" as const,
    accountType: "individual" as const,
    ...(foundingTester ? { foundingTester } : {}),
  };
  api.getAccount.mockReset();
  api.getAccount.mockResolvedValue(user);
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useSession.setState({ user } as never);
}

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

it("shows the five-step path to an eligible client and re-reads the account for it", async () => {
  signedIn({
    ...EARNED,
    label: null,
    awardedAt: null,
    reward: null,
    rewardStatus: "pending",
    completedCount: 0,
    missions: { added: false, placed: false, tracked: false, received: false, rated: false },
  });
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("Become a Founding Tester")).toBeTruthy();
  expect(screen.getByText("0 of 5 done")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Choose something to print. Step 1 of 5, Add an item to your cart, next step" })).toBeTruthy();
  expect(api.getAccount).toHaveBeenCalled();
});

it("never counts a paid order on Home as tracked — only its own screen does", async () => {
  api.listOrders.mockResolvedValueOnce([refundOrder({ state: "production" })]);
  signedIn({
    ...EARNED,
    label: null,
    awardedAt: null,
    reward: null,
    rewardStatus: "pending",
    completedCount: 2,
    missions: { added: true, placed: true, tracked: false, received: false, rated: false },
  });
  await renderInSafeArea(<HomeScreen />);

  // The order is on Home, and the next step leads to its tracking screen…
  expect(await screen.findByRole("button", { name: "Track your order. Step 3 of 5, Track your order, next step" })).toBeTruthy();
  // …but Home showing it is not the client opening it.
  expect(api.acknowledgeTesterTracking).not.toHaveBeenCalled();
});

it("drops the card from Home once the label is earned", async () => {
  signedIn(EARNED);
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
  expect(screen.queryByTestId("founding-tester-card")).toBeNull();
});

it("shows nothing new when the API sends no Founding Tester field", async () => {
  signedIn();
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
  expect(screen.queryByText("FOUNDING TESTER")).toBeNull();
  expect(screen.queryByTestId("founding-tester-card")).toBeNull();
});
