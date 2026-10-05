/**
 * Organization and business applications (gridgo-client#163) and the officer
 * handover that reuses them (#164).
 *
 * Pure: what each track must submit, how the answers are checked before
 * anything is sent, and the exact body gridgo-api takes. The screen and
 * `store/clientApplication.ts` only decide what to draw and when to send.
 *
 * Contract: gridgo-api `docs/ORGANIZATION_ACCOUNTS_API.md`. Every document
 * listed is required for the pilot except the ones marked optional here,
 * which is the 5 Oct decision recorded on #163.
 */

import type {
  ApplicantPerson,
  BusinessType,
  ClientApplicationInput,
  GovernmentIdType,
} from "@/lib/api";
import { mobileNumberProblem } from "@/lib/accountProfile";

/** Which flow is running. */
export type ApplicationMode =
  /** A first application, or correcting one that is pending or was turned down. */
  | "apply"
  /** An approved organization that has no verified officer yet. */
  | "first_officer"
  /** A new officer taking over a verified organization. */
  | "handover";

export type ApplicationTrack = "organization" | BusinessType;

/* --------------------------------------------------------------------------
   The checklists
   -------------------------------------------------------------------------- */

export type DocumentKey =
  | "government_id"
  | "student_id"
  | "enrollment_document"
  | "school_recognition_certificate"
  | "payout_bank_proof"
  | "bir_2303"
  | "dti_certificate"
  | "sec_certificate"
  | "articles_and_bylaws"
  | "general_information_sheet"
  | "signatory_authorization"
  | "business_permit";

export type DocumentInfo = { label: string; hint: string };

/** What each document is, in the words on the paper a client is holding. */
export const DOCUMENTS: Record<DocumentKey, DocumentInfo> = {
  government_id: {
    label: "Primary government ID",
    hint: "PhilID or ePhilID, passport, driver's licence or UMID. A photo or scan of the original, not expired.",
  },
  student_id: {
    label: "Student ID",
    hint: "Valid for this school year, in the officer's name.",
  },
  enrollment_document: {
    label: "Proof of enrolment",
    hint: "A certificate of registration or enrolment for this term.",
  },
  school_recognition_certificate: {
    label: "School recognition certificate",
    hint: "The school's recognition of your organization, if you have it.",
  },
  payout_bank_proof: {
    label: "Proof of bank account",
    hint: "A bank certificate or statement header showing the account in the registered business name.",
  },
  bir_2303: {
    label: "BIR Certificate of Registration",
    hint: "Form 2303.",
  },
  dti_certificate: {
    label: "DTI business name certificate",
    hint: "The certificate of your registered business name.",
  },
  sec_certificate: {
    label: "SEC certificate of registration",
    hint: "For the partnership or corporation.",
  },
  articles_and_bylaws: {
    label: "Articles and by-laws",
    hint: "Articles of partnership or incorporation, with the by-laws.",
  },
  general_information_sheet: {
    label: "General Information Sheet",
    hint: "The latest one filed with the SEC.",
  },
  signatory_authorization: {
    label: "Board resolution or secretary's certificate",
    hint: "Notarised, naming the person signing for the business.",
  },
  business_permit: {
    label: "Mayor's or Barangay business permit",
    hint: "Only if Operations asks for it.",
  },
};

const BUSINESS_BASE: DocumentKey[] = ["government_id", "payout_bank_proof", "bir_2303"];

/** The required documents per track, mirroring gridgo-api's `APPLICATION_DOCUMENTS`. */
export const REQUIRED_DOCUMENTS: Record<ApplicationTrack, DocumentKey[]> = {
  organization: ["government_id", "student_id", "enrollment_document"],
  sole_proprietor: [...BUSINESS_BASE, "dti_certificate"],
  partnership: [
    ...BUSINESS_BASE,
    "sec_certificate",
    "articles_and_bylaws",
    "general_information_sheet",
    "signatory_authorization",
  ],
  corporation: [
    ...BUSINESS_BASE,
    "sec_certificate",
    "articles_and_bylaws",
    "general_information_sheet",
    "signatory_authorization",
  ],
};

export type ChecklistItem = { key: DocumentKey; required: boolean } & DocumentInfo;

/**
 * The documents this applicant is asked for, required first.
 *
 * The business permit is optional until Operations asks for it, and then it
 * is required — the case says so (`businessPermitRequired`).
 */
