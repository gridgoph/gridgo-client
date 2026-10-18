import { render, screen, waitFor } from "@testing-library/react-native";

import { BackHandler, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TourOverlay } from "@/components/TourOverlay";
import { TourTarget } from "@/components/TourTarget";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * Android's back button is a way out of the tour while its card is up: it
 * ends the tour for good, so the next launch does not dim the screen again.
 */

beforeEach(() => {
  useSession.setState({
    user: { id: "usr_a", email: "a@example.com", name: "Ana", role: "client" } as User,
  });
  useTour.getState().reset();
  useTour.setState({ hydrated: true, progress: { usr_a: { status: "active", step: 0 } } });
});

it("ends the tour on the back button and takes the dim away", async () => {
  const remove = jest.fn();
  const listen = jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation(() => ({ remove }));

  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);
  expect(await screen.findByText("Start with what you need", {}, { timeout: 3000 })).toBeTruthy();

  const call = listen.mock.calls.find(([event]) => event === "hardwareBackPress");
  expect(call).toBeDefined();
  const handled = call![1]({ type: "hardwareBackPress", timeStamp: Date.now() });

  expect(handled).toBe(true);
  expect(useTour.getState().progress.usr_a).toEqual({ status: "done" });
  await waitFor(() => expect(screen.queryByTestId("tour-card")).toBeNull());
  expect(remove).toHaveBeenCalled();
  listen.mockRestore();
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Overlay() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <TourTarget step="home.search">
        <Text>home.search</Text>
      </TourTarget>
      <TourOverlay ready />
    </SafeAreaProvider>
  );
}
