import { ApiError, type ClientOrganization, type User } from "@/lib/api";
import { EMPTY_PERSON } from "@/lib/clientApplication";
import { currentChecklist, useClientApplication } from "@/store/clientApplication";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getApplicationChecklist: jest.fn(),
    getClientApplication: jest.fn(),
    requestOrganizationEmailCode: jest.fn(),
    verifyOrganizationEmailCode: jest.fn(),
    submitClientApplication: jest.fn(),
    handoverOrganizationOfficer: jest.fn(),
    getOrganization: jest.fn(async () => null),
    getAccount: jest.fn(),
    uploadFile: jest.fn(),
  };
});

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picker = require("expo-document-picker");

const USER: User = {
  id: "u1",
  email: "pta@school.edu.ph",
  name: "Ana Reyes",
  role: "client",
  phone: "+639171234567",
  accountType: "individual",
  version: 2,
};

const ORGANIZATION: ClientOrganization = {
  userId: "u1",
  name: "Grade 10 PTA",
  school: "Davao City National High School",
  email: "pta@school.edu.ph",
  currentOfficer: { id: "officer_1", fullName: "Ana Reyes", verifiedAt: "2026-07-01T00:00:00Z" },
  confirmedAt: null,
  nextConfirmationAt: null,
  confirmationRequestedAt: null,
  approvalCase: { id: "apc_1", status: "approved", version: 7 },
  actions: [],
};

const PERSON = {
  ...EMPTY_PERSON,
  fullName: "Ben Cruz",
  dateOfBirth: "2005-01-02",
  address: "Bajada, Davao City",
  phone: "0917 765 4321",
  governmentIdType: "philid" as const,
  governmentIdHasNoExpiry: true,
  studentIdExpiresOn: "2030-05-31",
  originalId: true,
  detailsMatchId: true,
};

const store = () => useClientApplication.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: USER, source: "clerk", loading: false, error: null, signingOut: false });
  useOrganization.getState().reset();
  store().reset();
});

