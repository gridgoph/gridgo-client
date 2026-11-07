import type * as api from "@/lib/api";
import type { ProductCategory } from "@/lib/productCategories";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useHomeSummary } from "@/store/homeSummary";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { useListingDraft } from "@/store/listingDraft";
import { useReorderJob } from "@/store/reorderJob";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

/**
 * Reorder, tapped for real from each of its three entry points. Each test file
 * mocks `expo-router` with `reorderRouter` and `@/lib/api` with `reorderApiMock`
 * (jest hoists mocks per file), then calls `resetReorder` before each test.
 */

/** A job from the current flow: everything it was is on its line. */
export const CURRENT_FLOW_ORDER = {
  id: "ord_flyers",
  productId: null,
  title: "Flyers",
  quantity: 2,
  size: "",
  material: "",
  finish: null,
  address: "Sample drop-off",
  zone: "",
  artworkName: "flyer.pdf",
  artworkFileIds: ["file_flyer"],
  deadline: "2026-11-30T02:00:00.000Z",
  fulfillmentMode: "delivery",
  dropoff: { lat: 7.07, lng: 125.61, label: "Sample drop-off" },
  state: "completed",
  createdAt: "2026-11-01T00:00:00.000Z",
  productionItems: [
    {
      id: "item_1",
      subcategoryCode: "flyers",
      itemName: "Flyers",
      quantity: 2,
      pricingUnit: "per_package",
      packageQty: 100,
      measurement: null,
      structuredSpec: {},
      options: [{ groupName: "Paper", label: "Gloss" }],
      artworkFileId: "file_flyer",
      mockupFileId: null,
    },
  ],
} as unknown as api.Order;

/** What the API sends today: the same job, with no product code on its line. */
export const NO_CODE_ORDER = {
  ...CURRENT_FLOW_ORDER,
  productionItems: [{ ...CURRENT_FLOW_ORDER.productionItems![0], subcategoryCode: null }],
} as unknown as api.Order;

/** From the retired form: a catalogue product, specs on the order, no line. */
export const OLD_SHAPE_ORDER = {
  ...CURRENT_FLOW_ORDER,
  id: "ord_tarp",
  productId: "prod_tarpaulin",
  title: "Grand opening tarpaulin",
  quantity: 3,
  size: "3x6 ft",
  material: "13oz tarpaulin",
  dropoff: undefined,
  fulfillmentMode: undefined,
  productionItems: undefined,
} as unknown as api.Order;

export const REORDER_CATALOG = [{ id: "prod_tarpaulin", name: "Tarpaulin / Banner", family: "banner" }] as unknown as api.CatalogProduct[];

export const REORDER_TREE = [
  {
    code: "marketing_collateral",
    subcategories: [
      { code: "flyers", name: "Flyers", productFamilyIds: ["flyer"] },
      { code: "brochures", name: "Brochures", productFamilyIds: ["flyer"] },
    ],
  },
  {
    code: "signage",
    subcategories: [{ code: "tarpaulin", name: "Tarpaulin", productFamilyIds: ["banner"] }],
  },
] as unknown as ProductCategory[];

export const KEPT_FILE = {
  fileId: "file_flyer",
  purpose: "artwork",
  originalFilename: "flyer.pdf",
  detectedContentType: "application/pdf",
  state: "ready",
};

export function reorderRouter(push: (href: unknown) => void) {
  const router = { push, replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
  return {
    router,
    useRouter: () => router,
    useFocusEffect: (effect: () => void) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useEffect } = require("react");
      useEffect(effect, [effect]);
    },
  };
}

/** Read lazily: the fixtures are still loading when jest runs a mock's factory. */
export function reorderApiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => [CURRENT_FLOW_ORDER]),
    listCatalog: jest.fn(async () => REORDER_CATALOG),
    productCategoriesNow: jest.fn(() => REORDER_TREE),
    getProductCategories: jest.fn(async () => REORDER_TREE),
    getFile: jest.fn(async () => KEPT_FILE),
    recordFunnel: jest.fn(async () => undefined),
    getCart: jest.fn(async () => null),
    getHomeSummary: jest.fn(async () => {
      throw new Error("offline");
    }),
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    saveAccountThemePreference: jest.fn(async (value: string) => value),
  };
}

export function resetReorder() {
  useHomeSummary.getState().clear();
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useReorderJob.getState().clear();
  useJobFulfilment.getState().clear();
  useListingDraft.getState().clear();
  useBasketGroupTarget.getState().clear();
  useSession.setState({
    user: {
      id: "user_1",
      name: "Test Client",
      email: "client@example.com",
      role: "client",
      accountType: "business",
      orgName: "Test Signs",
    },
    token: "tok_test",
  } as never);
}

/** The reported bug's opposite: the current flow's date step, with the job carried. */
export function expectCurrentFlowFlyers(push: jest.Mock) {
  expect(push).toHaveBeenCalledWith({
    pathname: "/request/when",
    params: { subcategory: "flyers", category: "marketing_collateral" },
  });
  expect(useRequestDraft.getState().productId).toBe("");
  expect(useRequestDraft.getState().title).toBe("");
  expect(useReorderJob.getState().job?.subcategory).toBe("flyers");
  expect(useReorderJob.getState().job?.answers.quantity).toBe(2);
  expect(useJobFulfilment.getState().choice).toEqual({
    fulfillmentMode: "delivery",
    dropoff: { lat: 7.07, lng: 125.61, label: "Sample drop-off" },
  });
}
