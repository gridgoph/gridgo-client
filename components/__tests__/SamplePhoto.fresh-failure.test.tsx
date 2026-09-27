import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SamplePhoto } from "@/components/SamplePhoto";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe("SamplePhoto on a fresh link", () => {
  it("still says the photo will not load when it genuinely fails", async () => {
    const onStale = jest.fn(async () => undefined);
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SamplePhoto
          url="https://storage.example/broken.jpg"
          expiresAt={new Date(Date.now() + 4 * 60_000).toISOString()}
          onStale={onStale}
        />
      </SafeAreaProvider>,
    );

    fireEvent(screen.getByTestId("sample-photo-image"), "error");

    expect(await screen.findByText("This photo will not load")).toBeTruthy();
    expect(screen.queryByTestId("sample-photo-refreshing")).toBeNull();
    expect(onStale).not.toHaveBeenCalled();
    await view.unmount();
  });
});
