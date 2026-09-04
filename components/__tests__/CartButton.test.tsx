import { fireEvent, render, screen } from "@testing-library/react-native";

import { CartButton } from "@/components/CartButton";
import { colors } from "@/constants/theme";

describe("CartButton", () => {
  it("badges what is in the basket", async () => {
    await render(<CartButton count={3} onPress={jest.fn()} />);

    expect(screen.getByLabelText("Your order, 3 items")).toBeTruthy();
    const numeral = screen.getByText("3");
    expect(numeral).toBeTruthy();
    // The count is the reason the control exists, so it is set at the type
    // scale's floor (12) rather than the 10 it shipped at, with tabular
    // figures so 1, 3 and 9+ hold one width.
    expect(numeral.props.style).toEqual(
      expect.objectContaining({
        fontSize: 12,
        lineHeight: 12,
        includeFontPadding: false,
        fontVariant: ["tabular-nums"],
        color: colors.light.accentOn,
      }),
    );
  });

  it("counts one item in the singular", async () => {
    await render(<CartButton count={1} onPress={jest.fn()} />);

    expect(screen.getByLabelText("Your order, 1 item")).toBeTruthy();
  });

  it("still opens when the basket is empty, and shows no badge", async () => {
    // Checkout's empty state is a real answer. A control that disappears is a
    // control nobody learns is there.
    const onPress = jest.fn();
    await render(<CartButton count={0} onPress={onPress} />);

    expect(screen.queryByText("0")).toBeNull();
    fireEvent.press(screen.getByLabelText("Your order, empty"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("stops counting past nine rather than growing the badge", async () => {
    await render(<CartButton count={12} onPress={jest.fn()} />);

    expect(screen.getByText("9+")).toBeTruthy();
    expect(screen.getByLabelText("Your order, 12 items")).toBeTruthy();
  });
});
