import { screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { ApiError, type CatalogItem } from "@/lib/api";
import { clearListingCache } from "@/lib/listingCache";
import { useCart } from "@/store/cart";

import { DOCUMENT_ITEM, PDF_FORMAT, documentCart, documentLine, renderInSafeArea } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getCatalogItem: jest.fn(),
  getCart: jest.fn(),
  updateCartLine: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const STUB = { id: "sci_docs", name: "Tarpaulin", supplierId: "supplier_documents", selectedOptions: [] } as unknown as CatalogItem;

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  clearListingCache();
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({ lines: [documentLine({ listing: STUB })] }),
    loading: false,
    busy: false,
    error: null,
    hydrated: true,
  });
});

/** The listing read failed: the basket read is the fallback, since it carries each line's full listing. */
it("falls back to the basket read when the listing read fails", async () => {
  api.getCatalogItem.mockRejectedValue(new ApiError(503, { error: "unavailable" }));
  api.getCart.mockResolvedValue(
    documentCart({ lines: [documentLine({ listing: { ...DOCUMENT_ITEM, pricingUnit: "per_unit", acceptedFormats: [PDF_FORMAT] } })] }),
  );
  await renderInSafeArea(<ArtworkScreen />);

  expect(await screen.findByText("Accepted files")).toBeTruthy();
  expect(api.getCart).toHaveBeenCalledWith("cart_1");
});
