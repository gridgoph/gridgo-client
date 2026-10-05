import { create } from "zustand";

import * as api from "@/lib/api";
import type { ClientOrganization, User } from "@/lib/api";
import { normalizeFileName } from "@/lib/artworkUpload";
import {
  applicantPerson,
  applicationInput,
  applicationSteps,
  checklistFor,
  documentIds,
  emailCodeMessage,
  emptyApplicationDraft,
  manilaToday,
  refusalMessage,
  refusalStep,
  stepProblem,
  trackOf,
  type ApplicationDraft,
  type ApplicationMode,
  type ApplicationStep,
  type ChecklistItem,
  type DocumentKey,
  type PersonDraft,
} from "@/lib/clientApplication";
import { userFacingError } from "@/lib/copy";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";

/**
 * Where a client is in an organization or business application, or in an
 * officer handover (gridgo-client#163, #164).
 *
 * In a store rather than screen state for the reason `store/businessApply.ts`
 * gives: under React 19 and RNTL 14 a `useState` write from an async
 * continuation is dropped, and almost everything here arrives that way —
 * uploads, the email code, the answer to the submission.
 *
 * Nothing is persisted. It holds ID details, and an application half-filled
 * last week is not one to resume silently on a phone that may have changed
 * hands.
 */

/** GRIDGO takes these for verification documents, up to 20 MiB. */
const DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const DOCUMENT_MAX_MIB = 20;

export type DocumentUpload =
  | { phase: "sending"; name: string; progress: number | null }
  | { phase: "failed"; name: string | null; error: string };

export type EmailPhase = "idle" | "sending" | "sent" | "verifying" | "verified";

export type ApplicationNotice = { message: string; tone: "error" | "info" };

export type ClientApplicationState = {
  mode: ApplicationMode;
  steps: ApplicationStep[];
  index: number;
  draft: ApplicationDraft;
  /** Operations asked this business for its permit. */
  businessPermitRequired: boolean;
  /** Sent with a correction, a first officer, or a handover. */
  expectedVersion: number | null;
  loginEmail: string;
  showProblem: boolean;
  uploads: Partial<Record<DocumentKey, DocumentUpload>>;
  email: {
    phase: EmailPhase;
    code: string;
    resendAfter: string | null;
    error: string | null;
  };
  submitting: boolean;
  notice: ApplicationNotice | null;
  idempotencyKey: string;

  start: (input: {
    mode: ApplicationMode;
    user: User | null;
    organization?: ClientOrganization | null;
  }) => void;
  loadChecklist: () => Promise<void>;
  edit: (patch: Partial<Omit<ApplicationDraft, "person" | "documents">>) => void;
  editPerson: (patch: Partial<PersonDraft>) => void;
  next: () => void;
  back: () => void;
  /** Back to an earlier step from Review. Never forward past an unchecked one. */
  goTo: (step: ApplicationStep["id"]) => void;
  pickDocument: (key: DocumentKey) => Promise<void>;
  removeDocument: (key: DocumentKey) => void;
  sendCode: () => Promise<void>;
  setCode: (code: string) => void;
  verifyCode: () => Promise<void>;
  submit: () => Promise<boolean>;
  reset: () => void;
};

const EMPTY_EMAIL = { phase: "idle" as EmailPhase, code: "", resendAfter: null, error: null };

const EMPTY = {
  mode: "apply" as ApplicationMode,
  steps: applicationSteps("apply", "organization"),
  index: 0,
  draft: emptyApplicationDraft(),
  businessPermitRequired: false,
  expectedVersion: null,
  loginEmail: "",
  showProblem: false,
  uploads: {},
  email: EMPTY_EMAIL,
  submitting: false,
  notice: null,
  idempotencyKey: "",
};

/** Each start gets a scope; an upload from an abandoned form never lands in a new one. */
let scope = 0;
const handles = new Map<DocumentKey, api.UploadHandle>();

