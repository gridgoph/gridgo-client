import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SsoCallbackScreen from "@/app/sso-callback";
import type { User } from "@/lib/api";
import { clientEmailUnavailableMessage } from "@/lib/copy";
import { useSession } from "@/store/session";

const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);
const mockReload = jest.fn();
const mockGetToken = jest.fn(async () => "clerk-jwt");
const mockMe = jest.fn();

const supplier: User = {
  id: "u-supplier",
  email: "shop@gridgo.ph",
  name: "Shop",
  role: "supplier",
};

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    getToken: mockGetToken,
    sessionId: "sess_google",
  }),
  useClerk: () => ({
    setActive: mockSetActive,
    signOut: mockSignOut,
    client: { signIn: { reload: mockReload } },
  }),
  useSignUp: () => ({
    signUp: { create: jest.fn(), createdSessionId: null, finalize: jest.fn() },
  }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: jest.fn(),
  };
});

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: unknown }) => {
      const value = typeof href === "string" ? href : JSON.stringify(href);
      return React.createElement(Text, { testID: "redirect" }, value);
    },
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ replace: jest.fn() }),
  };
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

describe("SSO callback wrong role", () => {
  beforeEach(() => {
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockReload.mockReset();
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockMe.mockReset().mockResolvedValue(supplier);
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
  });

  it("refuses a non-client Google account and does not land on Home", async () => {
    await renderInSafeArea(<SsoCallbackScreen />);

    await waitFor(() =>
      expect(useSession.getState().error).toBe(clientEmailUnavailableMessage),
    );
    expect(useSession.getState().user).toBeNull();
    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByTestId("redirect").props.children).toBe("/(auth)/login");
    expect(screen.queryByText("/(tabs)/home")).toBeNull();
  });
});
