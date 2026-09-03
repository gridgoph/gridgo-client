import { fireEvent, render, screen } from "@testing-library/react-native";

import { HomeCategoryRow } from "@/components/HomeCategoryRow";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";

describe("HomeCategoryRow", () => {
  /**
   * The row is set in the short label because "Marketing & promotional
   * collateral" truncated mid-word when the menu was a two-up grid. The
   * catalogue name is still what a screen reader is given.
   */
  it("names the category short enough to be read whole, and says what is inside", async () => {
    const category = PRODUCT_CATEGORY_SEED[0];
    await render(<HomeCategoryRow category={category} onPress={() => undefined} />);

    expect(screen.getByText("Marketing")).toBeTruthy();
    expect(screen.getByText("Flyers, Brochures and 4 more")).toBeTruthy();
    expect(screen.getByLabelText("Marketing & promotional collateral")).toBeTruthy();
  });

  /**
   * The contents line is the reason the menu is a full-width board: at half a
   * phone's width the longest of them was cut off mid-item, which is the one
   * line on the row a person actually reads.
   */
  it("gives the longest contents line two lines to be read in", async () => {
    const prototyping = PRODUCT_CATEGORY_SEED.find(
      (entry) => entry.code === "specialized_prototyping",
    );
    if (!prototyping) throw new Error("seed no longer carries the prototyping category");

    await render(<HomeCategoryRow category={prototyping} onPress={() => undefined} />);

    const caption = screen.getByText(
      "3D printing & scale models, Blueprint & CAD plotting and 1 more",
    );
    expect(caption.props.numberOfLines).toBe(2);
  });

  it("opens on tap", async () => {
    const onPress = jest.fn();
    await render(<HomeCategoryRow category={PRODUCT_CATEGORY_SEED[0]} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText("Marketing & promotional collateral"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
