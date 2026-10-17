import { render, screen, waitFor } from "@testing-library/react-native";

import { Dimensions, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TourOverlay } from "@/components/TourOverlay";
import { TourTarget } from "@/components/TourTarget";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * The phone in report 08C5AFEA never said where anything was: not the lit
 * control, not the card. Under Jest neither does this one — `measureInWindow`
 * never answers and no layout event fires — so this is that phone. The card
 * must still come up, centred over a plain dim, and finish fully opaque.
 */

beforeEach(() => {
  useSession.setState({
    user: { id: "usr_a", email: "a@example.com", name: "Ana", role: "client" } as User,
  });
  useTour.getState().reset();
  useTour.setState({ hydrated: true, progress: { usr_a: { status: "active", step: 0 } } });
});

it("draws the card centred and visible when nothing could be measured", async () => {
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);

  expect(await screen.findByText("Start with what you need", {}, { timeout: 3000 })).toBeTruthy();
  expect(useTour.getState().rects["home.search"]).toBeUndefined();
  expect(screen.getByLabelText("Skip the tour")).toBeTruthy();

  const card = screen.getByTestId("tour-card");
  // Centred on the 200 the card is given before it has measured itself.
  const { height } = Dimensions.get("window");
  expect(StyleSheet.flatten(card.props.style).top).toBe((height - 200) / 2);
  await waitFor(() => expect(card).toHaveAnimatedStyle({ opacity: 1 }), { timeout: 2000 });
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
