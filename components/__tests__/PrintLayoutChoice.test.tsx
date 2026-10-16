import { fireEvent, render, screen } from "@testing-library/react-native";

import { PrintLayoutChoice } from "@/components/PrintLayoutChoice";
import { SCALE_NOTE } from "@/lib/printLayout";

// One press per test: see "Running and testing" in AGENTS.md.

it("offers only the shop's layouts, with nothing ticked", async () => {
  await render(
    <PrintLayoutChoice layouts={["fit_to_paper", "actual_size_centered"]} selected={null} onSelect={jest.fn()} step={3} />,
  );
  expect(screen.getByText("STEP 3 · LAYOUT")).toBeTruthy();
  const radios = screen.getAllByRole("radio");
  expect(radios).toHaveLength(2);
  for (const radio of radios) expect(radio.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
  expect(screen.getByLabelText("Fit to paper. Scaled up or down to fill the paper.")).toBeTruthy();
  expect(screen.getByLabelText("Actual size, centred. Printed at 100%, in the middle of the paper.")).toBeTruthy();
  expect(screen.queryByText("Actual size, in its original position")).toBeNull();
  expect(screen.queryByText(SCALE_NOTE)).toBeNull();
});

it("says under Fit to paper that the drawing scale will change", async () => {
  await render(
    <PrintLayoutChoice layouts={["fit_to_paper", "actual_size_centered"]} selected="fit_to_paper" onSelect={jest.fn()} step={null} scaleNote={SCALE_NOTE} />,
  );
  expect(screen.getByText("LAYOUT")).toBeTruthy();
  expect(screen.getByLabelText("Fit to paper. Scaled up or down to fill the paper.").props.accessibilityState).toEqual(
    expect.objectContaining({ checked: true }),
  );
  expect(screen.getByText(SCALE_NOTE)).toBeTruthy();
});

it("hands back the layout tapped", async () => {
  const onSelect = jest.fn();
  await render(
    <PrintLayoutChoice
      layouts={["fit_to_paper", "actual_size_centered", "actual_size_original_position"]}
      selected={null}
      onSelect={onSelect}
      step={null}
    />,
  );
  fireEvent.press(screen.getByLabelText("Actual size, in its original position. Printed at 100%, from the page's top-left corner."));
  expect(onSelect).toHaveBeenCalledWith("actual_size_original_position");
});
