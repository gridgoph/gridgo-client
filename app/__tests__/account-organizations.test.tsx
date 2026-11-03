import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountScreen from "@/app/(tabs)/account";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";

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
}

const APPROVED_ORGANIZATION = {
  ...CLIENT,
  email: "pta@school.edu.ph",
  name: "Ana Bautista",
  accountType: "organization" as const,
  orgName: "Mintal PTA",
  approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 3 },
};

/*
  Organizations left the tab bar for Account (Mark's option 5): a fifth tab put
  the centre "+" off the middle. Same gate, same screen behind it. Its own file
  — see the note in `account.test.tsx`.
*/
describe("Account's way into Organizations", () => {
  it("is not offered to a personal account", async () => {
    signedIn();
    await renderAccount();

    expect(screen.queryByLabelText("Organizations")).toBeNull();
    expect(screen.getByLabelText("Register an organization or business")).toBeTruthy();
  });

  it("is offered to an approved organization, named, under its own heading", async () => {
    signedIn(APPROVED_ORGANIZATION);
    await renderAccount();

    expect(screen.getByText("YOUR ORGANIZATION")).toBeTruthy();
    expect(screen.getByLabelText("Organizations").props.accessibilityHint).toMatch(/^Mintal PTA · statements/);
    expect(screen.getByLabelText("Officer of record")).toBeTruthy();
    // Nothing left to apply for.
    expect(screen.queryByLabelText("Register an organization or business")).toBeNull();
  });

  // The one press in this file goes last.
  it("opens the same Organizations screen the tab did", async () => {
    signedIn(APPROVED_ORGANIZATION);
    await renderAccount();

    fireEvent.press(screen.getByLabelText("Organizations"));

    expect(mockNavigate).toHaveBeenCalledWith("/(tabs)/organizations");
  });
});
