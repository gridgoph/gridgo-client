import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ChangeEmailScreen from "@/app/change-email";
import { useSession } from "@/store/session";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
}));

// Same binary as Your details: this screen loads clerkIdentity, which must
// not pull in the picker just because it lives in the same module.
jest.mock("expo-image-picker", () => {
  throw new Error("Cannot find native module 'ExponentImagePicker'");
});

const mockPrepareVerification = jest.fn(async () => undefined);
const mockAttemptVerification = jest.fn(async () => undefined);
const mockCreateEmailAddress = jest.fn(async () => ({
  id: "ea1",
  emailAddress: "new@gridgo.ph",
  prepareVerification: mockPrepareVerification,
  attemptVerification: mockAttemptVerification,
}));
const mockUpdate = jest.fn(async () => undefined);

const mockClerkUser = {
  fullName: "Mark David",
  imageUrl: "https://img.clerk.com/mark.jpg",
  hasImage: true,
  primaryEmailAddress: { emailAddress: "mark@david.ph" },
  createEmailAddress: mockCreateEmailAddress,
  update: mockUpdate,
  reload: jest.fn(async () => undefined),
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser, isLoaded: true }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getAccount: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CLIENT = {
  id: "u1",
  email: "mark@david.ph",
  name: "Mark David",
  role: "client" as const,
  phone: "+639171234567",
  accountType: "individual" as const,
  version: 3,
};

function renderScreen() {
  return render(<ChangeEmailScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

/**
 * Moving the sign-in address, end to end.
 *
 * Two things are being pinned. The first is the shape of the flow — claim the
 * address, answer the code, and only *then* make it primary — because an
 * address verified but never made primary is a client who answered their email
 * and still signs in with the old one. The second is what happens after: the
 * screen only closes once GRIDGO's own copy agrees, so the split ending
 * (Clerk moved, GRIDGO kept its own) cannot be mistaken for success.
 *
 * One test per file by design: the submit drives an async write into a store
 * outside React, and this stack leaves every later render in the same file
 * empty once that has happened (see AGENTS.md).
 */
describe("changing the sign-in email", () => {
  beforeEach(() => {
    mockBack.mockClear();
    api.getAccount.mockReset();
    // GRIDGO copies Clerk's primary address when it reads the account, so the
    // ordinary ending is `/me` coming back carrying the new one.
    api.getAccount.mockResolvedValue({ ...CLIENT, email: "new@gridgo.ph" });
    useSession.setState({
      user: CLIENT,
      source: "clerk",
      loading: false,
      error: null,
      signingOut: false,
    });
  });

  it("claims the address, verifies the code, then makes it the one that signs in", async () => {
    await renderScreen();

    // The screen names the address it is moving away from, from Clerk.
    expect(screen.getByText(/You sign in to GRIDGO with mark@david\.ph/)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("New email"), "new@gridgo.ph");
    // A changeText does not land before the next synchronous press.
    await waitFor(() =>
      expect(screen.getByLabelText("New email").props.value).toBe("new@gridgo.ph"),
    );

    fireEvent.press(screen.getByText("Send code"));

    await waitFor(() => expect(mockCreateEmailAddress).toHaveBeenCalledWith({
      email: "new@gridgo.ph",
    }));
    expect(mockPrepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    // Nothing is primary yet: abandoning here leaves the sign-in untouched.
    expect(mockUpdate).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByLabelText("Verification code")).toBeTruthy());
    expect(screen.getByText(/six-digit code to new@gridgo\.ph/)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Verification code"), "123456");
    await waitFor(() =>
      expect(screen.getByLabelText("Verification code").props.value).toBe("123456"),
    );

    fireEvent.press(screen.getByText("Use this address"));

    await waitFor(() =>
      expect(mockAttemptVerification).toHaveBeenCalledWith({ code: "123456" }),
    );
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ primaryEmailAddressId: "ea1" }),
    );
    // GRIDGO agreed, so there is nothing left to say and the screen closes.
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