function cancelUploads() {
  for (const handle of handles.values()) handle.cancel();
  handles.clear();
}

/** The checklist for what is on screen now. */
export function currentChecklist(
  state: Pick<ClientApplicationState, "mode" | "draft" | "businessPermitRequired">,
): ChecklistItem[] {
  const track = state.mode === "apply" ? trackOf(state.draft) : "organization";
  return track ? checklistFor(track, { businessPermitRequired: state.businessPermitRequired }) : [];
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  if (typeof body === "object" && body && "error" in body) return String((body as { error: unknown }).error);
  return null;
}

function errorFields(error: unknown): string[] {
  if (!(error instanceof api.ApiError)) return [];
  const fields = (error.body as { fields?: unknown } | null)?.fields;
  return fields && typeof fields === "object" ? Object.keys(fields) : [];
}

function uploadError(error: unknown): string {
  switch (errorCode(error)) {
    case "file_too_large":
      return `This file is over ${DOCUMENT_MAX_MIB} MB. Take a smaller photo or scan, then add it again.`;
    case "content_type_not_allowed":
    case "purpose_media_type_not_allowed":
    case "file_type_mismatch":
    case "heic_not_supported":
      return "GRIDGO takes a JPEG, PNG or WebP photo, or a PDF. Save it in one of those, then add it again.";
    case "upload_cancelled":
      return "The upload was stopped. Add the file again.";
    default:
      return userFacingError(error, "The file did not reach GRIDGO. Check your connection and add it again.");
  }
}

