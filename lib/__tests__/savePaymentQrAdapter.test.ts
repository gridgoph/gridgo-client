import { savePaymentQrToPhotos } from "@/lib/savePaymentQr";
const mockSave = jest.fn<Promise<void>, unknown[]>(async () => undefined);
jest.mock("expo-media-library", () => ({
  saveToLibraryAsync: () => { throw new Error("Deprecated method"); },
}));
jest.mock("expo-media-library/legacy", () => ({
  requestPermissionsAsync: async () => ({ granted: true }),
  saveToLibraryAsync: (...args: unknown[]) => mockSave(...args),
}));
jest.mock("expo-asset", () => ({
  Asset: { fromModule: () => ({
    downloadAsync: async () => undefined,
    localUri: "file://qr.jpg",
    uri: "file://qr.jpg",
  }) },
}));
it("saves through the SDK 57 legacy adapter", async () => {
  await expect(savePaymentQrToPhotos(null)).resolves.toEqual({ ok: true });
  expect(mockSave).toHaveBeenCalledWith("file://qr.jpg");
});
