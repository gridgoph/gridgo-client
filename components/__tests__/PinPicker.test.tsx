import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { PinPicker } from "@/components/PinPicker.native";
import { externalPinScript } from "@/lib/mapHtml";

const mockInjectJavaScript = jest.fn();

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  const WebView = React.forwardRef(
    (
      props: { onLoadEnd?: () => void; onMessage?: (event: unknown) => void; accessibilityLabel?: string },
      ref: React.Ref<{ injectJavaScript: typeof mockInjectJavaScript }>,
    ) => {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
      React.useEffect(() => {
        props.onLoadEnd?.();
      }, [props]);
      return React.createElement(View, { accessibilityLabel: props.accessibilityLabel, onMessage: props.onMessage });
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
  it("passes drag start to the editor before a point is dropped", async () => {
    const onPick = jest.fn();
    const onPickStart = jest.fn();
    await render(<PinPicker point={{ lat: 7.0731, lng: 125.6128 }} onPick={onPick} onPickStart={onPickStart} />);
    const map = screen.getByLabelText("Map of Davao. Tap or drag the pin to set your drop-off.");
    await fireEvent(map, "message", { nativeEvent: { data: JSON.stringify({ type: "grab" }) } });
    expect(onPickStart).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    await fireEvent(map, "message", { nativeEvent: { data: JSON.stringify({ type: "pin", lat: 7.074, lng: 125.614 }) } });
    expect(onPick).toHaveBeenCalledWith({ lat: 7.074, lng: 125.614 });
  });

});
