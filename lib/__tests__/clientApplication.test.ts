import {
  applicationInput,
  applicationSteps,
  checklistFor,
  emptyApplicationDraft,
  EMPTY_PERSON,
  formatDateTyping,
  isCalendarDate,
  manilaToday,
  personProblems,
  refusalMessage,
  refusalStep,
  stepProblem,
  type ApplicationDraft,
  type PersonDraft,
} from "@/lib/clientApplication";

const TODAY = "2026-10-05";

const PERSON: PersonDraft = {
  ...EMPTY_PERSON,
  fullName: "Ana Marie Reyes",
  dateOfBirth: "2004-03-15",
  address: "Purok 3, Bajada, Davao City",
  phone: "0917 123 4567",
  governmentIdType: "passport",
  governmentIdExpiresOn: "2030-01-01",
  studentIdExpiresOn: "2027-05-31",
  originalId: true,
  detailsMatchId: true,
};

function organizationDraft(): ApplicationDraft {
  return {
    ...emptyApplicationDraft(),
    accountType: "organization",
    businessName: "Grade 10 PTA",
    businessNature: "Parents' association",
    school: "Davao City National High School",
    person: PERSON,
    documents: {
      government_id: { fileId: "file_gov", name: "id.jpg" },
      student_id: { fileId: "file_stu", name: "student.jpg" },
      enrollment_document: { fileId: "file_enr", name: "cor.pdf" },
    },
  };
}

describe("each track's checklist", () => {
  const required = (track: Parameters<typeof checklistFor>[0], options = {}) =>
    checklistFor(track, options)
      .filter((item) => item.required)
      .map((item) => item.key);
  const optional = (track: Parameters<typeof checklistFor>[0], options = {}) =>
    checklistFor(track, options)
      .filter((item) => !item.required)
      .map((item) => item.key);

  it("asks an organization for the officer's ID, student ID and enrolment, with recognition optional", () => {
    expect(required("organization")).toEqual(["government_id", "student_id", "enrollment_document"]);
    expect(optional("organization")).toEqual(["school_recognition_certificate"]);
  });

  it("asks a sole proprietor for the base three and the DTI certificate", () => {
    expect(required("sole_proprietor")).toEqual([
      "government_id",
      "payout_bank_proof",
      "bir_2303",
      "dti_certificate",
    ]);
    expect(optional("sole_proprietor")).toEqual(["business_permit"]);
  });

  it("asks partnerships and corporations for the SEC set and the signatory's authority", () => {
    for (const track of ["partnership", "corporation"] as const) {
      expect(required(track)).toEqual([
        "government_id",
        "payout_bank_proof",
        "bir_2303",
        "sec_certificate",
        "articles_and_bylaws",
        "general_information_sheet",
        "signatory_authorization",
      ]);
    }
  });

  it("makes the business permit required once Operations asks for it", () => {
    expect(required("sole_proprietor", { businessPermitRequired: true })).toContain("business_permit");
    expect(optional("sole_proprietor", { businessPermitRequired: true })).toEqual([]);
  });

  it("will not leave the documents step with a required file missing", () => {
    const draft = organizationDraft();
    delete draft.documents.student_id;
    const options = { mode: "apply" as const, checklist: checklistFor("organization"), emailVerified: false, today: TODAY };
    expect(stepProblem("documents", draft, options)).toBe("One document is still missing.");
    expect(stepProblem("documents", organizationDraft(), options)).toBeNull();
  });
});

describe("the steps", () => {
  it("verifies the organization email straight before Review", () => {
    expect(applicationSteps("apply", "organization").map((step) => step.id)).toEqual([
      "account",
      "person",
      "documents",
      "email",
      "review",
    ]);
  });

  it("asks a business no email code", () => {
    expect(applicationSteps("apply", "business").map((step) => step.id)).toEqual([
      "account",
      "person",
      "documents",
      "review",
    ]);
  });

  it("starts a handover at the new officer, since the organization cannot change", () => {
    expect(applicationSteps("handover", "organization").map((step) => step.id)).toEqual([
      "person",
      "documents",
      "email",
      "review",
    ]);
  });

  it("holds the email step until the code is verified", () => {
    const options = { mode: "apply" as const, checklist: [], today: TODAY };
    expect(stepProblem("email", organizationDraft(), { ...options, emailVerified: false })).toContain("Verify");
    expect(stepProblem("email", organizationDraft(), { ...options, emailVerified: true })).toBeNull();
  });
});

