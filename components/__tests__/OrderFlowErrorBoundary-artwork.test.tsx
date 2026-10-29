import { fireEvent, render, screen } from "@testing-library/react-native";
import { Try } from "expo-router/build/views/Try";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ArtworkErrorBoundary } from "@/components/OrderFlowErrorBoundary";
import type { Cart, CatalogItem } from "@/lib/api";
import { clearListingCache, listingTrusted } from "@/lib/listingCache";
import { useCart } from "@/store/cart";

import { DOCUMENT_ITEM, documentCart, documentLine } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getCatalogItem: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const BAD: CatalogItem = { ...DOCUMENT_ITEM, name: "Bad answer" };
const GOOD: CatalogItem = { ...DOCUMENT_ITEM, name: "Fresh listing" };

/** Stands in for the Artwork step: waits while its listing is distrusted, throws on the bad one. */
function Step() {
  const listing = useCart((state: { cart: Cart | null }) => state.cart?.lines[0]?.listing);
  if (!listingTrusted(listing?.id)) return <Text>Opening</Text>;
  if (listing?.name === BAD.name) throw new TypeError("Cannot read property 'filter' of undefined");
  return <Text>{listing?.name}</Text>;
}

/** Try again used to redraw the same listing and throw again; now it reads it first. One press per file. */
it("reads the line's listing again and puts it on the line before drawing the step", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  clearListingCache();
  useCart.setState({ cartId: "cart_1", cart: documentCart({ lines: [documentLine({ listing: BAD })] }) });
  let land!: (item: CatalogItem) => void;
  api.getCatalogItem.mockReturnValue(new Promise((resolve) => (land = resolve)));
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <Try catch={ArtworkErrorBoundary}>
        <Step />
      </Try>
    </SafeAreaProvider>,
  );
  expect(screen.getByText("TypeError")).toBeTruthy();

  fireEvent.press(screen.getByText("Try again"));
  // Drawn again at once, on its own loading state rather than the answer that threw.
  expect(await screen.findByText("Opening")).toBeTruthy();
  expect(api.getCatalogItem).toHaveBeenCalledWith("sci_docs");

  land(GOOD);
  expect(await screen.findByText("Fresh listing")).toBeTruthy();
  expect(useCart.getState().cart?.lines[0].listing).toBe(GOOD);
  consoleError.mockRestore();
});
