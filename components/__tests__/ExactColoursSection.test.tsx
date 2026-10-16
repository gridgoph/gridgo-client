import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ExactColoursSection } from "@/components/ExactColoursSection";
import * as api from "@/lib/api";
import type { ArtworkColorsEntry, ColorTarget } from "@/lib/colorTargets";

/**
 * gridgo-client#249: the exact colours on the artwork step — each format with
 * what its swatch may claim, the colours read from each file, and a removal
 * that sends the rest of the list back. One press per test.
 */

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  updateCartLine: jest.fn(),
}));
jest.mock("@/store/cart", () => ({
  useCart: { getState: () => ({ run: (work: (cartId: string) => unknown) => work("cart_1"), adopt: jest.fn() }) },
}));

const TARGETS: ColorTarget[] = [
  { label: "Brand red", format: "pantone", value: "PANTONE 185 C", cmyk: null, hex: null, swatchHex: null, swatchApproximate: null },
  { label: "Logo red", format: "cmyk", value: "C0 M100 Y65 K34", cmyk: { c: 0, m: 100, y: 65, k: 34 }, hex: null, swatchHex: "#A8003B", swatchApproximate: true },
  { label: "Logo blue", format: "hex", value: "#1A5FB4", cmyk: null, hex: "#1A5FB4", swatchHex: "#1A5FB4", swatchApproximate: false },
];

const READ: ArtworkColorsEntry[] = [
  {
    fileId: "file_pdf",
    colors: {
      version: 1,
      status: "read",
      reasons: [],
      colors: [{ kind: "spot", name: "PANTONE 185 C", space: "cmyk", cmyk: { c: 0, m: 91, y: 76, k: 6 }, hex: "#F0163A", uses: 1, shareBps: null }],
    },
  },
  { fileId: "file_jpg", colors: { version: 1, status: "unknown", reasons: ["not_read_for_this_file_type"], colors: [] } },
];

const names: Record<string, string> = { file_pdf: "logo.pdf", file_jpg: "photo.jpg" };
const props = { lineId: "line_1", artworkColors: READ, fileName: (fileId: string) => names[fileId] };

it("shows each colour with what its swatch may claim, and the colours read from each file", async () => {
  await render(<ExactColoursSection {...props} targets={TARGETS} />);
  expect(screen.getByLabelText(/^Brand red\. PANTONE 185 C\. Pantone code only, no swatch\. In logo\.pdf$/)).toBeTruthy();
  expect(screen.getByLabelText(/^Logo red\. C0 M100 Y65 K34\. Approximate on screen$/)).toBeTruthy();
  expect(screen.getByLabelText(/^Logo blue\. #1A5FB4\. Screen colour$/)).toBeTruthy();
  expect(screen.getByText(/Screens and printers show colour differently/)).toBeTruthy();
  expect(screen.getByText("We could not read the colours in this file.")).toBeTruthy();
  expect(screen.getByText(/does not read colours from this file type/)).toBeTruthy();
  expect(screen.getByLabelText("PANTONE 185 C, Spot colour")).toBeTruthy();
  expect(screen.getByText("Add another colour")).toBeTruthy();
});

it("offers to add the first colour, and says nothing about files before one is uploaded", async () => {
  await render(<ExactColoursSection {...props} artworkColors={[]} targets={[]} />);
  expect(screen.getByText("Add a colour")).toBeTruthy();
  expect(screen.queryByText("COLOURS IN YOUR FILES")).toBeNull();
});

it("removes a colour by sending the rest of the list", async () => {
  jest.mocked(api.updateCartLine).mockResolvedValue({ id: "cart_1", lines: [] } as unknown as api.Cart);
  await render(<ExactColoursSection {...props} targets={TARGETS} />);
  fireEvent.press(screen.getByLabelText("Remove Logo red"));
  await waitFor(() =>
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "line_1", {
      colorTargets: [
        { label: "Brand red", pantone: "PANTONE 185 C" },
        { label: "Logo blue", hex: "#1A5FB4" },
      ],
    }),
  );
});
