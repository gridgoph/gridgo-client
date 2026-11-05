import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import { getApiBase } from "@/lib/api";
import { CONNECTION_ERROR_MESSAGE } from "@/lib/connectionError";
import { useSession } from "@/store/session";

const mockSignedIn = true;
const mockPassword = jest.fn();
const mockMe = jest.fn();

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: {
      password: (...args: unknown[]) => mockPassword(...args),
      finalize: jest.fn(async () => ({ error: null })),
      create: jest.fn(),
      resetPasswordEmailCode: { sendCode: jest.fn(), verifyCode: jest.fn(), submitPassword: jest.fn() },
      status: "complete",
    },
    fetchStatus: "idle",
  }),
  useAuth: () => ({
    isSignedIn: mockSignedIn,
    isLoaded: true,
    getToken: jest.fn(async () => "clerk-jwt"),
    sessionId: mockSignedIn ? "sess_1" : null,
  }),
  useClerk: () => ({ setActive: jest.fn(async () => undefined), signOut: jest.fn(async () => undefined) }),
}));

jest.mock("@clerk/expo/experimental", () => ({ useSSO: () => ({ startSSOFlow: jest.fn() }) }));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  me: (...args: unknown[]) => mockMe(...args),
}));

jest.mock("@/components/auth/GoogleButton", () => ({ GoogleButton: () => null }));

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

async function tapSignIn() {
  await render(<LoginScreen />, {
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
  fireEvent.changeText(screen.getByLabelText("Email"), "client@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
  await waitFor(() => expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"));
  fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
}

/** The words a person can read: the text nodes, not props such as an icon's namespace URL. */
function textOnScreen(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOnScreen).join(" ");
  const children = (node as { children?: unknown } | null)?.children;
  return children ? textOnScreen(children) : "";
}

function expectNothingTechnicalOnScreen(raw: string) {
  const onScreen = textOnScreen(screen.toJSON());
  expect(onScreen).toContain(CONNECTION_ERROR_MESSAGE);
  expect(onScreen).not.toContain(getApiBase());
  expect(onScreen.toLowerCase()).not.toContain("http");
  expect(onScreen).not.toContain(raw);
}


/*
  The reported screen: Clerk accepted the person, then GRIDGO's API could not
  be reached. Its own file because a whole login attempt spends the file (see
  AGENTS.md on this testing stack).
*/
it("says the one message on the sign-in screen when the API cannot be reached", async () => {
  // Android's fetch, in its own words.
  const raw = `fetch failed: java.net.UnknownHostException: Unable to resolve host "${new URL(getApiBase()).hostname}"`;
  mockPassword.mockResolvedValue({ error: null });
  mockMe.mockRejectedValue(new Error(raw));
  useSession.setState({ user: null, loading: false, error: null, source: null });

  await tapSignIn();

  expect(await screen.findByText(CONNECTION_ERROR_MESSAGE)).toBeTruthy();
  expectNothingTechnicalOnScreen(raw);
});
