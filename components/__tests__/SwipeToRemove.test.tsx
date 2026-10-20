import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SwipeToRemove } from "@/components/SwipeToRemove";
import { COMMIT_DISTANCE, FLICK_VELOCITY, REVEAL_WIDTH } from "@/lib/swipeRow";

/**
 * The basket row and the question it asks, the way checkout wires them: the
 * row asks, the dialog decides, and only the dialog's answer removes.
 */
function Basket({ onRemoved }: { onRemoved: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <SwipeToRemove label="Flyers" onRemove={() => setAsking(true)}>
        <Text>Flyers</Text>
      </SwipeToRemove>
      <ConfirmDialog
        visible={asking}
        question="Remove Flyers?"
        body="It comes out of your order."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        tone="destructive"
        onConfirm={onRemoved}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

/** A left drag that lifts at `x`, at `velocityX` points per second. */
function drag(x: number, velocityX = 0) {
  fireGestureHandler(getByGestureTestId("swipe-to-remove"), [
    { state: State.BEGAN, translationX: 0, velocityX: 0 },
    { state: State.ACTIVE, translationX: x / 2, velocityX },
    { state: State.ACTIVE, translationX: x, velocityX },
    { state: State.END, translationX: x, velocityX },
  ]);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// First: a gesture fired in an earlier test leaves the next render in this
// file empty (the `fireEvent` trap in AGENTS.md).
it("takes no swipe while the basket is busy", async () => {
  await render(
    <SwipeToRemove label="Flyers" onRemove={jest.fn()} disabled>
      <Text>Flyers</Text>
    </SwipeToRemove>,
  );

  expect(getByGestureTestId("swipe-to-remove").config.enabled).toBe(false);
});

// Issue #325: the Remove layer is the same size and radius as the card, so its
// red border bled through the card's anti-aliased rounded corners at rest.
it("draws nothing of the Remove layer while the row is closed", async () => {
  await render(
    <SwipeToRemove label="Flyers" onRemove={jest.fn()}>
      <Text>Flyers</Text>
    </SwipeToRemove>,
  );

  expect(screen.getByTestId("swipe-to-remove-action")).toHaveAnimatedStyle({ opacity: 0 });
  expect(screen.getByLabelText("Remove Flyers")).toBeTruthy();
});

describe("swiping a basket row", () => {
  it("asks once a long drag lets go, and removes nothing by itself", async () => {
    const onRemoved = jest.fn();
    await render(<Basket onRemoved={onRemoved} />);

    drag(-(COMMIT_DISTANCE + 20));
    await act(async () => {
      jest.runAllTimers();
    });

    expect(await screen.findByText("Remove Flyers?")).toBeTruthy();
    expect(screen.getByText("Keep it")).toBeTruthy();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("opens on a fast flick without asking", async () => {
    const onRemove = jest.fn();
    await render(
      <SwipeToRemove label="Flyers" onRemove={onRemove}>
        <Text>Flyers</Text>
      </SwipeToRemove>,
    );

    drag(-REVEAL_WIDTH / 2, -(FLICK_VELOCITY + 400));
    await act(async () => {
      jest.runAllTimers();
    });

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("shows the Remove layer once the row is swiped open", async () => {
    await render(
      <SwipeToRemove label="Flyers" onRemove={jest.fn()}>
        <Text>Flyers</Text>
      </SwipeToRemove>,
    );

    drag(-(REVEAL_WIDTH - 20));
    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.getByTestId("swipe-to-remove-action")).toHaveAnimatedStyle({ opacity: 1 });
  });

  it("does not ask on a drag that stops short of the commit distance", async () => {
    const onRemove = jest.fn();
    await render(
      <SwipeToRemove label="Flyers" onRemove={onRemove}>
        <Text>Flyers</Text>
      </SwipeToRemove>,
    );

    drag(-(COMMIT_DISTANCE - 20));
    await act(async () => {
      jest.runAllTimers();
    });

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("asks through the row's accessibility action, for anyone who cannot swipe", async () => {
    const onRemove = jest.fn();
    await render(
      <SwipeToRemove label="Flyers" onRemove={onRemove}>
        <Text>Flyers</Text>
      </SwipeToRemove>,
    );

    fireEvent(screen.getByTestId("swipe-to-remove-row"), "accessibilityAction", {
      nativeEvent: { actionName: "remove" },
    });
    await act(async () => {
      jest.runAllTimers();
    });

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
