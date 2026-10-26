import { create } from "zustand";

import * as api from "@/lib/api";
import type { LegalVersion } from "@/lib/api";
import { isLegalUnsupported } from "@/lib/legal";

/**
 * The client library: every effective document for the `client` audience.
 *
 * Public, so sign-up reads it before an account exists, and the artwork box
 * reads the rights statement's version from it. The API marks it `no-store`
 * because a publication takes effect without an app release, so a read is
 * reused for a minute at most.
 */

export const LEGAL_LIBRARY_REUSE_MS = 60_000;

export type LegalLibraryStatus = "idle" | "loading" | "ready" | "unsupported" | "failed";

type LegalLibraryState = {
  documents: LegalVersion[];
  status: LegalLibraryStatus;
  readAt: number | null;
  /**
   * The last read failed. A failed refresh keeps the cached list and stays
   * `ready`, so this is what tells a missing document apart from an unread one.
   */
  lastLoadFailed: boolean;
  /** Never throws. Keeps the last good list while a refresh runs. */
  load: (options?: { force?: boolean }) => Promise<void>;
};

let inflight: Promise<void> | null = null;

export const useLegalLibrary = create<LegalLibraryState>((set, get) => ({
  documents: [],
  status: "idle",
  readAt: null,
  lastLoadFailed: false,

  load: async (options) => {
    const { readAt, status } = get();
    const fresh = readAt != null && Date.now() - readAt < LEGAL_LIBRARY_REUSE_MS;
    if (!options?.force && fresh && (status === "ready" || status === "unsupported")) return;
    if (inflight) return inflight;
    if (get().documents.length === 0) set({ status: "loading" });
    inflight = (async () => {
      try {
        const documents = await api.listLegalDocuments("client");
        set({ documents, status: "ready", readAt: Date.now(), lastLoadFailed: false });
      } catch (error) {
        set(
          isLegalUnsupported(error)
            ? { documents: [], status: "unsupported", readAt: Date.now(), lastLoadFailed: false }
            : { status: get().documents.length ? "ready" : "failed", lastLoadFailed: true },
        );
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
}));
