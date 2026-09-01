import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountScreen from "@/app/(tabs)/account";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";

const mockPush = jest.fn();

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
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
}

/*
  The card and what is on it. Kept short and split across three files on
  purpose: Account re-reads `/me` on focus, which is an async write into a
  store outside React, and this project's stack leaves every later render in
  the same file empty once a handful of those have run (see AGENTS.md).
  `account-navigation` and `account-signout` carry the rest.
*/
describe("the identity card", () => {
  beforeEach(() => signedIn());

  it("leads with who GRIDGO thinks this is, and drops the shop app's rows", async () => {
    await renderAccount();

    expect(screen.getByText("Ana Bautista")).toBeTruthy();
    expect(screen.getByText("ana@bautista.ph")).toBeTruthy();
    expect(screen.getByText("Personal client")).toBeTruthy();

    // The shop app's IA. The card and the row lead to the same screen and are
    // named apart, so a screen reader is not offered one destination twice.
    expect(screen.getByLabelText("Your account")).toBeTruthy();
    expect(screen.getByLabelText("Your order, empty")).toBeTruthy();
    expect(screen.getByLabelText("Chat")).toBeTruthy();
    expect(screen.getByLabelText("Your details")).toBeTruthy();
    expect(screen.getByLabelText("Apply as a business")).toBeTruthy();
    expect(screen.getByLabelText("What GRIDGO matches on")).toBeTruthy();
    expect(screen.getByLabelText("Settings")).toBeTruthy();

    // None of the shop's own destinations, and no server URL a client cannot
    // act on — `getApiBase()` used to be a card in the same column as the rows.
    expect(screen.queryByText("Connected server")).toBeNull();
    expect(screen.queryByText(/Earnings/)).toBeNull();
    expect(screen.queryByText(/Accreditation/)).toBeNull();
    expect(screen.queryByText(/Your board/)).toBeNull();
    expect(screen.queryByText(/Capacity/)).toBeNull();

    // Theme stays on Settings; the ranking now lives here and only here.
    expect(screen.queryByText("Theme")).toBeNull();
  });

  it("names a business by its business name, and stops offering the upgrade", async () => {
    signedIn({ ...CLIENT, accountType: "business", orgName: "Bautista Trading" });

    await renderAccount();

    expect(screen.getByText("Bautista Trading")).toBeTruthy();
    // The person is still there, under the name that goes on the jobs.
    expect(screen.getByText("Ana Bautista")).toBeTruthy();
    expect(screen.getByText("Business client")).toBeTruthy();
    expect(screen.queryByLabelText("Apply as a business")).toBeNull();
  });

  it("writes the saved ranking on its row, so it reads without opening", async () => {
    usePriorities.setState({ ranking: ["speed", "quality", "cost", "distance"], loaded: true });

    await renderAccount();

    expect(screen.getByText("Speed · Quality · Cost · Distance")).toBeTruthy();
  });
});
