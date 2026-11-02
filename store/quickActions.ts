import { create } from "zustand";

/** Whether the "+" sheet is open. One sheet, opened from the tab bar on any tab. */
export const useQuickActions = create<{
  open: boolean;
  show: () => void;
  hide: () => void;
}>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
