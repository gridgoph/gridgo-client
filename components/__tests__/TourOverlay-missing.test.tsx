import { render, screen, waitFor } from "@testing-library/react-native";

import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TourOverlay } from "@/components/TourOverlay";
import { TourTarget } from "@/components/TourTarget";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * A step whose control this screen never draws is passed, not waited on: Home
 * here has the category board but no search field, so the search tip goes by
 * and the category tip is shown. Nothing dims while the tour is waiting.
 */

beforeEach(() => {
  useSession.setState({
    user: { id: "usr_a", email: "a@example.com", name: "Ana", role: "client" } as User,
  });
  useTour.getState().reset();
  useTour.setState({ hydrated: true, progress: { usr_a: { status: "active", step: 0 } } });
});

it("passes a step whose control never appears and moves to the next", async () => {
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  // Settled and past the measuring time, but there is nothing to explain yet.
  expect(screen.queryByText("Start with what you need")).toBeNull();
  expect(screen.queryByTestId("tour-card")).toBeNull();

  await waitFor(
    () => expect(useTour.getState().progress.usr_a).toEqual({ status: "active", step: 1 }),
    { timeout: 3000 },
  );
  expect(await screen.findByText("Or browse the categories", {}, { timeout: 3000 })).toBeTruthy();
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Overlay() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <TourTarget step="home.categories">
        <Text>home.categories</Text>
      </TourTarget>
      <TourOverlay ready />
    </SafeAreaProvider>
  );
}
