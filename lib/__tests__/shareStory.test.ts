import { Platform, Share } from "react-native";

import { shareLink, shareStory } from "@/lib/shareStory";

const mockShareAsync = jest.fn(async () => undefined);
const mockWrite = jest.fn(async () => undefined);
let mockSharing: { shareAsync: typeof mockShareAsync } | null = { shareAsync: mockShareAsync };
jest.mock("@/lib/nativeModules", () => ({
  getSharingNative: () => mockSharing,
  getFileSystemLegacyNative: () => ({
    cacheDirectory: "file:///cache/",
    writeAsStringAsync: mockWrite,
    EncodingType: { Base64: "base64" },
  }),
}));
jest.mock("@/lib/copyText", () => ({ copyText: jest.fn(async () => true) }));

const LINK = "https://forms.example/signup?code=ABC";
const STORY = { png: "iVBORw0KGgo=", text: `Sign up with my link: ${LINK}`, link: LINK, fileName: "story.png" };

function on(os: typeof Platform.OS) {
  jest.replaceProperty(Platform, "OS", os);
}

afterEach(() => {
  jest.restoreAllMocks();
  mockSharing = { shareAsync: mockShareAsync };
});

describe("Android: the chooser never says whether anything was sent", () => {
  it("reports the picture's sheet as opened, never shared, even when Back closed it", async () => {
    on("android");
    // expo-sharing resolves null for every result, a post and Back alike.
    const outcome = await shareStory(STORY);
    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/story.png", expect.objectContaining({ mimeType: "image/png" }));
    expect(outcome).toEqual({ kind: "opened", linkCopied: true });
  });

  it("reports the text-only fallback of an older APK as unconfirmed", async () => {
    on("android");
    mockSharing = null;
    jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    expect(await shareStory(STORY)).toEqual({ kind: "text_only", confirmed: false });
  });

  it("reports Send to a friend as opened, with the link alone", async () => {
    on("android");
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    expect(await shareLink(LINK)).toEqual({ kind: "opened", linkCopied: false });
    expect(share).toHaveBeenCalledWith({ message: LINK });
  });
});

describe("iOS: the sheet says whether it was sent or dismissed", () => {
  it("shares the picture with the text, and knows a dismissal from a share", async () => {
    on("ios");
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValueOnce({ action: Share.sharedAction })
      .mockResolvedValueOnce({ action: Share.dismissedAction });
    expect(await shareStory(STORY)).toEqual({ kind: "shared", linkCopied: false });
    expect(share).toHaveBeenCalledWith({ url: "file:///cache/story.png", message: STORY.text });
    expect(await shareStory(STORY)).toEqual({ kind: "cancelled" });
  });
});