describe("an organization application", () => {
  it("does not leave a step with its answers missing", () => {
    store().start({ mode: "apply", user: USER });
    store().edit({ accountType: "organization", businessName: "Grade 10 PTA" });
    store().next();
    expect(store().index).toBe(0);
    expect(store().showProblem).toBe(true);
  });

  it("uploads each document as verification evidence and keeps only GRIDGO's file id", async () => {
    store().start({ mode: "apply", user: USER });
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///id.jpg", name: "id.jpg", mimeType: "image/jpeg", size: 1000 }],
    });
    api.uploadFile.mockReturnValue({ done: Promise.resolve({ fileId: "file_gov" }), cancel: jest.fn() });

    await store().pickDocument("government_id");

    expect(api.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///id.jpg" }),
      "client_verification_document",
      expect.any(Function),
    );
    expect(store().draft.documents.government_id).toEqual({ fileId: "file_gov", name: "id.jpg" });
    expect(store().uploads.government_id).toBeUndefined();
  });

  it("refuses a file over 20 MB before sending a byte", async () => {
    store().start({ mode: "apply", user: USER });
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///big.pdf", name: "big.pdf", mimeType: "application/pdf", size: 21 * 1024 * 1024 }],
    });
    await store().pickDocument("enrollment_document");
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(store().uploads.enrollment_document).toMatchObject({ phase: "failed" });
  });

  it("sends the code to the sign-in email and verifies it", async () => {
    store().start({ mode: "apply", user: USER });
    api.requestOrganizationEmailCode.mockResolvedValue({ expiresAt: "x", resendAfter: "y" });
    api.verifyOrganizationEmailCode.mockResolvedValue({ verified: true, expiresAt: "x" });

    await store().sendCode();
    expect(api.requestOrganizationEmailCode).toHaveBeenCalledWith("pta@school.edu.ph");
    expect(store().email.phase).toBe("sent");

    store().setCode("123456");
    await store().verifyCode();
    expect(api.verifyOrganizationEmailCode).toHaveBeenCalledWith("123456");
    expect(store().email.phase).toBe("verified");
  });

  it("says a wrong code plainly and clears it for the next try", async () => {
    store().start({ mode: "apply", user: USER });
    api.requestOrganizationEmailCode.mockResolvedValue({ expiresAt: "x", resendAfter: "y" });
    api.verifyOrganizationEmailCode.mockRejectedValue(new ApiError(400, { error: "organization_code_invalid_or_expired" }));
    await store().sendCode();
    store().setCode("000000");
    await store().verifyCode();
    expect(store().email).toMatchObject({ phase: "sent", code: "" });
    expect(store().email.error).toContain("wrong or has expired");
  });

  it("lands on the account GRIDGO returns, still waiting for Operations", async () => {
    store().start({ mode: "apply", user: USER });
    const pending = { ...USER, approvalCase: { id: "apc_1", kind: "business_client" as const, status: "pending" as const, version: 1 } };
    api.submitClientApplication.mockResolvedValue(pending);
    useClientApplication.setState({
      draft: {
        ...store().draft,
        accountType: "organization",
        businessName: "Grade 10 PTA",
        businessNature: "PTA",
        school: "DCNHS",
        person: PERSON,
        documents: {
          government_id: { fileId: "f1", name: "a" },
          student_id: { fileId: "f2", name: "b" },
          enrollment_document: { fileId: "f3", name: "c" },
        },
      },
    });

    expect(await store().submit()).toBe(true);
    const [body, key] = api.submitClientApplication.mock.calls[0];
    expect(body).toMatchObject({
      accountType: "organization",
      organizationEmail: "pta@school.edu.ph",
      documents: { government_id: "f1", student_id: "f2", enrollment_document: "f3" },
    });
    expect(body).not.toHaveProperty("expectedVersion");
    expect(typeof key).toBe("string");
    expect(useSession.getState().user?.approvalCase?.status).toBe("pending");
  });

  it("sends a duplicate organization back to its name with the reason", async () => {
    store().start({ mode: "apply", user: USER });
    useClientApplication.setState({ index: 4 });
    api.submitClientApplication.mockRejectedValue(new ApiError(409, { error: "organization_already_exists" }));
    expect(await store().submit()).toBe(false);
    expect(store().steps[store().index]?.id).toBe("account");
    expect(store().notice?.message).toContain("already on GRIDGO");
  });

  it("quotes the case version when correcting an application that was turned down", () => {
    const rejected = { ...USER, approvalCase: { id: "apc_1", kind: "business_client" as const, status: "rejected" as const, version: 5 } };
    store().start({ mode: "apply", user: rejected });
    expect(store().expectedVersion).toBe(5);
  });

  it("asks a business permit only once Operations has asked for it", async () => {
    store().start({ mode: "apply", user: USER });
    store().edit({ accountType: "business", businessType: "sole_proprietor" });
    expect(currentChecklist(store()).find((item) => item.key === "business_permit")?.required).toBe(false);
    api.getApplicationChecklist.mockResolvedValue({ businessPermitRequired: true });
    await store().loadChecklist();
    expect(currentChecklist(store()).find((item) => item.key === "business_permit")?.required).toBe(true);
  });
});

