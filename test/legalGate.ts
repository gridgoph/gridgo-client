import type { LegalVersion } from "@/lib/api";
import { useLegalConsent } from "@/store/legalConsent";
import { useArtworkRights } from "@/store/artworkRights";
import { useLegalLibrary } from "@/store/legalLibrary";

/**
 * Answer the legal gate for a screen test: nothing waiting for this account.
 *
 * The root hook that reads `GET /me/legal/pending` is not mounted in a screen
 * test, and until it answers the landing ladder draws nothing — so a test
 * about landing Home says the answer up front.
 */
export function clearLegalGate(userId = "u-client"): void {
  useLegalConsent.setState({
    userId,
    status: "clear",
    pending: [],
    notices: [],
    accepting: false,
    error: null,
  });
}

const placeholder = (documentId: string, title: string): LegalVersion => ({
  id: `${documentId}-1`,
  documentId,
  version: 1,
  title,
  audience: "all",
  text: `Placeholder — ${title}.`,
  effectiveAt: "2026-01-01T00:00:00.000Z",
  placeholder: true,
  material: false,
  status: "placeholder",
  changeSummary: "Launch placeholder",
});

export const TEST_LEGAL_LIBRARY: LegalVersion[] = [
  placeholder("terms-of-service", "Terms of Service"),
  placeholder("privacy-notice", "Privacy Notice"),
  placeholder("acceptable-use", "Acceptable Use and Artwork Rights"),
];

/** The public library, already read, so sign-up and the artwork box can name versions. */
export function holdLegalLibrary(): void {
  useLegalLibrary.setState({ documents: TEST_LEGAL_LIBRARY, status: "ready", readAt: Date.now() });
}

/** The client ticked the per-order artwork box for this basket or order scope. */
export function agreeArtworkRights(scope: string): void {
  holdLegalLibrary();
  useArtworkRights.setState({ agreed: { ...useArtworkRights.getState().agreed, [scope]: true } });
}
