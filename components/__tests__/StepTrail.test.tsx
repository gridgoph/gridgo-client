import { fireEvent, render, screen } from "@testing-library/react-native";

import { StepTrail } from "@/components/StepTrail";

/**
 * Test order is load-bearing here.
 *
 * On @testing-library/react-native 14 with React 19, a *second*
 * `fireEvent.press` inside one test leaves every later `render` in the file
 * returning an empty tree — no error, just nothing to query. So each test
 * below presses at most once, and the one that has to press twice is last.
 * See the testing notes in AGENTS.md.
 */
describe("StepTrail", () => {
  it("draws all four places in one run", async () => {
    await render(<StepTrail current="listing" onStep={jest.fn()} />);

    expect(screen.getByText("Match")).toBeTruthy();
    expect(screen.getByText("Print details")).toBeTruthy();
    expect(screen.getByText("Artwork")).toBeTruthy();
    expect(screen.getByText("Review & pay")).toBeTruthy();
    // The task on the current step, said under the bar.
    expect(
      screen.getByText("Choose options and quantity, then add it to your order."),
    ).toBeTruthy();
  });

  it("marks where the client is standing and takes no tap for it", async () => {
    const onStep = jest.fn();
    await render(<StepTrail current="artwork" onStep={onStep} />);

    const here = screen.getByLabelText("Step 3 of 4: Artwork, where you are now.");
    expect(here.props.accessibilityState.selected).toBe(true);
    fireEvent.press(here);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("offers no tap on a step that has not been reached", async () => {
    const onStep = jest.fn();
    await render(<StepTrail current="listing" onStep={onStep} />);

    fireEvent.press(screen.getByLabelText("Step 4 of 4: Review & pay, not reached yet."));
    expect(onStep).not.toHaveBeenCalled();
  });

  it("leaves a finished step unpressable where the screen has nowhere to send it", async () => {
    // Checkout with an empty basket knows the shop but has no line to open,
    // and an approximate destination is worse than none.
    const onStep = jest.fn();
    await render(
      <StepTrail current="pay" onStep={onStep} canGo={(step) => step === "shop"} />,
    );

    // Said as done, without the "go back" it cannot keep.
    fireEvent.press(screen.getByLabelText("Step 2 of 4: Print details, done."));
    expect(onStep).not.toHaveBeenCalled();
  });

  it("sends a finished step back to its screen", async () => {
    const onStep = jest.fn();
    await render(<StepTrail current="artwork" onStep={onStep} />);

    fireEvent.press(screen.getByLabelText("Step 1 of 4: Match, done. Go back to it."));
    expect(onStep).toHaveBeenCalledWith("shop");

    fireEvent.press(screen.getByLabelText("Step 2 of 4: Print details, done. Go back to it."));
    expect(onStep).toHaveBeenCalledWith("listing");
  });
});
