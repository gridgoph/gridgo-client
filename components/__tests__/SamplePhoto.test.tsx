import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SamplePhoto } from "@/components/SamplePhoto";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe("SamplePhoto viewer", () => {
  it("opens the sample full screen from a signed link", async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhoto url="https://cdn.example/sample.jpg" altText="Flyers on the rack" />
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByLabelText("Open Flyers on the rack larger"));

    expect(screen.getByTestId("sample-photo-viewer")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("close-sample-photo"));
    await waitFor(() => {
      expect(screen.queryByTestId("sample-photo-viewer")).toBeNull();
    });
    await view.unmount();
  });

  it("does not offer a viewer on an empty plate", async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhoto url={null} emptyLabel="No sample" />
      </SafeAreaProvider>,
    );

    expect(screen.getByText("No sample")).toBeTruthy();
    expect(screen.queryByLabelText(/Open .* larger/)).toBeNull();
    expect(screen.queryByTestId("sample-photo-viewer")).toBeNull();
    await view.unmount();
  });
});
