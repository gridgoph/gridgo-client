import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const photos = [
  { uri: "https://cdn.example/a.jpg", alt: "Front" },
  { uri: "https://cdn.example/b.jpg", alt: "Back" },
  { uri: "https://cdn.example/c.jpg", alt: "Edge" },
];

async function renderViewer(index: number) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SamplePhotoViewer photos={photos} index={index} open onClose={() => {}} />
    </SafeAreaProvider>,
  );
}

const hidden = { includeHiddenElements: true };

// One press per test, and the pressing tests go last (AGENTS.md).
describe("SamplePhotoViewer next, previous and thumbnails", () => {
  it("offers only next on the first photo", async () => {
    const view = await renderViewer(0);

    expect(screen.getByLabelText("Next photo")).toBeTruthy();
    expect(screen.queryByLabelText("Previous photo")).toBeNull();
    await view.unmount();
  });

  it("offers only previous on the last photo", async () => {
    const view = await renderViewer(2);

    expect(screen.getByLabelText("Previous photo")).toBeTruthy();
    expect(screen.queryByLabelText("Next photo")).toBeNull();
    await view.unmount();
  });

  it("draws the thumbnail strip with the open photo ringed, clear of the home indicator", async () => {
    const view = await renderViewer(1);

    expect(screen.getByTestId("sample-photo-thumb-1", hidden)).toBeSelected();
    expect(screen.getByTestId("sample-photo-thumb-0", hidden)).not.toBeSelected();
    expect(screen.getByTestId("sample-photo-strip", hidden)).toHaveStyle({
      paddingBottom: 46,
    });
    await view.unmount();
  });

  it("shows no strip and no steps for a single photo", async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhotoViewer photos={[photos[0]]} open onClose={() => {}} />
      </SafeAreaProvider>,
    );

    expect(screen.queryByTestId("sample-photo-thumbs", hidden)).toBeNull();
    expect(screen.queryByLabelText("Next photo")).toBeNull();
    expect(screen.queryByLabelText("Previous photo")).toBeNull();
    await view.unmount();
  });

  it("steps to the next photo", async () => {
    const view = await renderViewer(0);

    await fireEvent.press(screen.getByLabelText("Next photo"));

    expect(await screen.findByText("2 / 3")).toBeTruthy();
    expect(screen.getByTestId("sample-photo-viewer-image").props.source).toEqual({
      uri: "https://cdn.example/b.jpg",
    });
    expect(screen.getByTestId("sample-photo-thumb-1", hidden)).toBeSelected();
    await view.unmount();
  });
});
