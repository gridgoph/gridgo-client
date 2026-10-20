import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountScreen from "@/app/(tabs)/account";
import type { FoundingTester } from "@/lib/api";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";
import { EARNED } from "@/test/foundingTesterHarness";

/*
  The Founding Tester missions and label on Account. Three tests and no
  presses: Account re-reads `/me` on focus, and that store write spends this
  file's render budget (see AGENTS.md § "Running and testing").
*/

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getAccount: jest.fn(), listVouchers: jest.fn(async () => ({ serverTime: new Date().toISOString(), vouchers: [] })) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CLIENT = {
  id: "u1",
  email: "ana@bautista.ph",
  name: "Ana Bautista",
  role: "client" as const,
  accountType: "individual" as const,
  version: 3,
};

function signedIn(foundingTester?: FoundingTester | null) {
  const user = foundingTester === undefined ? CLIENT : { ...CLIENT, foundingTester };
  api.getAccount.mockReset();
  api.getAccount.mockResolvedValue(user);
  usePriorities.setState({ ranking: null, loaded: true, loading: false, error: null });
  useSession.setState({ user, source: "clerk", loading: false, error: null, signingOut: false });
}

async function renderAccount() {
  const wrap = (ui: ReactElement) =>
    render(ui, {
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
  await wrap(<AccountScreen />);
  await waitFor(() => expect(api.getAccount).toHaveBeenCalled());
}

it("shows the five-step path to an eligible account, with the count and the way to invite", async () => {
  signedIn({
    ...EARNED,
    label: null,
    awardedAt: null,
    reward: null,
    rewardStatus: "pending",
    completedCount: 2,
    missions: { added: true, placed: true, tracked: false, received: false, rated: false },
  });
  await renderAccount();

  expect(await screen.findByText("FOUNDING TESTER")).toBeTruthy();
  expect(screen.getByText("2 of 5 done")).toBeTruthy();
  // Account has not read the orders, so "Track your order" opens the Orders tab.
  expect(screen.getByRole("button", { name: "Open your orders. Step 3 of 5, Track your order, next step" })).toBeTruthy();
  expect(screen.queryByTestId("founding-tester-chip")).toBeNull();
  // On the card and as an Account row.
  expect(screen.getAllByRole("button", { name: "Invite a friend" })).toHaveLength(2);
});

it("puts the earned label on the account and lets the missions go", async () => {
  signedIn(EARNED);
  await renderAccount();

  expect(await screen.findByTestId("founding-tester-chip")).toBeTruthy();
  expect(screen.getByText("Founding Tester")).toBeTruthy();
  expect(screen.queryByTestId("founding-tester-card")).toBeNull();
  // Inviting goes on after the label.
  expect(screen.getByRole("button", { name: "Invite a friend" })).toBeTruthy();
});

it("shows nothing new to an ineligible account or an API without the field", async () => {
  signedIn({ ...EARNED, eligible: false, label: null, awardedAt: null, reward: null, rewardStatus: "ineligible" });
  await renderAccount();

  expect(await screen.findByText("Personal client")).toBeTruthy();
  expect(screen.queryByTestId("founding-tester-card")).toBeNull();
  expect(screen.queryByTestId("founding-tester-chip")).toBeNull();
  expect(screen.queryByText(/Founding Tester/)).toBeNull();
  expect(screen.queryByText("Invite a friend")).toBeNull();
});