describe("an officer handover", () => {
  it("starts with nothing of the current officer, and sends only the new officer and documents", async () => {
    const orgUser = { ...USER, accountType: "organization" as const };
    useSession.setState({ user: orgUser });
    store().start({ mode: "handover", user: orgUser, organization: ORGANIZATION });
    expect(store().draft.person.fullName).toBe("");
    expect(store().steps.map((step) => step.id)).toEqual(["person", "documents", "email", "review"]);

    const after = { ...ORGANIZATION, approvalCase: { id: "apc_1", status: "pending" as const, version: 8 } };
    api.handoverOrganizationOfficer.mockResolvedValue(after);
    api.getAccount.mockResolvedValue(orgUser);
    useClientApplication.setState({
      draft: {
        ...store().draft,
        person: PERSON,
        documents: {
          government_id: { fileId: "n1", name: "a" },
          student_id: { fileId: "n2", name: "b" },
          enrollment_document: { fileId: "n3", name: "c" },
        },
      },
    });

    expect(await store().submit()).toBe(true);
    const [body] = api.handoverOrganizationOfficer.mock.calls[0];
    expect(body).toEqual({
      expectedVersion: 7,
      officer: expect.objectContaining({ fullName: "Ben Cruz", governmentIdHasNoExpiry: true }),
      documents: { government_id: "n1", student_id: "n2", enrollment_document: "n3" },
    });
    expect(useOrganization.getState().organization?.approvalCase?.status).toBe("pending");
  });

  it("refuses reused officer documents and points at the documents step", async () => {
    store().start({ mode: "handover", user: USER, organization: ORGANIZATION });
    useClientApplication.setState({ index: 3 });
    api.handoverOrganizationOfficer.mockRejectedValue(new ApiError(409, { error: "new_officer_documents_required" }));
    await store().submit();
    expect(store().steps[store().index]?.id).toBe("documents");
    expect(store().notice?.message).toContain("new officer's own documents");
  });
});

/* A sent-back application comes back filled in (gridgo-client#187). */

const SENT_BACK_USER: User = {
  ...USER,
  approvalCase: { id: "apc_1", kind: "business_client", status: "rejected", version: 5, rejectionReason: "x" },
};

const SENT_BACK_VIEW = {
  approvalCase: { id: "apc_1", status: "rejected", version: 6, applicationRevision: 1 },
  application: {
    accountType: "organization",
    businessName: "Grade 10 PTA",
    businessNature: "Parents' association",
    school: "Davao City National High School",
    organizationEmail: "pta@school.edu.ph",
    facultyAdviserContact: "Ms. Cruz",
    handover: false,
    officer: {
      fullName: "Ana Reyes",
      dateOfBirth: "2004-03-15",
      address: "Bajada, Davao City",
      phone: "0917 123 4567",
      governmentIdType: "passport",
      governmentIdExpiresOn: "2031-01-01",
      studentIdExpiresOn: "2030-05-31",
    },
    documents: {
      government_id: { fileId: "file_gov", name: "passport.jpg" },
      student_id: { fileId: "file_student", name: "student-id.jpg" },
      enrollment_document: { fileId: "file_enrol", name: "cor.pdf" },
      school_recognition_certificate: { fileId: "file_recog", name: "recognition.jpg" },
    },
  },
  sentBack: {
    reason: "Please upload these again:\n- School recognition certificate: Does not look right",
    documents: [
      { key: "school_recognition_certificate", label: "School recognition certificate", note: "Does not look right" },
    ],
  },
};

