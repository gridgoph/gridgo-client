import { File as DeviceFile } from "expo-file-system";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountDetailsScreen from "@/app/account-details";
import { PORTRAIT_GONE } from "@/lib/clerkIdentity";
import { useSession } from "@/store/session";

/**
 * gridgo-client#336 review: when the held picture has gone from the phone,
 * Try again would resend a deleted file forever. The screen offers a fresh
 * choice instead. Its own file, because the test presses twice (see
 * AGENTS.md).
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

describe("Your details, when the chosen picture is gone", () => {
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

  it("offers Choose a photo, which reopens the library, instead of Try again", async () => {
    // The upload fails and the picker's cache copy is cleared with it.
    mockClerkUser.setProfileImage.mockImplementationOnce(async () => {
      new DeviceFile(PICKED).delete();
      throw new Error("Network request failed");
    });
    await renderInSafeArea();

    fireEvent.press(screen.getByText("Add a photo"));

    expect(await screen.findByText(PORTRAIT_GONE)).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();

    new DeviceFile(PICKED).write(new Uint8Array([255, 216, 255, 217]));
    fireEvent.press(screen.getByText("Choose a photo"));

    await screen.findByText("Add a photo");
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2);
    expect(mockClerkUser.setProfileImage).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Photo not saved")).toBeNull();
  });
});
