/**
 * The promo card's colours (shared contract with the Admin preview,
 * firstmate/data/promo-color/contract.md): the card is Operations' `color`,
 * and everything drawn on it is whichever of GRIDGO ink or white reads
 * better on that colour, so any picked colour stays legible.
 */

import type { HomePromotion } from "@/lib/homePromos";

const INK = "#1A1A1A";
const WHITE = "#FFFFFF";
const STYLE_COLORS = { light: WHITE, yellow: "#FFDE58" } as const;
/** Closer than this in relative luminance and the card would melt into the screen. */
const NEAR_SURFACE = 0.1;

export type PromoCardColors = {
  background: string;
  ink: string;
  /** Ink at 72%: the tag, the inactive pager dots. */
  muted: string;
  /** Ink at 10%: the tag chip's fill. */
  chip: string;
  /** A hairline only when the card is close to the screen behind it. */
  border: string;
};

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** GRIDGO ink or white, whichever has the higher contrast on `background`. */
export function readableInk(background: string): string {
  return contrastRatio(background, INK) >= contrastRatio(background, WHITE) ? INK : WHITE;
}

function alpha(hex: string, amount: number): string {
  return `${hex}${Math.round(amount * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}

/** The card's own colour: `color`, else the older API's `style`. */
export function promoCardColor(promo: Pick<HomePromotion, "color" | "style">): string {
  return isHexColor(promo.color) ? promo.color.toUpperCase() : STYLE_COLORS[promo.style];
}

/** `screen` is the theme's colour behind the card (canvas). */
export function promoCardColors(promo: Pick<HomePromotion, "color" | "style">, screen: string, outline: string): PromoCardColors {
  const background = promoCardColor(promo);
  const ink = readableInk(background);
  const near = isHexColor(screen) && Math.abs(luminance(background) - luminance(screen)) < NEAR_SURFACE;
  return {
    background,
    ink,
    muted: alpha(ink, 0.72),
    chip: alpha(ink, 0.1),
    border: near ? outline : background,
  };
}
