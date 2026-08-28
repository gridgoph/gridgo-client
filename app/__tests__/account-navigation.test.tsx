import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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

/* Its own file — see the note in `account.test.tsx`. */
describe("Account destinations", () => {
  beforeEach(() => signedIn());

  it("re-reads the account every time the screen comes into view", async () => {
    // The two screens that change the name are one tap away, so this card must
    // not trust whatever the session held on the way out.
    api.getAccount.mockResolvedValue({ ...CLIENT, name: "Ana R. Bautista" });

    await renderAccount();

    await waitFor(() => expect(screen.getByText("Ana R. Bautista")).toBeTruthy());
  });

  it("opens each one", async () => {
    await renderAccount();

    fireEvent.press(screen.getByLabelText("Your account"));
    expect(mockPush).toHaveBeenCalledWith("/account-details");

    fireEvent.press(screen.getByLabelText("Your details"));
    expect(mockPush).toHaveBeenCalledWith("/account-details");

    fireEvent.press(screen.getByLabelText("Apply as a business"));
    expect(mockPush).toHaveBeenCalledWith("/business-apply");

    // Back where it came from, not Home: a client changing the ranking from
    // Account is put back on Account.
    fireEvent.press(screen.getByLabelText("What GRIDGO matches on"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/priorities",
      params: { returnTo: "account" },
    });

    fireEvent.press(screen.getByLabelText("Settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });
});
