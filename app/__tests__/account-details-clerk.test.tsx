import { render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountDetailsScreen from "@/app/account-details";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

// The USB binary the captain is running was built without this native
// module. A static import would throw here and the screen would never paint.
jest.mock("expo-image-picker", () => {
  throw new Error("Cannot find native module 'ExponentImagePicker'");
});

const mockClerkUser = {
  fullName: "Mark David",
  firstName: "Mark",
  lastName: "David",
  imageUrl: "https://img.clerk.com/mark.jpg",
  hasImage: true,
  primaryEmailAddress: { emailAddress: "mark@david.ph" },
  setProfileImage: jest.fn(),
  update: jest.fn(),
  reload: jest.fn(),
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
  email: "old@gridgo.ph",
  name: "Mark David",
  role: "client" as const,
  phone: "+639171234567",
  accountType: "individual" as const,
  version: 3,
};

function renderInSafeArea() {
  return render(<AccountDetailsScreen />, {
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
 * The captain's bug, pinned.
 *
 * **Your details** stayed on grey skeleton bars forever: `load()` awaited
 * `GET /me` before it would build a draft, and the skeleton was drawn while
 * `loading && !draft`. So a `/me` that hung — or answered 401 on a LAN dev
 * API — meant the form never appeared, while Clerk had the person in memory
 * and the session already held the account.
 *
 * Every test here therefore leaves `/me` unresolved or refused. Nothing the
 * client can already be told is allowed to wait on it.
 */
/**
 * A `/me` that never answers, and a way to settle it at teardown.
 *
 * The hang is the point of these tests, but leaving one behind would leave
 * `loadAccount`'s own timeout timer running past the run and hold Jest open.
 */
let releaseAccount: (() => void) | null = null;

function hangingAccount(): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    releaseAccount = () => reject(new Error("test teardown"));
  });
}

describe("Your details, while /me has not answered", () => {
  afterEach(() => {
    // Unmount before settling it: the screen is gone, so the late answer has
    // nothing to set state on and the teardown stays quiet.
    screen.unmount();
    releaseAccount?.();
    releaseAccount = null;
  });

  beforeEach(() => {
    api.getAccount.mockReset();
    useSession.setState({
      user: CLIENT,
      source: "clerk",
      loading: false,
      error: null,
      signingOut: false,
    });
  });

  it("paints Clerk's name and email without waiting on /me", async () => {
    // Never resolves. This is the hung request from the screenshot.
    api.getAccount.mockImplementation(hangingAccount);

    await renderInSafeArea();

    expect(screen.getByText("Mark David")).toBeTruthy();
    // Clerk's address, not GRIDGO's stale copy.
    expect(screen.getByLabelText("Email, mark@david.ph")).toBeTruthy();
    expect(screen.queryByText("old@gridgo.ph")).toBeNull();
  });

  it("shows the editable fields rather than skeleton bars", async () => {
    api.getAccount.mockImplementation(hangingAccount);

    await renderInSafeArea();

    // The whole defect in one assertion: fields, seeded from the session that
    // was already in memory, with no successful read behind them.
    expect(screen.getByLabelText("Your name").props.value).toBe("Mark David");
    expect(screen.getByLabelText("Mobile number").props.value).toBe("+639171234567");
    expect(screen.queryByLabelText("Loading your account")).toBeNull();
  });

  it("offers the sign-in rows and the picture control straight away", async () => {
    api.getAccount.mockImplementation(hangingAccount);

    await renderInSafeArea();

    expect(screen.getByLabelText("Password, ••••••••")).toBeTruthy();
    // `hasImage` is true, so the control offers to replace rather than add.
    expect(screen.getByLabelText("Change your picture")).toBeTruthy();
    expect(screen.getByText("Change photo")).toBeTruthy();
  });

  it("says a refused read quietly, under details that are still on screen", async () => {
    api.getAccount.mockRejectedValue(new Error("unauthorized"));

    await renderInSafeArea();

    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    // Quiet: a line and a link, not a blank form and not a red panel where the
    // account used to be.
    expect(screen.getByLabelText("Your name").props.value).toBe("Mark David");
    expect(screen.getByText("Mark David")).toBeTruthy();
    expect(screen.queryByText("Details unavailable")).toBeNull();
  });
});