export function checklistFor(
  track: ApplicationTrack,
  { businessPermitRequired = false }: { businessPermitRequired?: boolean } = {},
): ChecklistItem[] {
  const required = [...REQUIRED_DOCUMENTS[track]];
  const optional: DocumentKey[] = [];
  if (track === "organization") optional.push("school_recognition_certificate");
  else if (businessPermitRequired) required.push("business_permit");
  else optional.push("business_permit");
  return [
    ...required.map((key) => ({ key, required: true, ...DOCUMENTS[key] })),
    ...optional.map((key) => ({ key, required: false, ...DOCUMENTS[key] })),
  ];
}

export const BUSINESS_TYPES: { value: BusinessType; label: string; hint: string }[] = [
  { value: "sole_proprietor", label: "Sole proprietor", hint: "Registered with DTI under one owner" },
  { value: "partnership", label: "Partnership", hint: "Registered with the SEC as a partnership" },
  { value: "corporation", label: "Corporation", hint: "Registered with the SEC as a corporation" },
];

export const GOVERNMENT_ID_TYPES: { value: GovernmentIdType; label: string; canHaveNoExpiry: boolean }[] = [
  { value: "philid", label: "PhilID", canHaveNoExpiry: true },
  { value: "ephilid", label: "ePhilID", canHaveNoExpiry: true },
  { value: "passport", label: "Passport", canHaveNoExpiry: false },
  { value: "drivers_license", label: "Driver's licence", canHaveNoExpiry: false },
  { value: "umid", label: "UMID", canHaveNoExpiry: true },
];

export function governmentIdLabel(value: GovernmentIdType | null): string {
  return GOVERNMENT_ID_TYPES.find((option) => option.value === value)?.label ?? "—";
}

export function idCanHaveNoExpiry(value: GovernmentIdType | null): boolean {
  return GOVERNMENT_ID_TYPES.find((option) => option.value === value)?.canHaveNoExpiry ?? false;
}

/** Said beside every upload, because these are ID documents. */
export const DOCUMENT_PRIVACY =
  "Only GRIDGO Operations can open these files — not shops, not riders, and not this app once they are sent. They are kept while your account is open, and for one year after it closes or an application is turned down.";

/* --------------------------------------------------------------------------
   The draft
   -------------------------------------------------------------------------- */

export type PersonDraft = {
  fullName: string;
  dateOfBirth: string;
  address: string;
  phone: string;
  governmentIdType: GovernmentIdType | null;
  governmentIdExpiresOn: string;
  governmentIdHasNoExpiry: boolean;
  studentIdExpiresOn: string;
  originalId: boolean;
  detailsMatchId: boolean;
};

export type UploadedDocument = { fileId: string; name: string };

export type ApplicationDraft = {
  accountType: "organization" | "business";
  businessType: BusinessType | null;
  businessName: string;
  businessNature: string;
  school: string;
  facultyAdviserContact: string;
  person: PersonDraft;
  documents: Partial<Record<DocumentKey, UploadedDocument>>;
};

export const EMPTY_PERSON: PersonDraft = {
  fullName: "",
  dateOfBirth: "",
  address: "",
  phone: "",
  governmentIdType: null,
  governmentIdExpiresOn: "",
  governmentIdHasNoExpiry: false,
  studentIdExpiresOn: "",
  originalId: false,
  detailsMatchId: false,
};

export function emptyApplicationDraft(
  seed: { orgName?: string | null; accountType?: string | null; name?: string | null; phone?: string | null } = {},
  organization?: { name: string | null; school: string | null } | null,
): ApplicationDraft {
  return {
    accountType: seed.accountType === "business" ? "business" : "organization",
    businessType: null,
    businessName: organization?.name?.trim() || seed.orgName?.trim() || "",
    businessNature: "",
    school: organization?.school?.trim() || "",
    facultyAdviserContact: "",
    person: { ...EMPTY_PERSON, fullName: seed.name?.trim() ?? "", phone: seed.phone?.trim() ?? "" },
    documents: {},
  };
}

export function trackOf(draft: Pick<ApplicationDraft, "accountType" | "businessType">): ApplicationTrack | null {
  if (draft.accountType === "organization") return "organization";
  return draft.businessType;
}

/* --------------------------------------------------------------------------
   Steps
   -------------------------------------------------------------------------- */

export type ApplicationStepId = "account" | "person" | "documents" | "email" | "review";

export type ApplicationStep = { id: ApplicationStepId; label: string };

/**
 * The steps this applicant walks. A sequence, so they are numbered: each
 * answer is carried forward and read back on Review before anything is sent.
 *
 * Email comes straight before Review because its code expires ten minutes
 * after it is sent, and the application must reach GRIDGO inside that window.
 */
