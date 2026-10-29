import { screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import type { CatalogItem } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
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

const FULL: CatalogItem = { ...DOCUMENT_ITEM, name: "Tarpaulin", pricingUnit: "per_unit", acceptedFormats: [PDF_FORMAT] };
/** What "Add to my order" answers with: gridgo-api's compact stub, no formats, photos or options. */
const STUB = { id: "sci_docs", name: "Tarpaulin", supplierId: "supplier_documents", selectedOptions: [] } as unknown as CatalogItem;

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  // The match held the full listing; the alert stream's reconcile (on resume,
  // or every 30 s while it is down) emptied the cache before the add landed.
  rememberListing(FULL);
  clearListingCache();
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({ lines: [documentLine({ listing: STUB })] }),
    loading: false,
    busy: false,
    error: null,
  });
});

/**
 * The reported crash: "Cannot read property 'filter' of undefined" in
 * fileFormats as Artwork opened on the add's stub. It now waits on its own
 * read of the listing and then draws the shop's formats.
 */
it("waits on the full listing instead of drawing the add's stub", async () => {
  let land!: (item: CatalogItem) => void;
  api.getCatalogItem.mockReturnValue(new Promise((resolve) => (land = resolve)));
  await renderInSafeArea(<ArtworkScreen />);

  expect(screen.getByLabelText("Opening your artwork step")).toBeTruthy();
  expect(api.getCatalogItem).toHaveBeenCalledWith("sci_docs");

  land(FULL);
  expect(await screen.findByText("Accepted files")).toBeTruthy();
  expect(screen.getByText("PDF")).toBeTruthy();
  expect(useCart.getState().cart?.lines[0].listing?.acceptedFormats).toEqual([PDF_FORMAT]);
  expect(api.getCart).not.toHaveBeenCalled();
});
