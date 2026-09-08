import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Artwork, payment proof, and deadline pickers are native modules. A USB
 * binary built before they were added throws at **import time**, which is the
 * red overlay on Home / New request / an order. Probe first; never load the
 * JS package unless the native module is on the phone.
 */
const MISSING_DOCUMENTS = "Cannot find native module 'ExpoDocumentPicker'";
const MISSING_DATE = "RNCDatePicker could not be found";

describe("file and deadline pickers must not load at import time", () => {
  it("artwork, payment proof, deadline field, and their screens have no static native import", () => {
    for (const relative of [
      "../nativeModules.ts",
      "../../hooks/useArtworkUpload.ts",
      "../../hooks/usePaymentProof.ts",
      "../../components/form/DateTimeField.tsx",
      "../../components/CorrectionCard.tsx",
      "../../app/(tabs)/new-request.tsx",
      "../../app/order/[id].tsx",
      "../../app/checkout.tsx",
      "../../lib/savePaymentQr.ts",
      "../../components/QrPaySheet.tsx",
    ]) {
      const source = readFileSync(join(__dirname, relative), "utf8");
      expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-document-picker["']/);
      expect(source).not.toMatch(
        /import\s+[^;]*from\s+["']@react-native-community\/datetimepicker["']/,
      );
      expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-media-library["']/);
      expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-file-system(\/legacy)?["']/);
      expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-location["']/);
    }
  });

  it("drop-off location is probed, never imported at load", () => {
    for (const relative of [
      "../deviceLocation.ts",
      "../nativeModules.ts",
      "../../hooks/useDropoffEditor.ts",
      "../../app/request/where.tsx",
      "../../app/saved-place.tsx",
      "../../app/saved-places.tsx",
    ]) {
      const source = readFileSync(join(__dirname, relative), "utf8");
      expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-location["']/);
    }
  });

  it("nativeModules probes before requiring", () => {
    const source = readFileSync(join(__dirname, "../nativeModules.ts"), "utf8");
    expect(source).toContain("requireOptionalNativeModule");
    expect(source).toContain("ExpoDocumentPicker");
    expect(source).toContain("RNCDatePicker");
    expect(source).toContain("ExponentFileSystem");
    expect(source).toContain("ExpoMediaLibrary");
    expect(source).toContain("ExpoLocation");
  });

  it("importing the order screen does not throw when the pickers are absent", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-document-picker", () => {
        throw new Error(MISSING_DOCUMENTS);
      });
      jest.doMock("@react-native-community/datetimepicker", () => {
        throw new Error(MISSING_DATE);
      });
      jest.doMock("expo-modules-core", () => ({
        requireOptionalNativeModule: () => null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(() => require("@/hooks/useArtworkUpload")).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(() => require("@/components/form/DateTimeField")).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(() => require("@/components/CorrectionCard")).not.toThrow();
    });
  });
});
