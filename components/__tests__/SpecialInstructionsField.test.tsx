import { render, screen } from "@testing-library/react-native";

import { SpecialInstructionsField } from "@/components/SpecialInstructionsField";

it("is optional, says notes cannot change the price, and counts toward 300", async () => {
  await render(<SpecialInstructionsField value="S: Ana, Ben · M: Carla" onChange={jest.fn()} />);
  expect(screen.getByText("Special instructions")).toBeTruthy();
  expect(screen.getByText("Optional")).toBeTruthy();
  expect(screen.getByText("Notes cannot change the price.")).toBeTruthy();
  expect(screen.getByText("22 / 300")).toBeTruthy();
  expect(screen.getByText(/The GRIDGO Team reads it before your job goes to a shop/)).toBeTruthy();
  expect(screen.getByLabelText("Special instructions for this item")).toBeTruthy();
});

it("says how much to remove instead of cutting a pasted note short", async () => {
  await render(<SpecialInstructionsField value={"x".repeat(312)} onChange={jest.fn()} />);
  expect(screen.getByText("Keep special instructions to 300 characters. Remove 12 to save.")).toBeTruthy();
  expect(screen.getByText("312 / 300")).toBeTruthy();
  // The whole note stays in the box: nothing is truncated.
  expect(screen.getByLabelText("Special instructions for this item").props.value).toHaveLength(312);
});
