/**
 * Reading a QR out of a picture: a screenshot from a group chat, or a photo of
 * a poster (gridgo-client#475). The app has no camera module, so the phone's
 * own camera scans a QR and opens its link; this covers the QR that is already
 * a picture on the phone.
 *
 * It runs in a page of its own, the way the receipt reader does: a hidden
 * WebView on a phone, a sandboxed frame in a browser. The picture stays on the
 * phone; nothing is uploaded.
 *
 * Bump the version and the integrity hash must be recomputed, or the reader
 * silently stops loading:
 *   curl -s <url> | openssl dgst -sha384 -binary | base64
 */

const READER_SRC = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
const READER_SHA = "sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx";

/** Big enough for a QR in a poster photo, small enough for an old phone. */
const MAX_SIDE = 1400;

export const QR_PICTURE_TIMEOUT_MS = 20_000;

export const QR_PICTURE_HTML = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>
      function send(payload) {
        var text = JSON.stringify(payload);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
        else if (window.parent !== window) window.parent.postMessage(text, "*");
      }
      window.onerror = function () { send({ type: "error" }); };
      window.onunhandledrejection = function () { send({ type: "error" }); };
      window.readQr = async function (source) {
        try {
          var img = new Image();
          img.src = source;
          await img.decode();
          // A QR that fills the picture reads best small, one in a poster photo large.
          var sides = [${MAX_SIDE}, 800, 480];
          for (var i = 0; i < sides.length; i++) {
            var scale = Math.min(1, sides[i] / Math.max(img.naturalWidth, img.naturalHeight));
            var canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            var ctx = canvas.getContext("2d");
            // A transparent screenshot would read as black on black.
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var found = jsQR(data.data, data.width, data.height);
            if (found && found.data) return send({ type: "result", text: found.data });
          }
          send({ type: "result", text: null });
        } catch (e) {
          send({ type: "error" });
        }
      };
      // A browser frame is handed its picture as a message.
      window.addEventListener("message", function (event) {
        if (event.source === window.parent && typeof event.data === "string" && event.data.indexOf("data:image/") === 0)
          window.readQr(event.data);
      });
    </script>
    <script src="${READER_SRC}" integrity="${READER_SHA}" crossorigin="anonymous"
      onload="send({ type: 'ready' })" onerror="send({ type: 'offline' })"></script>
  </body>
</html>
`;

export type QrPictureMessage =
  | { type: "ready" }
  /** `text` is null when the picture holds no QR it can read. */
  | { type: "result"; text: string | null }
  | { type: "error" }
  /** The reader itself could not download. */
  | { type: "offline" };

export function parseQrPictureMessage(data: unknown): QrPictureMessage | null {
  if (typeof data !== "string") return null;
  try {
    const payload = JSON.parse(data) as { type?: unknown; text?: unknown };
    switch (payload?.type) {
      case "ready":
        return { type: "ready" };
      case "result":
        return { type: "result", text: typeof payload.text === "string" && payload.text ? payload.text : null };
      case "error":
        return { type: "error" };
      case "offline":
        return { type: "offline" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export const QR_PICTURE_NONE = "No QR was found in that picture. Try a clearer one, or paste the link.";
export const QR_PICTURE_OFFLINE = "The QR reader could not load. Check your internet, or paste the link.";
export const QR_PICTURE_FAILED = "That picture could not be read. Try another one, or paste the link.";
