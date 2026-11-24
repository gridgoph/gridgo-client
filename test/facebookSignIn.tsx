/**
 * One Clerk double for the Facebook sign-in screens (gridgo-client#448).
 *
 * Clerk's dev instance does not offer Facebook, so every Facebook path —
 * email returned, no email then a code, an existing account, a closed window,
 * the connection switched off — is driven here from mocked Clerk answers.
 *
 * Each test file wires the modules to this harness:
 *
 *   jest.mock("@clerk/expo", () => require("@/test/facebookSignIn").clerkExpoMock);
 *   jest.mock("@clerk/expo/experimental", () => require("@/test/facebookSignIn").experimentalMock);
 *   jest.mock("expo-router", () => require("@/test/facebookSignIn").routerMock);
 *   jest.mock("@/lib/api", () => require("@/test/facebookSignIn").apiMock());
 *
 * and resets it in `beforeEach` with `resetFacebookHarness()`.
 */

import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { User } from "@/lib/api";

type Answer = { error: unknown };
const ok = async (): Promise<Answer> => ({ error: null });

export const existingClient: User = {
  id: "u-existing",
  email: "ana@example.com",
  name: "Ana Santos",
  role: "client",
  accountType: "individual",
};

function freshSignUp() {
  return {
    status: "missing_requirements" as string,
    missingFields: ["email_address"] as string[],
    requiredFields: ["email_address"] as string[],
    optionalFields: ["phone_number"] as string[],
    unverifiedFields: [] as string[],
    createdSessionId: null as string | null,
    create: jest.fn(ok),
    update: jest.fn(ok),
    finalize: jest.fn(ok),
    verifications: {
      sendEmailCode: jest.fn(ok),
      verifyEmailCode: jest.fn(ok),
      sendPhoneCode: jest.fn(ok),
      verifyPhoneCode: jest.fn(ok),
    },
  };
}

function freshSignIn() {
  return {
    status: "needs_identifier" as string,
    identifier: null as string | null,
    supportedFirstFactors: [] as { strategy: string }[],
    firstFactorVerification: { status: null as string | null },
    create: jest.fn(ok),
    reload: jest.fn(async (_args?: unknown): Promise<unknown> => null),
    finalize: jest.fn(ok),
    password: jest.fn(ok),
    emailCode: { sendCode: jest.fn(ok), verifyCode: jest.fn(ok) },
    phoneCode: { sendCode: jest.fn(ok), verifyCode: jest.fn(ok) },
    resetPasswordEmailCode: {
      sendCode: jest.fn(ok),
      verifyCode: jest.fn(ok),
      submitPassword: jest.fn(ok),
    },
    mfa: {},
  };
}

export const fb = {
  /** Clerk lists `oauth_facebook` among its sign-in strategies. */
  offered: true,
  isSignedIn: false,
  sessionId: null as string | null,
  startSSOFlow: jest.fn(),
  setActive: jest.fn(async (_args: { session: string }) => undefined),
  signOut: jest.fn(async () => undefined),
  getToken: jest.fn(async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt"),
  me: jest.fn(async (_options?: unknown): Promise<User | null> => existingClient),
  activate: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  redirect: jest.fn(),
  params: {} as Record<string, string>,
  signUp: freshSignUp(),
  signIn: freshSignIn(),
};

export function resetFacebookHarness() {
  fb.offered = true;
  fb.isSignedIn = false;
  fb.sessionId = null;
  fb.startSSOFlow.mockReset();
  fb.setActive.mockReset().mockResolvedValue(undefined);
  fb.signOut.mockReset().mockResolvedValue(undefined);
  fb.getToken.mockReset().mockResolvedValue("clerk-jwt");
  fb.me.mockReset().mockResolvedValue(existingClient);
  fb.activate.mockReset();
  fb.push.mockReset();
  fb.replace.mockReset();
  fb.redirect.mockReset();
  fb.params = {};
  fb.signUp = freshSignUp();
  fb.signIn = freshSignIn();
  // Required here, not imported: the stores load `@/lib/api`, whose mock loads
  // this file, so a top-level import would ask for the mock while it is built.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useSocialFinish } = require("@/store/socialFinish") as typeof import("@/store/socialFinish");
  const { useSession } = require("@/store/session") as typeof import("@/store/session");
  /* eslint-enable @typescript-eslint/no-require-imports */
  useSocialFinish.getState().reset();
  useSession.setState({
    user: null,
    loading: false,
    error: null,
    source: null,
    pendingClerkProfile: false,
    justProvisioned: false,
    signingOut: false,
    ssoInFlight: false,
    sessionWait: null,
    clerkSyncNonce: 0,
  });
}

export const clerkExpoMock = {
  useAuth: () => ({
    isSignedIn: fb.isSignedIn,
    isLoaded: true,
    getToken: fb.getToken,
    sessionId: fb.sessionId,
  }),
  useClerk: () => ({
    setActive: fb.setActive,
    signOut: fb.signOut,
    client: { signIn: fb.signIn },
    __internal_environment: {
      userSettings: {
        authenticatableSocialStrategies: fb.offered
          ? ["oauth_google", "oauth_facebook"]
          : ["oauth_google"],
      },
    },
  }),
  useSignIn: () => ({ signIn: fb.signIn, fetchStatus: "idle" }),
  useSignUp: () => ({ signUp: fb.signUp, fetchStatus: "idle" }),
  useUser: () => ({ user: null }),
};

export const experimentalMock = {
  useSSO: () => ({ startSSOFlow: fb.startSSOFlow }),
};

export const routerMock = {
  Redirect: ({ href }: { href: unknown }) => {
    fb.redirect(href);
    return null;
  },
  useRouter: () => ({
    push: fb.push,
    replace: fb.replace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => fb.params,
};

export function apiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (options?: unknown) => fb.me(options),
    activateClerkClient: (...args: unknown[]) => fb.activate(...args),
  };
}

export function renderInSafeArea(ui: ReactElement) {
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
