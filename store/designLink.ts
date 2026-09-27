import { create } from "zustand";

import * as api from "@/lib/api";
import type { CartLineRecord } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  lineArtworkLinks,
  linkVerdict,
  parseDesignLink,
  sameLinks,
  type LinkCheckState,
} from "@/lib/designLink";
import { useCart } from "@/store/cart";

/**
 * The design-link field on the artwork step: what was last entered, what the
 * link check said, and whether the line has taken it.
 *
 * In a store rather than `useState` for the reason `store/loginFlow.ts` gives:
 * on @testing-library/react-native 14 with React 19 a `useState` write from an
 * async continuation never re-renders, and every answer here arrives after an
 * `await`. Nothing is persisted — a check is advice about one moment.
 */

type DesignLinkState = {
  /** Per line: the text last committed by paste, blur or submit. */
  committed: Record<string, string>;
  /** Per link (`formatCode url`): where its check stands. */
  checks: Record<string, LinkCheckState>;
  saving: Record<string, boolean>;
  saveError: Record<string, string | null>;
  /**
   * Check a link and, unless it plainly cannot be opened, put it on the line.
   * The line, its formats and the cart all come from `useCart`: the basket
   * lives on GRIDGO, and the response to the save is the basket.
   */
  commit: (text: string, lineId: string, options?: { recheck?: boolean }) => Promise<void>;
  /** A link already on the line counts as committed, so leaving the field unchanged checks nothing. */
  seed: (lineId: string, url: string) => void;
  reset: () => void;
};

export function checkKey(link: api.ArtworkLink): string {
  return `${link.formatCode} ${link.url}`;
}

const initial = { committed: {}, checks: {}, saving: {}, saveError: {} };

/** Newest commit per line, so a slow check cannot overwrite a later paste. */
const generations = new Map<string, number>();

const NO_LINKS_ON_THIS_API =
  "GRIDGO could not keep a design link on this item yet. Upload the file instead.";

export const useDesignLink = create<DesignLinkState>((set, get) => {
  function patch<K extends "checks" | "saving" | "saveError" | "committed">(
    key: K,
    id: string,
    value: DesignLinkState[K][string],
  ) {
    set((state) => ({ [key]: { ...state[key], [id]: value } }) as unknown as Partial<DesignLinkState>);
  }

  async function save(line: CartLineRecord, links: api.ArtworkLink[], generation: number) {
    const cart = useCart.getState();
    patch("saving", line.id, true);
    patch("saveError", line.id, null);
    try {
      const updated = await cart.run((cartId) =>
        api.updateCartLine(cartId, line.id, { artworkLinks: links }),
      );
      if (generations.get(line.id) !== generation) return;
      cart.adopt(updated);
      // An API from before design links ignores the field and sends none back.
      const saved = updated.lines.find((entry) => entry.id === line.id);
      if (links.length && !Array.isArray(saved?.artworkLinks)) {
        patch("saveError", line.id, NO_LINKS_ON_THIS_API);
      }
    } catch (error) {
      if (generations.get(line.id) !== generation) return;
      patch(
        "saveError",
        line.id,
        userFacingError(error, "Your link did not go onto this item. Try again in a moment."),
      );
    } finally {
      if (generations.get(line.id) === generation) patch("saving", line.id, false);
    }
  }

  return {
    ...initial,
    commit: async (text, lineId, options = {}) => {
      const line = useCart.getState().cart?.lines.find((entry) => entry.id === lineId);
      if (!line) return;
      const formats = line.listing?.acceptedFormats ?? [];
      const trimmed = text.trim();
      // A paste commits, and the blur that follows it commits the same text:
      // the first one is already checking and saving it.
      if (!options.recheck && get().committed[line.id] === trimmed) return;
      const generation = (generations.get(line.id) ?? 0) + 1;
      generations.set(line.id, generation);
      patch("committed", line.id, trimmed);
      const saved = lineArtworkLinks(line);

      if (!trimmed) {
        patch("saveError", line.id, null);
        if (saved.length) await save(line, [], generation);
        return;
      }

      const parsed = parseDesignLink(trimmed, formats);
      if (!parsed.ok) return;

      const key = checkKey(parsed.link);
      let state = get().checks[key];
      const stale = !state || state.phase === "failed" || options.recheck;
      if (stale) {
        patch("checks", key, { phase: "checking" });
        try {
          const check = await api.checkArtworkLink(parsed.link);
          state = check ? { phase: "checked", check } : { phase: "unavailable" };
        } catch (error) {
          const code =
            error instanceof api.ApiError &&
            typeof error.body === "object" &&
            error.body &&
            "error" in error.body
              ? String((error.body as { error: unknown }).error)
              : null;
          state = {
            phase: "failed",
            // A link GRIDGO refuses to check is one it also refuses to keep.
            blocks: code === "invalid_artwork_link" || code === "unsafe_artwork_url",
            message: userFacingError(error, "We couldn't check this link just now. You can still continue."),
          };
        }
        patch("checks", key, state);
      }
      if (generations.get(line.id) !== generation || !state || state.phase === "checking") return;

      const blocked = linkVerdict(state)?.blocks ?? false;
      const next = blocked ? [] : [parsed.link];
      if (!sameLinks(saved, next)) await save(line, next, generation);
    },
    seed: (lineId, url) => {
      if (get().committed[lineId] === undefined) patch("committed", lineId, url);
    },
    reset: () => {
      generations.clear();
      set(initial);
    },
  };
});
