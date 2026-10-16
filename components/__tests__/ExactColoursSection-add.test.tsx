import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ExactColoursSection } from "@/components/ExactColoursSection";
import * as api from "@/lib/api";

/**
 * gridgo-client#249: changing a colour. A CMYK pasted into one box fills all
 * four, the editor shows the value as GRIDGO will store it, and the save
 * sends the whole list with the change in place. Two presses, so it is the
 * only test in its file.
 */

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  updateCartLine: jest.fn(),
}));
jest.mock("@/store/cart", () => ({
  useCart: { getState: () => ({ run: (work: (cartId: string) => unknown) => work("cart_1"), adopt: jest.fn() }) },
}));

it("changes a CMYK colour pasted into one box", async () => {
  jest.mocked(api.updateCartLine).mockResolvedValue({ id: "cart_1", lines: [] } as unknown as api.Cart);
  await render(
    <ExactColoursSection
      lineId="line_1"
      targets={[
        { label: "Logo blue", format: "hex", value: "#1A5FB4", cmyk: null, hex: "#1A5FB4", swatchHex: "#1A5FB4", swatchApproximate: false },
        { label: "Red", format: "cmyk", value: "C0 M90 Y60 K30", cmyk: { c: 0, m: 90, y: 60, k: 30 }, hex: null, swatchHex: "#B3122C", swatchApproximate: true },
      ]}
      artworkColors={[]}
      fileName={() => "logo.pdf"}
    />,
  );
  fireEvent.press(screen.getByLabelText("Change Red"));
  fireEvent.changeText(await screen.findByLabelText("Colour label"), "Logo red");
  await waitFor(() => expect(screen.getByLabelText("Colour label").props.value).toBe("Logo red"));
  fireEvent.changeText(screen.getByLabelText("Cyan percent"), "0/100/65/34");
  await waitFor(() => expect(screen.getByLabelText("Black percent").props.value).toBe("34"));
  expect(screen.getByLabelText("Saved as C0 M100 Y65 K34. Approximate on screen")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Save colour" }));
  await waitFor(() =>
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "line_1", {
      colorTargets: [
        { label: "Logo blue", hex: "#1A5FB4" },
        { label: "Logo red", cmyk: { c: 0, m: 100, y: 65, k: 34 } },
      ],
    }),
  );
});
