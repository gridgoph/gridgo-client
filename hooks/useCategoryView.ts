import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export type CategoryView = "list" | "wall";

const STORAGE_KEY = "gridgo.categoryView";

/**
 * How the client wants this category drawn: quote strips, or a wall of samples.
 *
 * Default is the list — that is the scan a client does when they already know
 * the kind of work and are reading the price. The wall is for looking. The
 * choice is remembered on this phone so flipping categories does not reset it.
 */
export function useCategoryView(): [CategoryView, (next: CategoryView) => void] {
  const [view, setView] = useState<CategoryView>("list");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "list" || stored === "wall") setView(stored);
      })
      .catch(() => {
        // Keep the list. A failed read must not invent a wall.
      });
  }, []);

  function choose(next: CategoryView) {
    setView(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // In-memory choice still applies for this visit.
    });
  }

  return [view, choose];
}
