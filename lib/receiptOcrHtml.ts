/**
 * Tesseract.js running inside a WebView.
 *
 * The RN JS thread has no Worker / WASM host, so tesseract.js cannot run
 * there. Expo Go already ships `react-native-webview`, which is a real
 * browser — that is the Expo-Go-safe way to OCR a receipt without a USB
 * development build.
 */
export const RECEIPT_OCR_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"></script>
  </head>
  <body>
    <script>
      var RN = window.ReactNativeWebView;
      function send(payload) {
        if (RN && RN.postMessage) RN.postMessage(JSON.stringify(payload));
      }
      window.onerror = function (msg) {
        send({ type: "error", message: String(msg) });
      };
      function ready() {
        send({ type: "ready" });
      }
      if (window.Tesseract) ready();
      else {
        var n = 0;
        var t = setInterval(function () {
          n += 1;
          if (window.Tesseract) {
            clearInterval(t);
            ready();
          } else if (n > 80) {
            clearInterval(t);
            send({ type: "error", message: "Tesseract.js did not load." });
          }
        }, 50);
      }
      var busy = false;
      window.runOcr = async function (image) {
        if (busy) return;
        busy = true;
        try {
          var worker = await Tesseract.createWorker("eng", 1, {
            workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
            corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js",
            langPath: "https://tessdata.projectnaptha.com/4.0.0",
            logger: function () {},
          });
          var result = await worker.recognize(image);
          await worker.terminate();
          send({
            type: "result",
            text: (result && result.data && result.data.text) || "",
            confidence: result && result.data && typeof result.data.confidence === "number"
              ? result.data.confidence
              : 0,
          });
        } catch (e) {
          send({ type: "error", message: String(e && e.message ? e.message : e) });
        } finally {
          busy = false;
        }
      };
    </script>
  </body>
</html>
`;