export function applicationSteps(
  mode: ApplicationMode,
  accountType: ApplicationDraft["accountType"],
): ApplicationStep[] {
  const organization = mode !== "apply" || accountType === "organization";
  // Short labels: five numbered pills share a phone's width. "ID" is the step
  // that takes the officer's or signatory's details as they are on their ID.
  const steps: ApplicationStep[] = [];
  if (mode !== "handover") steps.push({ id: "account", label: "About" });
  steps.push({ id: "person", label: "ID" });
  steps.push({ id: "documents", label: "Files" });
  if (organization) steps.push({ id: "email", label: "Email" });
  steps.push({ id: "review", label: "Send" });
  return steps;
}

/* --------------------------------------------------------------------------
   Checking answers
   -------------------------------------------------------------------------- */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date as YYYY-MM-DD, or false. */
export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Typing a date with the number pad: digits only, with the dashes put in for
 * the client, so "20040315" reads "2004-03-15" as it is typed.
 */
export function formatDateTyping(value: string): string {
  const digits = value.replaceAll(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** Today in Manila as YYYY-MM-DD — the day GRIDGO checks expiry against. */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export type FieldProblems = Partial<Record<string, string>>;

export function accountProblems(draft: ApplicationDraft): FieldProblems {
  const problems: FieldProblems = {};
  const organization = draft.accountType === "organization";
  if (!organization && !draft.businessType) problems.businessType = "Choose how the business is registered.";
  if (!draft.businessName.trim()) {
    problems.businessName = organization
      ? "Enter the organization's name, as the school knows it."
      : "Enter the business name, as registered.";
  } else if (draft.businessName.trim().length > 200) {
    problems.businessName = "Keep the name under 200 characters.";
  }
  if (!draft.businessNature.trim()) {
    problems.businessNature = organization
      ? "Say what the organization does."
      : "Say what the business does.";
  }
  if (organization && !draft.school.trim()) problems.school = "Enter the school this organization belongs to.";
  return problems;
}

export function personProblems(
  person: PersonDraft,
  { organization, today }: { organization: boolean; today: string },
): FieldProblems {
  const problems: FieldProblems = {};
  if (!person.fullName.trim()) problems.fullName = "Enter the full name exactly as it is on the ID.";
  if (!isCalendarDate(person.dateOfBirth) || person.dateOfBirth >= today) {
    problems.dateOfBirth = "Enter the date of birth as YYYY-MM-DD, for example 2004-03-15.";
  }
  if (!person.address.trim()) problems.address = "Enter the address as it is on the ID.";
  const phone = mobileNumberProblem(person.phone);
  if (phone) problems.phone = phone;
  if (!person.governmentIdType) problems.governmentIdType = "Choose which ID you are sending.";
  const noExpiry = person.governmentIdHasNoExpiry && idCanHaveNoExpiry(person.governmentIdType);
  if (!noExpiry) {
    if (!isCalendarDate(person.governmentIdExpiresOn)) {
      problems.governmentIdExpiresOn = "Enter the expiry date on the ID as YYYY-MM-DD.";
    } else if (person.governmentIdExpiresOn < today) {
      problems.governmentIdExpiresOn = "This ID has expired. Send one that is still valid.";
    }
  }
  if (organization) {
    if (!isCalendarDate(person.studentIdExpiresOn)) {
      problems.studentIdExpiresOn = "Enter the date the student ID is valid until, as YYYY-MM-DD.";
    } else if (person.studentIdExpiresOn < today) {
      problems.studentIdExpiresOn = "This student ID has expired. Send one that is still valid.";
    }
  }
  if (!person.originalId || !person.detailsMatchId) {
    problems.confirm = "Tick both to confirm the ID is the original and the details match it.";
  }
  return problems;
}

export function documentProblems(
  draft: ApplicationDraft,
  checklist: ChecklistItem[],
): FieldProblems {
  const problems: FieldProblems = {};
  for (const item of checklist) {
    if (item.required && !draft.documents[item.key]) problems[item.key] = `Add the ${item.label.toLowerCase()}.`;
  }
  return problems;
}

/** The first thing stopping a step, or null. */
export function stepProblem(
  step: ApplicationStepId,
  draft: ApplicationDraft,
  {
    mode,
    checklist,
    emailVerified,
    today,
  }: { mode: ApplicationMode; checklist: ChecklistItem[]; emailVerified: boolean; today: string },
): string | null {
  const first = (problems: FieldProblems) => Object.values(problems)[0] ?? null;
  switch (step) {
    case "account":
      return first(accountProblems(draft));
    case "person":
      return first(
        personProblems(draft.person, {
          organization: mode !== "apply" || draft.accountType === "organization",
          today,
        }),
      );
    case "documents": {
      const missing = Object.keys(documentProblems(draft, checklist)).length;
      if (!missing) return null;
      return missing === 1 ? "One document is still missing." : `${missing} documents are still missing.`;
    }
    case "email":
      return emailVerified ? null : "Verify the organization email to continue.";
    case "review":
      return null;
  }
}

/* --------------------------------------------------------------------------
   The body GRIDGO takes
   -------------------------------------------------------------------------- */

export function applicantPerson(person: PersonDraft, organization: boolean): ApplicantPerson {
  const noExpiry = person.governmentIdHasNoExpiry && idCanHaveNoExpiry(person.governmentIdType);
  return {
    fullName: person.fullName.trim(),
    dateOfBirth: person.dateOfBirth,
    address: person.address.trim(),
    phone: person.phone.trim(),
    governmentIdType: person.governmentIdType as GovernmentIdType,
    ...(noExpiry
      ? { governmentIdHasNoExpiry: true }
      : { governmentIdExpiresOn: person.governmentIdExpiresOn }),
    originalId: true,
    detailsMatchId: true,
    ...(organization ? { studentIdExpiresOn: person.studentIdExpiresOn } : {}),
  };
}

/** Only the documents on this track's checklist, as file ids. */
export function documentIds(
  draft: ApplicationDraft,
  checklist: ChecklistItem[],
): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const item of checklist) {
    const uploaded = draft.documents[item.key];
    if (uploaded) ids[item.key] = uploaded.fileId;
  }
  return ids;
}

