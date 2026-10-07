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

it("steps back to the previous photo", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SamplePhotoViewer photos={photos} index={2} open onClose={() => {}} />
    </SafeAreaProvider>,
  );

  await fireEvent.press(screen.getByLabelText("Previous photo"));

  expect(await screen.findByText("2 / 3")).toBeTruthy();
  expect(screen.getByLabelText("Back")).toBeTruthy();
  await view.unmount();
});
