import { parseQrPictureMessage, QR_PICTURE_HTML } from "@/lib/qrPicture";

it("loads one pinned reader, checked by its hash", () => {
  expect(QR_PICTURE_HTML).toContain("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js");
  expect(QR_PICTURE_HTML).toMatch(/integrity="sha384-[A-Za-z0-9+/]{64}"/);
});

it("takes only the messages the page sends", () => {
  expect(parseQrPictureMessage('{"type":"ready"}')).toEqual({ type: "ready" });
  expect(parseQrPictureMessage('{"type":"result","text":"hello"}')).toEqual({ type: "result", text: "hello" });
  expect(parseQrPictureMessage('{"type":"result","text":null}')).toEqual({ type: "result", text: null });
  expect(parseQrPictureMessage('{"type":"offline"}')).toEqual({ type: "offline" });
  expect(parseQrPictureMessage('{"type":"other"}')).toBeNull();
  expect(parseQrPictureMessage("not json")).toBeNull();
  expect(parseQrPictureMessage(12)).toBeNull();
});
