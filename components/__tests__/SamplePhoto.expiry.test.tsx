import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SamplePhoto } from "@/components/SamplePhoto";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const inSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
);

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/*
  Photo links are signed for five minutes. A tile holding one past that asks
  its screen for a fresh read and shimmers while it waits — "This photo will
  not load" is only for a photo that fails on a good link, or whose re-read
  could not replace the link. One event per test: see AGENTS.md on the
  React 19 + RNTL double-press trap.
*/
describe("SamplePhoto on an expired link", () => {
  it("asks for one fresh read instead of saying the photo will not load", async () => {
    let settle: () => void = () => undefined;
    const onStale = jest.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    const view = await render(
      inSafeArea(
        <SamplePhoto
          url="https://storage.example/old.jpg"
          expiresAt={minutesFromNow(-1)}
          onStale={onStale}
          altText="Tarpaulin sample"
        />,
      ),
    );

    fireEvent(screen.getByTestId("sample-photo-image"), "error");

    expect(await screen.findByTestId("sample-photo-refreshing")).toBeTruthy();
    expect(screen.queryByText("This photo will not load")).toBeNull();
    expect(onStale).toHaveBeenCalledTimes(1);

    // The screen answers with a new link: the tile draws it.
    await view.rerender(
      inSafeArea(
        <SamplePhoto
          url="https://storage.example/new.jpg"
          expiresAt={minutesFromNow(5)}
          onStale={onStale}
          altText="Tarpaulin sample"
        />,
      ),
    );
    settle();
    await waitFor(() => {
      expect(screen.getByTestId("sample-photo-image").props.source).toEqual({
        uri: "https://storage.example/new.jpg",
      });
    });
    expect(onStale).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
