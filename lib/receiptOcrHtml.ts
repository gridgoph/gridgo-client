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
      window.onunhandledrejection = function (event) {
        send({ type: "error", message: String(event.reason) });
      };
      // Wallet screenshots can be only 316px wide. Give their small reference
      // type enough pixels for recognition without altering the receipt upload.
      async function receiptImage(source) {
        var img = new Image();
        img.src = source;
        await img.decode();
        var scale = Math.min(3, Math.max(1, 1200 / img.naturalWidth));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Merchant QR receipts print the id in light grey. Stretch contrast
        // so Tesseract can see DWQM…-style tokens, not only bold Ref. No.
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = image.data;
        for (var i = 0; i < data.length; i += 4) {
          var y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          var v = Math.max(0, Math.min(255, (y - 128) * 1.6 + 128));
          data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
      }
      var busy = false;
      window.runOcr = async function (image) {
        if (busy) return;
        busy = true;
        var worker;
        try {
          worker = await Tesseract.createWorker("eng", 1, {
            workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
            // Let Tesseract choose SIMD support for this Android WebView.
            corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
            langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
            cachePath: "gridgo-receipt-eng-int-v1",
            logger: function () {},
            errorHandler: function (e) { send({ type: "error", message: String(e) }); },
          });
          var result = await worker.recognize(await receiptImage(image));
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
          if (worker) await worker.terminate();
          busy = false;
        }
      };
    </script>
    <!-- Install runOcr and the error bridge before announcing readiness. -->
    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"
      onload="send({ type: 'ready' })"
      onerror="send({ type: 'error', message: 'The receipt reader could not download.' })"></script>
  </body>
</html>
`;
