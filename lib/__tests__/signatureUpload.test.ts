import { Platform } from "react-native";

import * as api from "@/lib/api";
import type { Signature } from "@/lib/signature";
import { uploadSignature } from "@/lib/signatureUpload";

jest.mock("@/lib/api", () => ({
  uploadFile: jest.fn(() => ({ done: Promise.resolve({ fileId: "file_signature" }), abort: jest.fn() })),
}));

const SIGNED: Signature = {
  width: 300,
  height: 150,
  strokes: [
    [
      { x: 20, y: 80 },
      { x: 120, y: 40 },
      { x: 260, y: 90 },
    ],
  ],
};

describe("uploadSignature on the web", () => {
  const os = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "web" });
  });
  afterAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
  });

  it("sends a named PNG file, because GRIDGO refuses a part called \"blob\"", async () => {
    await expect(uploadSignature(SIGNED)).resolves.toBe("file_signature");
    const [asset, purpose] = (api.uploadFile as jest.Mock).mock.calls[0];
    expect(purpose).toBe("approval_signature");
    expect(asset.file).toBeInstanceOf(File);
    expect(asset.file.name).toMatch(/^signature-\d+\.png$/);
    expect(asset.file.type).toBe("image/png");
    const bytes = new Uint8Array(await asset.file.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
