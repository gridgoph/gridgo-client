import type { Order } from "@/lib/api";
import { hasPlainHistory, progressView, WAITING_FOR_PHOTO } from "@/lib/productionProgress";

type Slice = Pick<Order, "state" | "productionProgress">;

const photo = (fileId: string, at: string) => ({
  fileId,
  contentType: "image/jpeg",
  at,
  downloadUrl: `https://storage.test/${fileId}`,
  downloadUrlExpiresAt: "2026-09-28T10:05:00Z",
});

describe("progressView", () => {
  it("says nothing for an API from before the gallery, rather than guessing a wait", () => {
    expect(progressView({ state: "production" })).toBeNull();
    expect(progressView({ state: "ready_for_dispatch", productionProgress: null })).toBeNull();
  });

  it("puts the newest photo first", () => {
    const view = progressView({
      state: "supplier_self_qc",
      productionProgress: {
        status: "photos_available",
        photos: [photo("file_a", "2026-09-28T08:00:00Z"), photo("file_b", "2026-09-28T09:00:00Z")],
      },
    });
    expect(view?.kind).toBe("photos");
    expect(view?.kind === "photos" && view.photos.map((p) => p.fileId)).toEqual(["file_b", "file_a"]);
  });

  it("trusts the photos over the status word", () => {
    const view = progressView({
      state: "production",
      productionProgress: { status: "photos_available", photos: [] },
    });
    expect(view?.kind).toBe("waiting");
  });

  it("waits for a photo on the press, and says the job is not packed without one", () => {
    const view = progressView({
      state: "production",
      productionProgress: { status: "waiting_for_photo", photos: [] },
    });
    expect(view).toMatchObject({ kind: "waiting" });
    expect(view?.kind === "waiting" && view.body).toMatch(/not packed without one/);
  });

  it("still says a photo is missing on a job Operations moved on without one", () => {
    for (const state of ["ready_for_dispatch", "awaiting_collection", "delivered", "completed"]) {
      const view = progressView({
        state,
        productionProgress: { status: "waiting_for_photo", photos: [] },
      } satisfies Slice);
      expect(view?.kind).toBe("waiting");
      // Past the press, the copy stops promising the job waits on it.
      expect(view?.kind === "waiting" && view.body).toMatch(/No photo came in/);
    }
  });

  it("does not ask for a photo before printing has started", () => {
    for (const state of ["payment_authorized", "needs_qa", "cancelled"]) {
      expect(
        progressView({ state, productionProgress: { status: "waiting_for_photo", photos: [] } }),
      ).toBeNull();
    }
  });

  it("keeps a photo storage could not sign, so its link can be asked for", () => {
    const view = progressView({
      state: "production",
      productionProgress: {
        status: "photos_available",
        photos: [{ fileId: "file_unsigned", contentType: "image/png", at: "2026-09-28T08:00:00Z" }],
      },
    });
    expect(view?.kind === "photos" && view.photos[0].fileId).toBe("file_unsigned");
  });

  it("names the wait in the words the issue asks for", () => {
    expect(WAITING_FOR_PHOTO).toBe("Waiting for a progress photo");
  });
});

describe("hasPlainHistory", () => {
  it("is true only for the projection that carries the gallery", () => {
    expect(hasPlainHistory({ productionProgress: { status: "waiting_for_photo", photos: [] } })).toBe(true);
    expect(hasPlainHistory({})).toBe(false);
    expect(hasPlainHistory({ productionProgress: null })).toBe(false);
  });
});
