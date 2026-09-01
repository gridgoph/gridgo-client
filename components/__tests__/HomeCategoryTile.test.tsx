import { fireEvent, render, screen } from "@testing-library/react-native";

import { HomeCategoryTile } from "@/components/HomeCategoryTile";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";

describe("HomeCategoryTile", () => {
  it("names the category and a short list of what it covers", async () => {
    const category = PRODUCT_CATEGORY_SEED[0];
    await render(<HomeCategoryTile category={category} onPress={() => undefined} />);

    expect(screen.getByText("Marketing & promotional collateral")).toBeTruthy();
    expect(screen.getByText("Flyers · Brochures · Posters & standees")).toBeTruthy();
    expect(screen.getByLabelText("Marketing & promotional collateral")).toBeTruthy();
  });

  it("opens on tap", async () => {
    const onPress = jest.fn();
    await render(<HomeCategoryTile category={PRODUCT_CATEGORY_SEED[0]} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText("Marketing & promotional collateral"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
