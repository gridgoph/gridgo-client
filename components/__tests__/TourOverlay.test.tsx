import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SafeAreaProvider } from "react-native-safe-area-context";

import { TourOverlay } from "@/components/TourOverlay";
import type { User } from "@/lib/api";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * The card over a screen: the step for that screen only, and Skip always
 * there. One press per file — see AGENTS.md on this renderer.
 */

function signIn() {
  useSession.setState({
    user: { id: "usr_a", email: "a@example.com", name: "Ana", role: "client" } as User,
  });
}

beforeEach(() => {
  signIn();
  useTour.getState().reset();
  useTour.setState({ hydrated: true, progress: { usr_a: { status: "active", step: 0 } } });
});

it("draws nothing on a screen the current step does not belong to", async () => {
  // Set directly: arriving at a screen would move the tour up to meet it.
  useTour.setState({ screen: "when" });
  await render(<Overlay />);
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(screen.queryByText("Start with what you need")).toBeNull();
});

it("waits while another prompt is up", async () => {
  usePushPrompt.setState({ open: true });
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(screen.queryByText("Start with what you need")).toBeNull();
  usePushPrompt.setState({ open: false });
});

it("shows the step on its screen with dots and Skip, and Skip ends the tour", async () => {
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);

  expect(await screen.findByText("Start with what you need")).toBeTruthy();
  expect(screen.getByLabelText("Tip 1 of 8")).toBeTruthy();
  expect(screen.getByText("Next")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Skip the tour"));
  await waitFor(() => expect(useTour.getState().progress.usr_a).toEqual({ status: "done" }));
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Overlay() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <TourOverlay ready />
    </SafeAreaProvider>
  );
}
