import { useCallback } from "react";
import { useRouter } from "expo-router";

import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import * as api from "@/lib/api";
import { artworkCheckFailure } from "@/lib/artworkUpload";
import { newJobTicket, ticketIsCurrent } from "@/lib/jobTicket";
import {
  reorderAnswers,
  reorderArtworkFileIds,
  reorderFulfilment,
  reorderTarget,
  type ReorderTarget,
} from "@/lib/reorder";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { useListingDraft } from "@/store/listingDraft";
import { useReorderJob, type ReorderFile } from "@/store/reorderJob";

/**
 * The catalogue is read only for an old-shape order, and the tree comes through
 * GRIDGO's read so a code newer than the phone's copy is still found.
 */
async function findTarget(order: api.Order): Promise<ReorderTarget | null> {
  const catalog = order.productId ? await api.listCatalog().catch(() => []) : [];
  const tree = await api.getProductCategories().catch(() => api.productCategoriesNow());
  return reorderTarget(order, tree, catalog);
}

/**
 * The artwork comes along only while GRIDGO still keeps it: a file past its
 * retention, deleted, or one that failed its check is left off, and the Artwork
 * step asks for it as it does on any job. Read behind the navigation, so a tap
 * never waits on it.
 */
async function keptArtwork(order: api.Order): Promise<ReorderFile[]> {
  const files = await Promise.all(reorderArtworkFileIds(order).map((id) => api.getFile(id).catch(() => null)));
  return files.flatMap((file) =>
    file && file.state === "ready" && file.purpose === "artwork" && !artworkCheckFailure(file.artworkCheck)
      ? [{ fileId: file.fileId, name: file.originalFilename, contentType: file.detectedContentType }]
      : [],
  );
}

/**
 * Repeat a past job: the current order flow, started the way any new print
 * starts (`useStartPrintJob`), with the product known and what still applies
 * carried along (`lib/reorder.ts`). It joins an open basket like a new print
 * does, and when nothing says which product it was, the client chooses.
 *
 * Home's tile, the "+" sheet and the Orders tab all reorder through here.
 */
export function useReorder() {
  const router = useRouter();
  const startJob = useStartPrintJob();

  const reorder = useCallback(
    async (order: api.Order) => {
      // The newest tap wins, a double tap included. The hook's screen may be
      // gone when the lookup lands, so the launch answers to its ticket.
      const ticket = newJobTicket();
      const target = await findTarget(order);
      if (!ticketIsCurrent(ticket)) return;
      if (!target) {
        router.push("/request/category");
        return;
      }
      useBasketGroupTarget.getState().clear();
      // Answers left on a sheet by an earlier job must not outrank this order's.
      useListingDraft.getState().clear();
      startJob(target.category, target.subcategory);
      useJobFulfilment.getState().set(reorderFulfilment(order));
      const jobId = useReorderJob.getState().start({
        subcategory: target.subcategory,
        answers: reorderAnswers(order),
        files: null,
        lineId: null,
        artworkNote: null,
      });
      void keptArtwork(order).then((files) => useReorderJob.getState().update(jobId, { files }));
    },
    [router, startJob],
  );

  return { reorder };
}
