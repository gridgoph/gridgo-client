import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import type { User } from "@/lib/api";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";

const mappedClient: User = {
  id: "u-client",
  email: "markdavidprado@gmail.com",
  name: "Mark David Prado",
  role: "client",
  accountType: "individual",
};

const mockMe = jest.fn();
const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockGetToken = jest.fn(async (): Promise<string | null> => "clerk-jwt");
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);

let mockFetchStatus = "idle";
let mockSignInPresent = true;

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: mockSignInPresent
      ? {
          password: (...args: unknown[]) => mockPassword(...args),
          finalize: (...args: unknown[]) => mockFinalize(...args),
          create: jest.fn(),
          resetPasswordEmailCode: {
            sendCode: jest.fn(),
            verifyCode: jest.fn(),
            submitPassword: jest.fn(),
          },
          get status() {
            return "complete";
          },
        }
      : undefined,
    fetchStatus: mockFetchStatus,
  }),
  useAuth: () => ({
    isSignedIn: false,
    isLoaded: true,
    getToken: mockGetToken,
    sessionId: null,
  }),
  useClerk: () => ({ setActive: mockSetActive, signOut: mockSignOut }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: jest.fn(),
    setTokenProvider: jest.fn(),
  };
});

jest.mock("@/components/auth/GoogleButton", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require("react-native");
  return {
    GoogleButton: ({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={onPress}
        disabled={disabled}
      >
        <Text>Continue with Google</Text>
      </Pressable>
    ),
  };
});

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock("@react-navigation/native", () => ({
  usePreventRemove: jest.fn(),
}));

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

async function fillCredentials() {
  fireEvent.changeText(screen.getByLabelText("Email"), "markdavidprado@gmail.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
  await waitFor(() =>
    expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
  );
}

beforeEach(() => {
  mockFetchStatus = "idle";
  mockSignInPresent = true;
  mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
  mockPassword.mockReset().mockResolvedValue({ error: null });
  mockFinalize.mockReset().mockResolvedValue({ error: null });
  mockSetActive.mockReset().mockResolvedValue(undefined);
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockMe.mockReset().mockResolvedValue(mappedClient);
  useLoginFlow.getState().reset();
  useSession.setState({
    user: null,
    source: null,
    loading: false,
    error: null,
    pendingClerkProfile: false,
    justProvisioned: false,
    signingOut: false,
    clerkSyncNonce: 0,
  });
});

/**
 * The captain's report: after using the app they could not tap Sign In again.
 *
 * Every case across these files is a way the button used to be disabled by
 * something that was not the person's tap — a background sync that never
 * finished, a Clerk fetch that hung, a flag that outlived the screen. Sign In
 * answers a filled form; nothing else gets a vote.
 *
 * One interacting test per file, per the testing notes in AGENTS.md: the
 * `fireEvent` calls that drive one attempt empty every later `render` in the
 * same file.
 */
describe("Sign In and a Clerk fetch that never settles", () => {
  it("takes the tap anyway", async () => {
    // `fetchStatus` may say what is happening on the label. It may not decide
    // whether the control answers — one that hangs is indistinguishable from a
    // dead button, and that is what people reported.
    mockFetchStatus = "fetching";
    await renderInSafeArea(<LoginScreen />);
    await fillCredentials();

    const button = screen.getByRole("button", { name: "Signing in…" });
    expect(button.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(button);

    await waitFor(() => expect(mockPassword).toHaveBeenCalled());
  });
});
