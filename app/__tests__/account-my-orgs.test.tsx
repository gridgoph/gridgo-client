import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountScreen from "@/app/(tabs)/account";
import * as memberApi from "@/lib/membershipsApi";
import { useMemberships } from "@/store/memberships";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";
import { membership, membershipMatch } from "@/test/membershipFixtures";

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  // The real hook needs a navigation container. What matters to this screen is
  // that the callback runs while the screen is on show, which is what focus is.
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getAccount: jest.fn(), logout: jest.fn(async () => undefined) };
});

jest.mock("@/lib/membershipsApi");
const members = jest.mocked(memberApi);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CLIENT = {
  id: "u1",
  email: "ana@bautista.ph",
  name: "Ana Bautista",
  role: "client" as const,
  phone: "+639171234567",
  accountType: "individual" as const,
  version: 3,
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

/** Render, and let the focus re-read of `/me` land before anything is asserted. */
async function renderAccount() {
  await renderInSafeArea(<AccountScreen />);
  await waitFor(() => expect(api.getAccount).toHaveBeenCalled());
}

function signedIn(user: typeof CLIENT | Record<string, unknown> = CLIENT) {
  mockPush.mockClear();
  mockNavigate.mockClear();
  api.getAccount.mockReset();
  api.getAccount.mockResolvedValue(user);
  usePriorities.setState({ ranking: null, loaded: true, loading: false, error: null });
  useSession.setState({
    user: user as typeof CLIENT,
    source: "clerk",
    loading: false,
    error: null,
    signingOut: false,
  });
  useMemberships.getState().reset();
}

const answer = (over: Partial<memberApi.MembershipList>) =>
  members.listMemberships.mockResolvedValue({ serverTime: "2026-11-26T02:00:00.000Z", memberships: [], matches: [], ...over });

it("carries the member label on the identity card and the perk on My orgs", async () => {
  signedIn();
  answer({ memberships: [membership()] });
  await renderAccount();
  expect(await screen.findByText("Sample Guild member")).toBeTruthy();
  expect(screen.getByTestId("member-chip")).toBeTruthy();
  expect(screen.getByText("Sample Guild · up to ₱10.00 off · 3 of 5 left")).toBeTruthy();
});

it("a request that is still waiting earns no label", async () => {
  signedIn();
  answer({ memberships: [membership({ status: "pending" })] });
  await renderAccount();
  expect(await screen.findByText("Sample Guild · waiting for the officer")).toBeTruthy();
  expect(screen.queryByTestId("member-chip")).toBeNull();
});

it("a list that names this person can be answered from here too", async () => {
  signedIn();
  answer({ matches: [membershipMatch()] });
  await renderAccount();
  expect(await screen.findByText("Sample Guild lists you as a member. Open to confirm")).toBeTruthy();
});
