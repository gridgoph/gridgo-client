import { File as DeviceFile } from "expo-file-system";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountDetailsScreen from "@/app/account-details";
import { PORTRAIT_FAILED } from "@/lib/clerkIdentity";
import { useSession } from "@/store/session";

/**
 * gridgo-client#336 on the screen: a save that fails says so plainly and
 * offers Try again, which sends the same picture without reopening the
 * library. Its own file, because a test that presses twice empties every
 * later render in the file (see AGENTS.md); the two-press test goes last.
 */

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const PICKED = "file:///mock/cache/portrait.jpg";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///mock/cache/portrait.jpg" }],
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImagePicker = require("expo-image-picker") as { launchImageLibraryAsync: jest.Mock };

const RAW = "ClerkJS: Network error at /v1/me/profile_image: Unsupported FormDataPart implementation";

const mockClerkUser = {
  fullName: "Mark David",
  firstName: "Mark",
  lastName: "David",
  imageUrl: "https://img.clerk.com/initials.png",
  hasImage: false,
  primaryEmailAddress: { emailAddress: "mark@david.ph" },
  setProfileImage: jest.fn(),
  update: jest.fn(),
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

describe("Your details, when a picture does not save", () => {
  beforeEach(() => {
    new DeviceFile(PICKED).write(new Uint8Array([255, 216, 255, 217]));
    api.getAccount.mockReset();
    api.getAccount.mockResolvedValue(CLIENT);
    mockClerkUser.setProfileImage.mockReset();
    mockClerkUser.reload.mockClear();
    ImagePicker.launchImageLibraryAsync.mockClear();
    useSession.setState({
      user: CLIENT,
      source: "clerk",
      loading: false,
      error: null,
      signingOut: false,
    });
  });

  it("says it plainly, never Clerk's raw error, and offers Try again", async () => {
    mockClerkUser.setProfileImage.mockRejectedValue(new Error(RAW));
    await renderInSafeArea();

    fireEvent.press(screen.getByText("Add a photo"));

    expect(await screen.findByText("Photo not saved")).toBeTruthy();
    expect(screen.getByText(PORTRAIT_FAILED)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByText(/FormDataPart|ClerkJS/)).toBeNull();
    // What went up was the picture's bytes, not React Native's descriptor.
    expect(mockClerkUser.setProfileImage).toHaveBeenCalledWith({
      file: expect.any(DeviceFile),
    });
  });

  it("sends the same picture again on Try again, without reopening the library", async () => {
    mockClerkUser.setProfileImage
      .mockRejectedValueOnce(new Error(RAW))
      .mockResolvedValueOnce(undefined);
    await renderInSafeArea();

    fireEvent.press(screen.getByText("Add a photo"));
    fireEvent.press(await screen.findByText("Try again"));

    await screen.findByText("Add a photo");
    expect(mockClerkUser.setProfileImage).toHaveBeenCalledTimes(2);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(mockClerkUser.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Photo not saved")).toBeNull();
  });
});
