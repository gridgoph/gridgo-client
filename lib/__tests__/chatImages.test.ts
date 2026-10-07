import { addChatPhotos } from "@/lib/chatImages";

const photo = (name: string, extra: Record<string, unknown> = {}) => ({
  uri: `file:///cache/${name}`,
  name,
  mimeType: "image/jpeg",
  size: 1024,
  ...extra,
});
const keep = (asset: { uri: string; name: string; mimeType: string }) => asset;

describe("addChatPhotos", () => {
  it("adds picked photos after the ones already waiting", () => {
    const result = addChatPhotos([photo("a.jpg")], [photo("b.jpg")], keep);
    expect(result).toEqual({ ok: true, pending: [photo("a.jpg"), { uri: "file:///cache/b.jpg", name: "b.jpg", mimeType: "image/jpeg" }] });
  });

  it("stops at four photos a message", () => {
    const four = ["a", "b", "c", "d"].map((n) => photo(`${n}.jpg`));
    expect(addChatPhotos(four, [photo("e.jpg")], keep)).toEqual({ ok: false, error: "A message can include up to 4 photos." });
  });

  it("refuses a file that is not a photo or is too large", () => {
    expect(addChatPhotos([], [photo("plan.pdf", { mimeType: "application/pdf" })], keep)).toEqual({
      ok: false,
      error: "Choose a JPEG, PNG, or WebP photo.",
    });
    expect(addChatPhotos([], [photo("big.jpg", { size: 16 * 1024 * 1024 })], keep)).toEqual({
      ok: false,
      error: "Photos can be up to 15 MB.",
    });
  });
});
