import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockRequestPermissionsAsync = jest.fn();
const mockSaveToLibraryAsync = jest.fn();

jest.mock("@/lib/nativeModules", () => ({
  getMediaLibraryNative: () => ({
    requestPermissionsAsync: mockRequestPermissionsAsync,
    saveToLibraryAsync: mockSaveToLibraryAsync,
  }),
  getFileSystemLegacyNative: () => ({
    cacheDirectory: "file://cache/",
    downloadAsync: jest.fn(),
  }),
}));

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: jest.fn(async () => undefined),
      localUri: "file://bundled-qr.jpg",
      uri: "file://bundled-qr.jpg",
    }),
  },
}));

import {
  SAVE_QR_DENIED,
  SAVE_QR_LABEL,
  savePaymentQrToPhotos,
  saveQrMessage,
} from "@/lib/savePaymentQr";

describe("savePaymentQrToPhotos", () => {
  beforeEach(() => {
    mockRequestPermissionsAsync.mockReset();
    mockSaveToLibraryAsync.mockReset();
  });

  it("asks permission on the tap and saves the bundled plate", async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockSaveToLibraryAsync.mockResolvedValue(undefined);

    await expect(savePaymentQrToPhotos(null)).resolves.toEqual({ ok: true });
    expect(mockRequestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(mockSaveToLibraryAsync).toHaveBeenCalledWith("file://bundled-qr.jpg");
  });

  it("returns denied when the phone refuses photos", async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(savePaymentQrToPhotos(null)).resolves.toEqual({
      ok: false,
      reason: "denied",
    });
    expect(mockSaveToLibraryAsync).not.toHaveBeenCalled();
    expect(saveQrMessage({ ok: false, reason: "denied" })).toBe(SAVE_QR_DENIED);
  });
});

describe("save QR copy", () => {
  it("is Save QR, not a yellow verb", () => {
    expect(SAVE_QR_LABEL).toBe("Save QR");
  });
});

describe("app.json media library plugin", () => {
  it("wires the plugin with save-photos copy", () => {
    const appJson = JSON.parse(
      readFileSync(join(__dirname, "../../app.json"), "utf8"),
    ) as { expo: { plugins: unknown[] } };
    const plugin = appJson.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === "expo-media-library",
    ) as [string, { photosPermission?: string; savePhotosPermission?: string }];
    expect(plugin).toBeTruthy();
    expect(plugin[1].savePhotosPermission).toMatch(/payment QR/i);
    expect(plugin[1].photosPermission).toMatch(/save the payment QR/i);
  });
});
