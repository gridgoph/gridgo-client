import { ApiError, type LegalVersion } from "@/lib/api";
import {
  artworkRightsBody,
  changeNote,
  EMPTY_SIGNUP_CONSENT,
  enrollmentConsentBody,
  gateHeading,
  isLegalRefusal,
  isLegalUnsupported,
  isLegalVersionChanged,
  joinTitles,
  legalStatusLook,
  libraryOrder,
  noticeBody,
  noticeHeading,
  openRequestOf,
  privacyRequestLine,
  privacyStatusLook,
  signupConsentProblem,
  signupDocuments,
  unseenNotices,
  versionLine,
} from "@/lib/legal";

function doc(documentId: string, overrides: Partial<LegalVersion> = {}): LegalVersion {
  return {
    id: `${documentId}-1`,
    documentId,
    version: 1,
    title: documentId,
    audience: "all",
    text: "Placeholder",
    effectiveAt: "2026-01-01T00:00:00.000Z",
    placeholder: true,
    material: false,
    status: "placeholder",
    changeSummary: "Launch placeholder",
    ...overrides,
  };
}

const context = { app: "gridgo-client/1.0.0", device: "client-abc" };

describe("sign-up consent", () => {
  it("asks for the age answer, then the guardian, then the agreement — in that order", () => {
    expect(signupConsentProblem(EMPTY_SIGNUP_CONSENT)).toMatch(/18 or older/);
    expect(signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: false, agreed: true })).toMatch(
      /guardian/,
    );
    expect(signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: true })).toMatch(/Tick the box/);
    expect(signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: true, agreed: true })).toBeNull();
  });

  it("never needs the news box", () => {
    expect(
      signupConsentProblem({ agreed: true, adult: true, guardian: false, marketing: false }),
    ).toBeNull();
  });

  it("builds the v1 enrollment body with the exact versions shown", () => {
    expect(
      enrollmentConsentBody(
        ["terms-of-service-3", "privacy-notice-2"],
        { agreed: true, adult: true, guardian: false, marketing: true },
        context,
      ),
    ).toEqual({
      accepted: true,
      versionIds: ["terms-of-service-3", "privacy-notice-2"],
      method: "checkbox",
      junior: false,
      marketing: true,
      ...context,
    });
  });

  it("sends the guardian's affirmation only for a junior", () => {
    const junior = enrollmentConsentBody(
      ["t"],
      { agreed: true, adult: false, guardian: true, marketing: false },
      context,
    );
    expect(junior).toMatchObject({ junior: true, guardian: true, marketing: false });
  });

  it("finds Terms and Privacy, or nothing while either is missing", () => {
    const terms = doc("terms-of-service");
    const privacy = doc("privacy-notice");
    expect(signupDocuments([doc("cookie-notice"), privacy, terms])).toEqual([terms, privacy]);
    expect(signupDocuments([terms])).toBeNull();
  });
});

describe("artwork rights", () => {
  it("names one Acceptable Use version, by checkbox", () => {
    expect(artworkRightsBody("acceptable-use-2", context)).toEqual({
      accepted: true,
      versionIds: ["acceptable-use-2"],
      method: "checkbox",
      ...context,
    });
  });
});

describe("how a document is worded", () => {
  it("says a placeholder in words, and a live version as in effect", () => {
    expect(legalStatusLook(doc("x")).label).toBe("Placeholder");
    expect(legalStatusLook(doc("x", { placeholder: false, status: "live" })).label).toBe(
      "In effect",
    );
  });

  it("shows a change note only for a later version", () => {
    expect(changeNote(doc("x"))).toBeNull();
    expect(changeNote(doc("x", { version: 2, changeSummary: "Clearer refunds" }))).toBe(
      "Clearer refunds",
    );
  });

  it("dates a version in Davao time", () => {
    expect(versionLine(doc("x", { version: 2, effectiveAt: "2026-10-08T17:00:00.000Z" }))).toBe(
      "Version 2, in effect from 9 Oct 2026",
    );
  });

  it("puts the agreements first in the library", () => {
    const ordered = libraryOrder([
      doc("cookie-notice"),
      doc("privacy-notice"),
      doc("zz-new"),
      doc("terms-of-service"),
    ]).map((d) => d.documentId);
    expect(ordered).toEqual(["terms-of-service", "privacy-notice", "cookie-notice", "zz-new"]);
  });

  it("joins titles the way a sentence would", () => {
    expect(joinTitles([{ title: "A" }, { title: "B" }, { title: "C" }])).toBe("A, B and C");
  });
});

describe("the blocking screen and notices", () => {
  it("calls a later version a change", () => {
    expect(gateHeading([{ version: 1 }])).toBe("Agree to GRIDGO's terms");
    expect(gateHeading([{ version: 1 }, { version: 2 }])).toBe("GRIDGO's terms have changed");
  });

  it("shows each notice once per phone", () => {
    const a = doc("cookie-notice");
    const b = doc("age-policy");
    expect(unseenNotices([a, b], [a.id])).toEqual([b]);
  });

  it("words one notice or several", () => {
    expect(noticeHeading([{ title: "Cookie Notice", version: 2 }])).toBe(
      "GRIDGO updated its Cookie Notice",
    );
    expect(noticeHeading([{ title: "A", version: 1 }, { title: "B", version: 1 }])).toBe(
      "2 GRIDGO policies to read",
    );
    expect(noticeBody([{ title: "A" }, { title: "B" }])).toMatch(/^A and B\. Nothing to agree to\. They stay/);
    expect(noticeBody([{ title: "A" }])).toBe(
      "Nothing to agree to. It stays in Account, under Legal & Privacy.",
    );
  });
});

describe("refusals", () => {
  it("recognises GRIDGO's legal refusals and a missing library", () => {
    expect(isLegalRefusal(new ApiError(400, { error: "legal_consent_required" }))).toBe(true);
    expect(isLegalVersionChanged(new ApiError(409, { error: "legal_version_changed" }))).toBe(true);
    expect(isLegalRefusal(new ApiError(400, { error: "invalid_account_type" }))).toBe(false);
    expect(isLegalUnsupported(new ApiError(404, { error: "not_found" }))).toBe(true);
  });
});

describe("privacy requests", () => {
  const base = {
    id: "prq_1",
    kind: "access",
    requestedAt: "2026-10-09T02:00:00.000Z",
    dueAt: "2026-10-24T02:00:00.000Z",
    updatedAt: "2026-10-12T02:00:00.000Z",
  };

  it("says an open request's due date, and a closed one's close", () => {
    expect(privacyRequestLine({ ...base, status: "pending" })).toBe(
      "Sent 9 Oct 2026, answer due by 24 Oct 2026",
    );
    expect(privacyRequestLine({ ...base, status: "completed" })).toBe(
      "Sent 9 Oct 2026, closed 12 Oct 2026",
    );
  });

  it("never draws an unknown status as done", () => {
    expect(privacyStatusLook("archived").label).toBe("Received");
    expect(privacyStatusLook("completed").label).toBe("Done");
  });

  it("finds an open request of the same kind", () => {
    expect(openRequestOf([{ ...base, status: "in_progress" }], "access")?.id).toBe("prq_1");
    expect(openRequestOf([{ ...base, status: "completed" }], "access")).toBeNull();
  });
});
