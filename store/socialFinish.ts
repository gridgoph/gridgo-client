import { create } from "zustand";

import type { ContactKind } from "@/lib/socialSignIn";

/**
 * Where the Facebook finish step is up to (`app/(auth)/finish-sign-in.tsx`).
 *
 * In a store rather than the screen's state for the reason `store/loginFlow.ts`
 * gives: every step change follows an async Clerk answer, and a plain
 * `useState` write from there is dropped under the test renderer.
 *
 * - `contact` — add an email or mobile (Facebook shared none).
 * - `code` — the six-digit code sent to it. `existing` means the contact
 *   already belonged to a GRIDGO person, so the code signs in to that account
 *   instead of finishing a new one.
 * - `linkCode` — Clerk wants the email Facebook shared confirmed before it
 *   joins Facebook to the account that already holds it.
 */
export type SocialFinishStep = "contact" | "code" | "linkCode";

type SocialFinishState = {
  step: SocialFinishStep;
  kind: ContactKind;
  contact: string;
  existing: boolean;
  code: string;
  busy: boolean;
  /** The field was submitted once, so its problem now shows under it. */
  checked: boolean;
  error: string | null;
  /** A provider tap on login or sign-up is in flight. */
  providerBusy: boolean;
  /** A provider tap failed; said under the provider buttons. */
  providerError: string | null;
  /** A calm line under the provider buttons — the Facebook window was closed. */
  notice: string | null;
  setProviderBusy: (busy: boolean) => void;
  setProviderError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  setKind: (kind: ContactKind) => void;
  setContact: (contact: string) => void;
  setCode: (code: string) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  check: () => void;
  enterCode: (existing: boolean) => void;
  enterLinkCode: () => void;
  backToContact: () => void;
  reset: () => void;
};

const initial = {
  step: "contact" as SocialFinishStep,
  kind: "email" as ContactKind,
  contact: "",
  existing: false,
  code: "",
  busy: false,
  checked: false,
  error: null as string | null,
  providerBusy: false,
  providerError: null as string | null,
  notice: null as string | null,
};

export const useSocialFinish = create<SocialFinishState>((set) => ({
  ...initial,
  setKind: (kind) => set({ kind, contact: "", checked: false, error: null }),
  setContact: (contact) => set({ contact }),
  setCode: (code) => set({ code }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setProviderBusy: (providerBusy) => set({ providerBusy }),
  setProviderError: (providerError) => set({ providerError }),
  setNotice: (notice) => set({ notice }),
  check: () => set({ checked: true }),
  enterCode: (existing) => set({ step: "code", existing, code: "", error: null }),
  enterLinkCode: () => set({ step: "linkCode", code: "", error: null }),
  backToContact: () => set({ step: "contact", code: "", existing: false, error: null }),
  reset: () => set(initial),
}));