describe("a sent-back application", () => {
  it("reads back everything sent, keeps the files, and opens on the document asked for again", async () => {
    api.getClientApplication.mockResolvedValue(SENT_BACK_VIEW);
    store().start({ mode: "apply", user: SENT_BACK_USER });
    expect(store().prefill).toBe("loading");

    await store().loadPrevious();

    const { draft } = store();
    expect(store().prefill).toBe("idle");
    expect(draft).toMatchObject({
      accountType: "organization",
      businessName: "Grade 10 PTA",
      businessNature: "Parents' association",
      school: "Davao City National High School",
      facultyAdviserContact: "Ms. Cruz",
      person: {
        fullName: "Ana Reyes",
        dateOfBirth: "2004-03-15",
        governmentIdType: "passport",
        governmentIdExpiresOn: "2031-01-01",
        studentIdExpiresOn: "2030-05-31",
        originalId: true,
        detailsMatchId: true,
      },
    });
    expect(draft.documents.government_id).toEqual({ fileId: "file_gov", name: "passport.jpg", kept: true });
    // The one asked for again waits for a replacement.
    expect(draft.documents.school_recognition_certificate).toBeUndefined();
    expect(store().sentBack?.documents.school_recognition_certificate).toEqual({
      note: "Does not look right",
      previousName: "recognition.jpg",
    });
    expect(store().steps[store().index]?.id).toBe("documents");
    expect(store().expectedVersion).toBe(6);

    // Continue is held until the flagged document is uploaded again, optional or not.
    store().next();
    expect(store().steps[store().index]?.id).toBe("documents");
    expect(store().showProblem).toBe(true);
  });

  it("resends the kept files with only the flagged one replaced", async () => {
    api.getClientApplication.mockResolvedValue(SENT_BACK_VIEW);
    store().start({ mode: "apply", user: SENT_BACK_USER });
    await store().loadPrevious();
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///new.jpg", name: "recognition-new.jpg", mimeType: "image/jpeg", size: 1000 }],
    });
    api.uploadFile.mockReturnValue({ done: Promise.resolve({ fileId: "file_recog_2" }), cancel: jest.fn() });
    await store().pickDocument("school_recognition_certificate");

    store().next();
    expect(store().steps[store().index]?.id).toBe("email");
    api.submitClientApplication.mockResolvedValue({ ...USER, approvalCase: { ...SENT_BACK_USER.approvalCase, status: "pending" } });
    expect(await store().submit()).toBe(true);

    const [body] = api.submitClientApplication.mock.calls[0];
    expect(body).toMatchObject({
      accountType: "organization",
      businessName: "Grade 10 PTA",
      school: "Davao City National High School",
      facultyAdviserContact: "Ms. Cruz",
      officer: { fullName: "Ana Reyes", governmentIdExpiresOn: "2031-01-01", studentIdExpiresOn: "2030-05-31" },
      documents: {
        government_id: "file_gov",
        student_id: "file_student",
        enrollment_document: "file_enrol",
        school_recognition_certificate: "file_recog_2",
      },
      expectedVersion: 6,
    });
  });

  it("keeps a sent file when its replacement fails to upload", async () => {
    api.getClientApplication.mockResolvedValue(SENT_BACK_VIEW);
    store().start({ mode: "apply", user: SENT_BACK_USER });
    await store().loadPrevious();
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///x.jpg", name: "x.jpg", mimeType: "image/jpeg", size: 1000 }],
    });
    api.uploadFile.mockReturnValue({ done: Promise.reject(new Error("offline")), cancel: jest.fn() });
    await store().pickDocument("government_id");
    expect(store().draft.documents.government_id).toEqual({ fileId: "file_gov", name: "passport.jpg", kept: true });
    expect(store().uploads.government_id).toMatchObject({ phase: "failed" });
  });

  it("opens empty, as before, on an API without the read-back", async () => {
    api.getClientApplication.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    store().start({ mode: "apply", user: SENT_BACK_USER });
    await store().loadPrevious();
    expect(store().prefill).toBe("idle");
    expect(store().draft.businessName).toBe("");
    expect(store().index).toBe(0);
  });

  it("says a failed read-back failed, and can be retried", async () => {
    api.getClientApplication.mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }));
    store().start({ mode: "apply", user: SENT_BACK_USER });
    await store().loadPrevious();
    expect(store().prefill).toBe("failed");

    api.getClientApplication.mockResolvedValueOnce(SENT_BACK_VIEW);
    useClientApplication.setState({ prefill: "loading" });
    await store().loadPrevious();
    expect(store().draft.businessName).toBe("Grade 10 PTA");
  });

  it("reads nothing back for a first application", async () => {
    store().start({ mode: "apply", user: USER });
    expect(store().prefill).toBe("idle");
    await store().loadPrevious();
    expect(api.getClientApplication).not.toHaveBeenCalled();
  });

  it("never fills a handover with the earlier officer's answers", async () => {
    const orgUser = { ...USER, accountType: "organization" as const };
    api.getClientApplication.mockResolvedValue(SENT_BACK_VIEW);
    store().start({
      mode: "handover",
      user: orgUser,
      organization: { ...ORGANIZATION, approvalCase: { id: "apc_1", status: "rejected", version: 8 } },
    });
    await store().loadPrevious();
    expect(store().draft.person.fullName).toBe("");
    expect(store().draft.documents).toEqual({});
  });
});
