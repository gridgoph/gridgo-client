jest.mock("@/lib/webFilePick", () => ({
  canPickOnWeb: () => true,
  pickFileOnWeb: jest.fn(),
}));

import { pickFileOnWeb } from "@/lib/webFilePick";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";

describe("getDocumentPickerNative on web", () => {
  it("offers a file pick when ExpoDocumentPicker is not on the binary", async () => {
    const file = { name: "receipt.jpg" };
    (pickFileOnWeb as jest.Mock).mockResolvedValue({
      uri: "blob:receipt",
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      size: 1200,
      file,
    });

    const picker = getDocumentPickerNative();
    expect(picker).not.toBeNull();
    const result = await picker!.getDocumentAsync({ type: ["image/jpeg", "image/png"] });
    expect(pickFileOnWeb).toHaveBeenCalledWith("image/jpeg,image/png");
    expect(result).toEqual({
      canceled: false,
      assets: [
        {
          uri: "blob:receipt",
          name: "receipt.jpg",
          mimeType: "image/jpeg",
          size: 1200,
          file,
        },
      ],
    });
    expect(FILE_PICKER_NEEDS_REBUILD).toMatch(/rebuilt GRIDGO app/);
  });
});