describe("the officer's details", () => {
  it("accepts details that match an unexpired ID", () => {
    expect(personProblems(PERSON, { organization: true, today: TODAY })).toEqual({});
  });

  it("refuses an expired ID or student ID, in words", () => {
    const problems = personProblems(
      { ...PERSON, governmentIdExpiresOn: "2026-10-04", studentIdExpiresOn: "2025-05-31" },
      { organization: true, today: TODAY },
    );
    expect(problems.governmentIdExpiresOn).toContain("expired");
    expect(problems.studentIdExpiresOn).toContain("expired");
  });

  it("lets a PhilID say it has no expiry, but not a passport", () => {
    const philid = { ...PERSON, governmentIdType: "philid" as const, governmentIdExpiresOn: "", governmentIdHasNoExpiry: true };
    expect(personProblems(philid, { organization: true, today: TODAY }).governmentIdExpiresOn).toBeUndefined();
    const passport = { ...philid, governmentIdType: "passport" as const };
    expect(personProblems(passport, { organization: true, today: TODAY }).governmentIdExpiresOn).toBeDefined();
  });

  it("needs both confirmations ticked", () => {
    expect(personProblems({ ...PERSON, detailsMatchId: false }, { organization: true, today: TODAY }).confirm).toBeDefined();
  });

  it("does not ask a business signatory for a student ID", () => {
    expect(personProblems({ ...PERSON, studentIdExpiresOn: "" }, { organization: false, today: TODAY })).toEqual({});
  });

  it("types a date with the dashes put in", () => {
    expect(formatDateTyping("2004")).toBe("2004");
    expect(formatDateTyping("200403")).toBe("2004-03");
    expect(formatDateTyping("20040315")).toBe("2004-03-15");
    expect(formatDateTyping("2004-03-15x9")).toBe("2004-03-15");
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it("checks expiry against Manila's day, not the phone's UTC", () => {
    expect(manilaToday(new Date("2026-10-04T17:00:00Z"))).toBe("2026-10-05");
  });
});

describe("the body GRIDGO takes", () => {
  it("sends an organization with its shared login email, officer and documents", () => {
    const draft = organizationDraft();
    draft.documents.school_recognition_certificate = { fileId: "file_rec", name: "rec.pdf" };
    const body = applicationInput(draft, {
      checklist: checklistFor("organization"),
      loginEmail: "PTA@School.edu.ph",
      expectedVersion: null,
    });
    expect(body).toEqual({
      accountType: "organization",
      businessName: "Grade 10 PTA",
      businessNature: "Parents' association",
      school: "Davao City National High School",
      organizationEmail: "pta@school.edu.ph",
      officer: {
        fullName: "Ana Marie Reyes",
        dateOfBirth: "2004-03-15",
        address: "Purok 3, Bajada, Davao City",
        phone: "0917 123 4567",
        governmentIdType: "passport",
        governmentIdExpiresOn: "2030-01-01",
        originalId: true,
        detailsMatchId: true,
        studentIdExpiresOn: "2027-05-31",
      },
      documents: {
        government_id: "file_gov",
        student_id: "file_stu",
        enrollment_document: "file_enr",
        school_recognition_certificate: "file_rec",
      },
    });
  });

  it("sends a business with its registration type and signatory, and the case version when correcting", () => {
    const draft: ApplicationDraft = {
      ...organizationDraft(),
      accountType: "business",
      businessType: "sole_proprietor",
      businessName: "Bautista Trading",
      documents: {
        government_id: { fileId: "f1", name: "a" },
        payout_bank_proof: { fileId: "f2", name: "b" },
        bir_2303: { fileId: "f3", name: "c" },
        dti_certificate: { fileId: "f4", name: "d" },
        // Left from an organization draft: not on this checklist, never sent.
        student_id: { fileId: "f5", name: "e" },
      },
    };
    const body = applicationInput(draft, {
      checklist: checklistFor("sole_proprietor"),
      loginEmail: "ana@bautista.ph",
      expectedVersion: 4,
    });
    expect(body).toMatchObject({
      accountType: "business",
      businessType: "sole_proprietor",
      expectedVersion: 4,
      documents: { government_id: "f1", payout_bank_proof: "f2", bir_2303: "f3", dti_certificate: "f4" },
    });
    expect(body).not.toHaveProperty("school");
    expect(body).not.toHaveProperty("organizationEmail");
    expect(JSON.stringify(body)).not.toContain("studentIdExpiresOn");
    expect(JSON.stringify(body)).not.toContain("f5");
  });
});

describe("refusals", () => {
  it("sends a duplicate organization back to the name, and a spent code back to the email", () => {
    expect(refusalStep("organization_already_exists")).toBe("account");
    expect(refusalStep("organization_email_verification_required")).toBe("email");
    expect(refusalStep("invalid_application", ["documents.student_id"])).toBe("documents");
    expect(refusalStep("invalid_application", ["officer.dateOfBirth"])).toBe("person");
    expect(refusalMessage("organization_already_exists")).toContain("already on GRIDGO");
  });
});
