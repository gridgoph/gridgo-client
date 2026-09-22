jest.mock("@/lib/webFilePick", () => ({
  canPickOnWeb: () => true,
  pickFileOnWeb: jest.fn(),
}));

import { pickFileOnWeb } from "@/lib/webFilePick";
import { changeClientPhoto, PORTRAIT_NEEDS_REBUILD } from "@/lib/clerkIdentity";

describe("changeClientPhoto on web", () => {
  it("saves a browser-picked picture and does not ask for a rebuilt app", async () => {
    const file = new File(["face"], "face.png", { type: "image/png" });
    (pickFileOnWeb as jest.Mock).mockResolvedValue({
      uri: "blob:face",
      name: "face.png",
      mimeType: "image/png",
      size: 4,
      file,
    });
    const user = {
      setProfileImage: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    expect(await changeClientPhoto(user)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({ file });
    expect(user.reload).toHaveBeenCalled();
    expect(PORTRAIT_NEEDS_REBUILD).toMatch(/rebuilt GRIDGO app/);
  });
});
