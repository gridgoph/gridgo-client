import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SamplePhoto } from "@/components/SamplePhoto";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe("SamplePhoto when the re-read cannot replace an expired link", () => {
  it("asks once, then says so rather than shimmering forever", async () => {
    // The screen's re-read failed (offline), so it hands back the same link.
    const onStale = jest.fn(async () => {
      throw new Error("offline");
    });
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhoto
          url="https://storage.example/old.jpg"
          expiresAt={new Date(Date.now() - 60_000).toISOString()}
          onStale={onStale}
        />
      </SafeAreaProvider>,
    );

    fireEvent(screen.getByTestId("sample-photo-image"), "error");

    expect(await screen.findByText("This photo will not load")).toBeTruthy();
    expect(onStale).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