export const useClientApplication = create<ClientApplicationState>((set, get) => ({
  ...EMPTY,

  start: ({ mode, user, organization = null }) => {
    cancelUploads();
    scope++;
    const draft = emptyApplicationDraft(
      mode === "handover"
        // A handover is a new person: nothing of the current officer carries over.
        ? {}
        : { orgName: user?.orgName, accountType: mode === "apply" ? user?.accountType : "organization", name: user?.name, phone: user?.phone },
      organization,
    );
    if (mode !== "apply") draft.accountType = "organization";
    const caseVersion = organization?.approvalCase?.version ?? user?.approvalCase?.version ?? null;
    const caseStatus = user?.approvalCase?.status;
    set({
      ...EMPTY,
      mode,
      draft,
      steps: applicationSteps(mode, draft.accountType),
      expectedVersion:
        mode === "apply"
          ? caseStatus === "pending" || caseStatus === "rejected"
            ? (user?.approvalCase?.version ?? null)
            : null
          : caseVersion,
      loginEmail: user?.email ?? "",
      idempotencyKey: api.newIdempotencyKey(),
    });
  },

  loadChecklist: async () => {
    const mine = scope;
    try {
      const checklist = await api.getApplicationChecklist();
      if (mine !== scope) return;
      set({ businessPermitRequired: Boolean(checklist.businessPermitRequired) });
    } catch {
      // The checklist is also built into the app. Missing only means the
      // permit request (rare) is not known, and GRIDGO will say if it is.
    }
  },

  edit: (patch) =>
    set((state) => {
      const draft = { ...state.draft, ...patch };
      const typeChanged =
        (patch.accountType && patch.accountType !== state.draft.accountType) ||
        (patch.businessType !== undefined && patch.businessType !== state.draft.businessType);
      return {
        draft,
        steps:
          patch.accountType && patch.accountType !== state.draft.accountType
            ? applicationSteps(state.mode, draft.accountType)
            : state.steps,
        // Changing track changes the checklist; a new key keeps a retry of the
        // old answers from being mistaken for this one.
        ...(typeChanged ? { idempotencyKey: api.newIdempotencyKey() } : {}),
        showProblem: false,
        notice: null,
      };
    }),

  editPerson: (patch) =>
    set((state) => ({
      draft: { ...state.draft, person: { ...state.draft.person, ...patch } },
      showProblem: false,
      notice: null,
    })),

  next: () => {
    const state = get();
    const step = state.steps[state.index];
    if (!step) return;
    const problem = stepProblem(step.id, state.draft, {
      mode: state.mode,
      checklist: currentChecklist(state),
      emailVerified: state.email.phase === "verified",
      today: manilaToday(),
    });
    if (problem) {
      set({ showProblem: true });
      return;
    }
    if (step.id === "documents" && Object.values(state.uploads).some((upload) => upload?.phase === "sending")) {
      set({ showProblem: true, notice: { message: "Wait for every file to finish uploading.", tone: "info" } });
      return;
    }
    if (state.index >= state.steps.length - 1) return;
    set({ index: state.index + 1, showProblem: false, notice: null });
  },

  back: () => set((state) => ({ index: Math.max(0, state.index - 1), showProblem: false, notice: null })),

  goTo: (step) =>
    set((state) => {
      const index = state.steps.findIndex((entry) => entry.id === step);
      return index >= 0 && index < state.index ? { index, showProblem: false, notice: null } : {};
    }),

  pickDocument: async (key) => {
    const picker = getDocumentPickerNative();
    if (!picker) {
      set((state) => ({ uploads: { ...state.uploads, [key]: { phase: "failed", name: null, error: FILE_PICKER_NEEDS_REBUILD } } }));
      return;
    }
    let result: Awaited<ReturnType<typeof picker.getDocumentAsync>>;
    try {
      result = await picker.getDocumentAsync({ type: DOCUMENT_TYPES, multiple: false, copyToCacheDirectory: true });
    } catch {
      set((state) => ({
        uploads: {
          ...state.uploads,
          [key]: { phase: "failed", name: null, error: "The file picker did not open. Try again, and check GRIDGO has access to your files." },
        },
      }));
      return;
    }
    if (result.canceled) return;
    const picked = result.assets?.[0];
    if (!picked?.uri) {
      set((state) => ({
        uploads: { ...state.uploads, [key]: { phase: "failed", name: null, error: "That file could not be read. Pick it again." } },
      }));
      return;
    }
    const name = normalizeFileName(picked.name);
    if (typeof picked.size === "number" && picked.size > DOCUMENT_MAX_MIB * 1024 * 1024) {
      set((state) => ({
        uploads: {
          ...state.uploads,
          [key]: { phase: "failed", name, error: `This file is over ${DOCUMENT_MAX_MIB} MB. Take a smaller photo or scan, then add it again.` },
        },
      }));
      return;
    }

    const mine = scope;
    handles.get(key)?.cancel();
    const handle = api.uploadFile(
      {
        uri: picked.uri,
        name,
        mimeType: picked.mimeType ?? null,
        file: "file" in picked ? (picked as { file?: Blob }).file : undefined,
      },
      "client_verification_document",
      (progress) => {
        if (mine !== scope || handles.get(key) !== handle) return;
        set((state) => ({ uploads: { ...state.uploads, [key]: { phase: "sending", name, progress } } }));
      },
    );
    handles.set(key, handle);
    set((state) => ({
      uploads: { ...state.uploads, [key]: { phase: "sending", name, progress: 0 } },
      // A replaced file is not the one on the draft any more.
      draft: { ...state.draft, documents: { ...state.draft.documents, [key]: undefined } },
      notice: null,
    }));

    try {
      const file = await handle.done;
      if (mine !== scope || handles.get(key) !== handle) return;
      handles.delete(key);
      set((state) => {
        const uploads = { ...state.uploads };
        delete uploads[key];
        return {
          uploads,
          draft: { ...state.draft, documents: { ...state.draft.documents, [key]: { fileId: file.fileId, name } } },
        };
      });
    } catch (error) {
      if (mine !== scope || handles.get(key) !== handle) return;
      handles.delete(key);
      set((state) => ({ uploads: { ...state.uploads, [key]: { phase: "failed", name, error: uploadError(error) } } }));
    }
  },

  removeDocument: (key) => {
    handles.get(key)?.cancel();
    handles.delete(key);
    set((state) => {
      const uploads = { ...state.uploads };
      delete uploads[key];
      const documents = { ...state.draft.documents };
      delete documents[key];
      return { uploads, draft: { ...state.draft, documents } };
    });
  },

  sendCode: async () => {
    const { email, loginEmail } = get();
    if (email.phase === "sending" || email.phase === "verifying") return;
    const mine = scope;
    set({ email: { ...email, phase: "sending", error: null } });
    try {
      const sent = await api.requestOrganizationEmailCode(loginEmail);
      if (mine !== scope) return;
      set({ email: { phase: "sent", code: "", resendAfter: sent.resendAfter, error: null } });
    } catch (error) {
      if (mine !== scope) return;
      set((state) => ({
        email: {
          ...state.email,
          // A refused resend keeps the code box open for the code already sent.
          phase: state.email.resendAfter ? "sent" : "idle",
          error: emailCodeMessage(errorCode(error)) ?? userFacingError(error, "GRIDGO could not send the code. Try again."),
        },
      }));
    }
  },

  setCode: (code) => set((state) => ({ email: { ...state.email, code, error: null } })),

  verifyCode: async () => {
    const { email } = get();
    if (email.phase !== "sent") return;
    const mine = scope;
    set({ email: { ...email, phase: "verifying", error: null } });
    try {
      await api.verifyOrganizationEmailCode(email.code);
      if (mine !== scope) return;
      set((state) => ({ email: { ...state.email, phase: "verified", error: null }, showProblem: false }));
    } catch (error) {
      if (mine !== scope) return;
      set((state) => ({
        email: {
          ...state.email,
          phase: "sent",
          code: "",
          error: emailCodeMessage(errorCode(error)) ?? userFacingError(error, "GRIDGO could not check the code. Try again."),
        },
      }));
    }
  },

  submit: async () => {
    const state = get();
    if (state.submitting) return false;
    const mine = scope;
    const checklist = currentChecklist(state);
    set({ submitting: true, notice: null });
    try {
      if (state.mode === "handover") {
        const organization = await api.handoverOrganizationOfficer(
          {
            expectedVersion: state.expectedVersion ?? 0,
            officer: applicantPerson(state.draft.person, true),
            documents: documentIds(state.draft, checklist),
          },
          state.idempotencyKey,
        );
        if (mine !== scope) return false;
        useOrganization.getState().adopt(organization);
        void useSession.getState().refresh();
      } else {
        const user = await api.submitClientApplication(
          applicationInput(state.draft, {
            checklist,
            loginEmail: state.loginEmail,
            expectedVersion: state.expectedVersion,
          }),
          state.idempotencyKey,
        );
        if (mine !== scope) return false;
        // A pending case, not a converted account: Account shows pending.
        useSession.getState().setUser(user);
        void useOrganization.getState().load();
      }
      set({ submitting: false });
      return true;
    } catch (error) {
      if (mine !== scope) return false;
      const code = errorCode(error);
      const step = refusalStep(code, errorFields(error));
      const index = step ? state.steps.findIndex((entry) => entry.id === step) : -1;
      set((current) => ({
        submitting: false,
        notice: {
          tone: "error",
          message:
            refusalMessage(code) ??
            userFacingError(error, "GRIDGO could not send this. Check your connection and try again."),
        },
        // A spent email code cannot be used again; the next send starts fresh.
        ...(code === "organization_email_verification_required" ? { email: EMPTY_EMAIL } : {}),
        ...(index >= 0 ? { index, showProblem: true } : {}),
        // Whatever the refusal, the same body is not going to be accepted.
        idempotencyKey: code ? api.newIdempotencyKey() : current.idempotencyKey,
      }));
      return false;
    }
  },

  reset: () => {
    cancelUploads();
    scope++;
    set({ ...EMPTY });
  },
}));
