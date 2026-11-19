/**
 * How to order (gridgo-client#441): the once-a-day mission popup and the
 * five-step coach-mark guide over the real Express screens.
 *
 * Pure. Every flag is GRIDGO's (`GET /me/express-guide`, gridgo-api
 * `docs/EXPRESS_API.md#guide-and-missions`): the popup's day, guide seen and
 * guide completed. This module only decides what the app does with them.
 * The guide draws sample data and never creates a draft or an order.
 */

import type { ExpressDraft, ExpressGuide, ExpressShop, StoredFile } from "@/lib/api";
import type { FoundingTesterView } from "@/lib/foundingTester";

/** Opens the guide rather than a route: the mission button's target until the guide is completed. */
export const HOW_TO_ORDER_HREF = "guide:how-to-order";
export const EXPRESS_FILES_HREF = "/express";

/** The sample order the guide's last screen shows. Never sent to GRIDGO. */
export const GUIDE_SAMPLE_ORDER_ID = "how-to-order-sample";

export type GuideScreen = "home" | "express" | "expressOrder";

export type GuideStepId = "home.express" | "express.upload" | "express.preview" | "express.shop" | "express.pickup";

export type GuideStep = {
  id: GuideStepId;
  screen: GuideScreen;
  /** The Express flow step this tip sits on, for the three Express steps. */
  expressStep?: "files" | "preview" | "pay";
  title: string;
  body: string;
};

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: "home.express",
    screen: "home",
    title: "Tap Express",
    body: "Print documents at a shop near you.",
  },
  {
    id: "express.upload",
    screen: "express",
    expressStep: "files",
    title: "Add your file",
    body: "Pick a PDF, Word file or photo from your phone.",
  },
  {
    id: "express.preview",
    screen: "express",
    expressStep: "preview",
    title: "Check, then continue",
    body: "Tick Looks right when the preview matches. Then Continue.",
  },
  {
    id: "express.shop",
    screen: "express",
    expressStep: "pay",
    title: "Pick a shop and pay",
    body: "The nearest open shop is chosen. Pay by QR Ph, or cash where offered.",
  },
  {
    id: "express.pickup",
    screen: "expressOrder",
    title: "Show your code",
    body: "When it's ready, show this code at the shop.",
  },
];

export const GUIDE_LENGTH = GUIDE_STEPS.length;

/** Where a running guide stands: one of the five tips, or the end card. */
export type GuideProgress = { step: number } | { step: "end" };

export function guideStep(progress: GuideProgress | null): GuideStep | null {
  if (!progress || progress.step === "end") return null;
  return GUIDE_STEPS[progress.step] ?? null;
}

export function nextGuide(progress: GuideProgress): GuideProgress {
  if (progress.step === "end") return progress;
  return progress.step + 1 >= GUIDE_LENGTH ? { step: "end" } : { step: progress.step + 1 };
}

/** Back from the first tip goes nowhere; back from the end card is the last tip. */
export function backGuide(progress: GuideProgress): GuideProgress {
  if (progress.step === "end") return { step: GUIDE_LENGTH - 1 };
  return { step: Math.max(0, progress.step - 1) };
}

export function canGoBackGuide(progress: GuideProgress): boolean {
  return progress.step === "end" || progress.step > 0;
}

/**
 * Whether the mission popup opens now. GRIDGO says whether it is due today
 * (`showPopup`: step one not done and not yet shown on this Manila day); the
 * app adds that it opens once per launch, only over the mission steps of an
 * eligible Founding Tester, and never while the guide is running.
 */
export function shouldOpenMissionPopup(input: {
  guide: Pick<ExpressGuide, "showPopup" | "missions"> | null;
  view: FoundingTesterView | null;
  openedThisLaunch: boolean;
  guideRunning: boolean;
}): boolean {
  if (!input.guide?.showPopup || input.guide.missions.added === true) return false;
  if (input.openedThisLaunch || input.guideRunning) return false;
  return input.view?.kind === "missions";
}

/** Step one's button: the guide until it is completed, then Express Files. */
export function startOrderAction(guideCompleted: boolean | undefined): {
  label: string;
  href: string;
} {
  return guideCompleted === false
    ? { label: "How to order", href: HOW_TO_ORDER_HREF }
    : { label: "Open Express", href: EXPRESS_FILES_HREF };
}

/** The popup's tip bar shows until the guide is completed. */
export function showsHowToOrderBar(guide: Pick<ExpressGuide, "guideCompleted"> | null): boolean {
  return guide !== null && !guide.guideCompleted;
}

/* --------------------------------------------------------------------------
   Sample data: what the guide draws on the real screens
   -------------------------------------------------------------------------- */

export const SAMPLE_FILE_ID = "how-to-order-sample-file";
export const SAMPLE_SUPPLIER_ID = "how-to-order-sample-shop";
export const SAMPLE_PICKUP_CODE = "042517";

export const SAMPLE_FILE: StoredFile = {
  fileId: SAMPLE_FILE_ID,
  purpose: "artwork",
  originalFilename: "Sample - Class report.pdf",
  declaredContentType: "application/pdf",
  detectedContentType: "application/pdf",
  size: 482_000,
  ownerId: "sample",
  state: "ready",
  createdAt: "2026-11-19T00:00:00.000Z",
  readyAt: "2026-11-19T00:00:00.000Z",
  references: [],
  detected: {
    kind: "pdf",
    pageCount: 4,
    pixelWidth: null,
    pixelHeight: null,
    dpi: null,
    measureUnit: "mm",
    widthMilli: 210_000,
    heightMilli: 297_000,
    pageSize: "A4",
    orientation: "portrait",
  },
};

export const SAMPLE_SHOP: ExpressShop = {
  supplierId: SAMPLE_SUPPLIER_ID,
  catalogItemIds: ["how-to-order-sample-item"],
  name: "Sample Print Shop",
  address: "Near you",
  location: { lat: 7.0731, lng: 125.6128, label: "Near you" },
  distanceMeters: 350,
  rating: { average: 4.8, count: 24 },
  jobsAhead: 1,
  readyAt: null,
  isNew: false,
  busy: false,
};

export const SAMPLE_PLACE = {
  lat: 7.0731,
  lng: 125.6128,
  label: "Sample location",
  addressId: null,
};

/** Four B&W pages at a sample rate; the figure is illustration, not a quote. */
export function sampleDraft(): ExpressDraft {
  return {
    cartId: "how-to-order-sample-cart",
    confirmation: "sample",
    shop: SAMPLE_SHOP,
    quote: {
      status: "priced",
      reasons: [],
      clientItemSubtotalMinor: 1_300,
      deliveryLines: [],
      deliveryFeeMinor: 0,
      totalMinor: 1_300,
      downpaymentMinor: 1_300,
      balanceMinor: 0,
      voucherDiscountMinor: 0,
    },
  };
}
