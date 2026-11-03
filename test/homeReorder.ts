import type * as api from "@/lib/api";
import { useCart } from "@/store/cart";
import { useHomeSummary } from "@/store/homeSummary";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

/**
 * Home's Reorder tile, tapped for real (gridgo-client reorder-draft bug).
 * Each test file mocks `expo-router` with `homeReorderRouter` and `@/lib/api`
 * with `homeReorderApiMock`, then calls `resetHomeReorder` before each test.
 */

/** A past marketplace job: no catalogue product, artwork and a drop-off. */
export const PAST_FLYERS = {
  id: "ord_flyers",
  productId: null,
  title: "Flyers",
  quantity: 200,
  size: "",
  material: "",
  finish: null,
  address: "Sample drop-off",
  zone: "",
  artworkName: "flyer.pdf",
  artworkFileIds: ["file_flyer"],
  deadline: "2026-11-30T02:00:00.000Z",
  state: "completed",
  createdAt: "2026-11-01T00:00:00.000Z",
} as unknown as api.Order;

export const REPLACE_QUESTION = 'Replace your draft request with "Flyers"?';

export function homeReorderRouter(navigate: (href: string) => void, dismissTo: (href: string) => void) {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate, dismissTo };
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

export function homeReorderApiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => [PAST_FLYERS]),
    listCatalog: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getHomeSummary: jest.fn(async () => {
      throw new Error("offline");
    }),
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    saveAccountThemePreference: jest.fn(async (value: string) => value),
  };
}

/** `draftTitle`: a request the client started themselves, or none. */
export function resetHomeReorder(draftTitle?: string) {
  useHomeSummary.getState().clear();
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  if (draftTitle) useRequestDraft.getState().patch({ title: draftTitle });
  useSession.setState({
    user: {
      id: "user_1",
      name: "Rina Cruz",
      email: "rina@example.com",
      role: "client",
      accountType: "business",
      orgName: "Cruz Signs",
    },
    token: "tok_test",
  } as never);
}
