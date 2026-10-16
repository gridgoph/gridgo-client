import * as api from "@/lib/api";
import { useColorTargets } from "@/store/colorTargets";

/** gridgo-client#249: a refused save keeps GRIDGO's reason, in plain words, for the colour it names. */

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  updateCartLine: jest.fn(),
}));
const mockAdopt = jest.fn();
jest.mock("@/store/cart", () => ({
  useCart: { getState: () => ({ run: (work: (cartId: string) => unknown) => work("cart_1"), adopt: mockAdopt }) },
}));

beforeEach(() => {
  useColorTargets.setState({ saving: {}, error: {} });
  mockAdopt.mockReset();
});

it("adopts the basket GRIDGO sends back", async () => {
  const cart = { id: "cart_1", lines: [] } as unknown as api.Cart;
  jest.mocked(api.updateCartLine).mockResolvedValueOnce(cart);
  await expect(useColorTargets.getState().save("line_1", [{ label: "Logo blue", hex: "#1A5FB4" }])).resolves.toBe(true);
  expect(mockAdopt).toHaveBeenCalledWith(cart);
  expect(useColorTargets.getState().saving.line_1).toBe(false);
});

it("words invalid_color_targets for the colour it names", async () => {
  jest.mocked(api.updateCartLine).mockRejectedValueOnce(
    new api.ApiError(400, {
      error: "invalid_color_targets",
      message: "Type a Pantone code, such as 185 C or PANTONE 18-1663 TCX.",
      details: { field: "colorTargets[1].pantone", reason: "pantone_invalid" },
    }),
  );
  const ok = await useColorTargets.getState().save("line_1", [
    { label: "Logo blue", hex: "#1A5FB4" },
    { label: "School maroon", pantone: "C" },
  ]);
  expect(ok).toBe(false);
  expect(useColorTargets.getState().error.line_1).toBe("School maroon: Type a Pantone code, such as 185 C or 18-1663 TPX.");
  expect(mockAdopt).not.toHaveBeenCalled();
});
