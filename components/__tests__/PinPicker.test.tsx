import { render, waitFor } from "@testing-library/react-native";

import { PinPicker } from "@/components/PinPicker.native";
import { externalPinScript } from "@/lib/mapHtml";

const mockInjectJavaScript = jest.fn();

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  const WebView = React.forwardRef(
    (
      props: { onLoadEnd?: () => void; accessibilityLabel?: string },
      ref: React.Ref<{ injectJavaScript: typeof mockInjectJavaScript }>,
    ) => {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
      React.useEffect(() => {
        props.onLoadEnd?.();
      }, [props]);
      return React.createElement(View, { accessibilityLabel: props.accessibilityLabel });
    },
  );
  WebView.displayName = "WebView";
  return { __esModule: true, WebView, default: WebView };
});

describe("PinPicker", () => {
  beforeEach(() => {
    mockInjectJavaScript.mockClear();
  });

  it("injects an externally set point into the live map", async () => {
    const onPick = jest.fn();
    const point = { lat: 7.0731, lng: 125.6128 };
    await render(<PinPicker point={point} onPick={onPick} />);

    await waitFor(() => {
      expect(mockInjectJavaScript).toHaveBeenCalledWith(externalPinScript(point));
    });
  });
});
