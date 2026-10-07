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

it("jumps to the photo whose thumbnail was tapped, and closes on it", async () => {
  const onClose = jest.fn();
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SamplePhotoViewer photos={photos} index={0} open onClose={onClose} />
    </SafeAreaProvider>,
  );

  await fireEvent.press(
    screen.getByTestId("sample-photo-thumb-2", { includeHiddenElements: true }),
  );

  expect(await screen.findByText("3 / 3")).toBeTruthy();
  expect(screen.getByLabelText("Edge")).toBeTruthy();
  await view.unmount();
});