export function applicationInput(
  draft: ApplicationDraft,
  {
    checklist,
    loginEmail,
    expectedVersion,
  }: { checklist: ChecklistItem[]; loginEmail: string; expectedVersion?: number | null },
): ClientApplicationInput {
  const version = expectedVersion == null ? {} : { expectedVersion };
  const documents = documentIds(draft, checklist);
  if (draft.accountType === "organization") {
    const adviser = draft.facultyAdviserContact.trim();
    return {
      accountType: "organization",
      businessName: draft.businessName.trim(),
      businessNature: draft.businessNature.trim(),
      school: draft.school.trim(),
      organizationEmail: loginEmail.trim().toLowerCase(),
      officer: applicantPerson(draft.person, true),
      documents,
      ...(adviser ? { facultyAdviserContact: adviser } : {}),
      ...version,
    };
  }
  return {
    accountType: "business",
    businessType: draft.businessType as BusinessType,
    businessName: draft.businessName.trim(),
    businessNature: draft.businessNature.trim(),
    signatory: applicantPerson(draft.person, false),
    documents,
    ...version,
  };
}

/* --------------------------------------------------------------------------
   Refusals, in the client's words
   -------------------------------------------------------------------------- */

/** The step a refusal sends the client back to, where there is one. */
export function refusalStep(code: string | null, fields: string[] = []): ApplicationStepId | null {
  if (code === "organization_email_verification_required") return "email";
  if (code === "organization_already_exists") return "account";
  if (code === "invalid_application" || code === "new_officer_documents_required") {
    if (code === "new_officer_documents_required" || fields.some((field) => field.startsWith("documents"))) {
      return "documents";
    }
    if (fields.some((field) => field.startsWith("officer") || field.startsWith("signatory"))) return "person";
    if (fields.length) return "account";
  }
  return null;
}

export function refusalMessage(code: string | null): string | null {
  switch (code) {
    case "organization_already_exists":
      return "An organization with this name at this school is already on GRIDGO. Check the name and school, or ask Operations if your organization already has an account.";
    case "organization_email_verification_required":
      return "The email code has expired or was already used. Send a new code and enter it again.";
    case "new_officer_documents_required":
      return "Upload the new officer's own documents. Files from an earlier approval cannot be reused.";
    case "invalid_application":
      return "Something in the application was not accepted. Check the step shown and try again.";
    case "approval_state_conflict":
      return "Your application changed somewhere else while this was open. Close this screen and start again so nothing is overwritten.";
    case "organization_identity_immutable":
      return "The organization's name and school cannot change during an officer handover.";
    case "verified_officer_required":
      return "This organization has no verified officer to hand over from yet. Verify the first officer instead.";
    case "officer_handover_pending":
      return "A change of officer is already with Operations.";
    default:
      return null;
  }
}

export function emailCodeMessage(code: string | null): string | null {
  switch (code) {
    case "organization_code_rate_limited":
      return "A code was sent a moment ago. Wait a minute before asking for another.";
    case "organization_code_invalid_or_expired":
      return "That code is wrong or has expired. Check the latest email, or send a new code.";
    case "organization_login_email_required":
      return "The code can only go to the email this organization signs in with.";
    case "organization_email_not_configured":
    case "organization_email_delivery_failed":
      return "GRIDGO could not send the email just now. Try again in a few minutes.";
    default:
      return null;
  }
}
