import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";
import { usePlatformSettings } from "@/store/platformSettings";
import { useReorderJob } from "@/store/reorderJob";
import { useSession } from "@/store/session";
import { documentCart, documentLine } from "@/test/artworkPagesFixtures";
import { renderSheet, reorderFlyers, startReorderJob } from "@/test/reorderListing";

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { itemId: "sci_flyers" };

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getCatalogItem: jest.fn(() => new Promise(() => {})),
  catalogQuote: jest.fn(() => new Promise(() => {})),
  createCart: jest.fn(() => new Promise(() => {})),
  addCartLine: jest.fn(),
  updateCartLine: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ITEM = reorderFlyers();
const ADDED = documentCart({
  lines: [
    documentLine({
      id: "line_FIRST_JOB",
      catalogItemId: ITEM.id,
      listing: ITEM,
      artworkAttachments: [],
      measurement: null,
      quantity: 2,
    }),
  ],
});

/** Tap Add with the answer held back, and hand back what lands it. */
async function addInTheAir() {
  let finish!: (cart: typeof ADDED) => void;
  api.addCartLine.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const sheet = await renderSheet();
  fireEvent.press(screen.getByLabelText("Add to my order"));
  await waitFor(() => expect(api.addCartLine).toHaveBeenCalledTimes(1));
  return { sheet, land: () => act(async () => finish(ADDED)) };
}

beforeEach(() => {
  mockParams = { itemId: "sci_flyers" };
  mockReplace.mockClear();
  mockBack.mockClear();
  api.addCartLine.mockReset();
  // First: a change of identity resets the stores below.
  useSession.setState({ user: { id: "user_1", role: "client" } } as never);
  clearListingCache();
  rememberListing(ITEM);
  useCart.getState().reset();
  useCart.getState().adopt(documentCart({ lines: [] }));
  useListingDraft.getState().clear();
  useReorderJob.getState().clear();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
});

const SECOND_FILE = { fileId: "file_SECOND_JOB", name: "second-job.pdf", contentType: "application/pdf" };

/* The client backed out and repeated the same product again while the first add was in the air. */
it("keeps a late add off the next reorder, and does not navigate", async () => {
  startReorderJob();
  const { sheet, land } = await addInTheAir();
  await sheet.unmount();
  const secondJob = startReorderJob({ quantity: 17, files: [SECOND_FILE] });

  await land();

  expect(useReorderJob.getState().job).toEqual(
    expect.objectContaining({ id: secondJob, lineId: null, files: [SECOND_FILE] }),
  );
  expect(mockReplace).not.toHaveBeenCalled();
  // The line is in this client's basket all the same.
  expect(useCart.getState().cart?.lines.map((line) => line.id)).toEqual(["line_FIRST_JOB"]);
});
