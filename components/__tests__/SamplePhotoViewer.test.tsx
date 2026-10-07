import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const photos = [
  { uri: "https://cdn.example/a.jpg", alt: "Front" },
  { uri: "https://cdn.example/b.jpg", alt: "Back" },
  { uri: "https://cdn.example/c.jpg", alt: "Edge" },
];

describe("SamplePhotoViewer", () => {
  it("shows no counter for a single photo", async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhotoViewer photos={[photos[0]]} open onClose={() => {}} />
      </SafeAreaProvider>,
    );

    expect(screen.getByLabelText("Front")).toBeTruthy();
    expect(screen.queryByTestId("sample-photo-counter")).toBeNull();
    await view.unmount();
  });

  it("opens on the requested photo and counts it", async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhotoViewer photos={photos} index={1} open onClose={() => {}} />
      </SafeAreaProvider>,
    );

    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByLabelText("Photo 2 of 3")).toBeTruthy();
    await view.unmount();
  });

  it("renders nothing while closed", async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhotoViewer photos={photos} open={false} onClose={() => {}} />
      </SafeAreaProvider>,
    );

    expect(screen.queryByTestId("sample-photo-viewer")).toBeNull();
    await view.unmount();
  });

  it("sets the counter and close button below the top inset", async () => {
    const notched = { ...metrics, insets: { ...metrics.insets, top: 47 } };
    const view = await render(
      <SafeAreaProvider initialMetrics={notched}>
        <SamplePhotoViewer photos={photos} open onClose={() => {}} />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("sample-photo-counter")).toHaveStyle({ top: 55 });
    expect(screen.getByTestId("close-sample-photo")).toHaveStyle({ top: 55 });
    await view.unmount();
  });

  it("closes on the photo the client stepped to", async () => {
    const onClose = jest.fn();
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhotoViewer photos={photos} index={2} open onClose={onClose} />
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByTestId("close-sample-photo"));

    expect(onClose).toHaveBeenCalledWith(2);
    await view.unmount();
  });
});
