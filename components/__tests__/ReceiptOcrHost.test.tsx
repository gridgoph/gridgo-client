import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ReceiptOcrHost } from "@/components/ReceiptOcrHost";
import { enqueueReceiptOcr, pendingReceiptOcr } from "@/lib/receiptOcrRecognize";

const mockInject = jest.fn();
jest.mock("react-native-webview", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const WebView = React.forwardRef(function MockWebView(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
      return <View {...props} testID="ocr-webview" />;
  });
  return { WebView };
});

it("injects a receipt queued after mount only after ready, then removes the completed host", async () => {
  await render(<ReceiptOcrHost />);
  expect(screen.queryByTestId("ocr-webview", { includeHiddenElements: true })).toBeNull();
  let result!: ReturnType<typeof enqueueReceiptOcr>;
  await act(async () => { result = enqueueReceiptOcr("data:image/png;base64,receipt"); });
  await screen.findByTestId("ocr-webview", { includeHiddenElements: true });
  expect(mockInject).not.toHaveBeenCalled();
  fireEvent(screen.getByTestId("ocr-webview", { includeHiddenElements: true }), "message", {
    nativeEvent: { data: JSON.stringify({ type: "ready" }) },
  });
  await waitFor(() => expect(mockInject).toHaveBeenCalledWith('window.runOcr("data:image/png;base64,receipt"); true;'));
  await act(async () => {
    fireEvent(screen.getByTestId("ocr-webview", { includeHiddenElements: true }), "message", {
      nativeEvent: { data: JSON.stringify({ type: "result", text: "GCash Reference No. 965373469", confidence: 90 }) },
    });
    await result;
  });
  expect(pendingReceiptOcr()).toBeNull();
  expect(screen.queryByTestId("ocr-webview", { includeHiddenElements: true })).toBeNull();
});
