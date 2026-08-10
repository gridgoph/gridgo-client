/**
 * Creating a client account.
 *
 * Clients are the only role that signs up in this binary. Supplier and rider
 * accounts exist by their own apps' signup and wait on Operations approval, so
 * nothing here offers to make one.
 *
 * The account type declared here is the one the API stores and returns on
 * every session, and it is what decides whether this client sees the GRIDGO
 * Business lockup. It is a real declaration, not a preference.
 */

import type { AccountType, ClientSignupInput } from "@/lib/api";

export type AccountTypeOption = {
  value: AccountType;
  label: string;
  hint: string;
  /** True when the API requires a business or organization name. */
  needsOrgName: boolean;
};

/**
 * The three kinds of client, in the words someone would use about themselves.
 * `individual` is what the API stores; the captain calls it personal, so the
 * label does too.
 */
export const ACCOUNT_TYPES: AccountTypeOption[] = [
  {
    value: "individual",
    label: "Personal",
    hint: "Printing for yourself — invitations, shirts, a one-off banner",
    needsOrgName: false,
  },
  {
    value: "business",
    label: "Business",
    hint: "Printing for a company that trades under its own name",
    needsOrgName: true,
  },
  {
    value: "organization",
    label: "Organization",
    hint: "A school, church, NGO, barangay or government office",
    needsOrgName: true,
  },
];

export function accountTypeOption(value: AccountType): AccountTypeOption {
  return ACCOUNT_TYPES.find((option) => option.value === value) ?? ACCOUNT_TYPES[0];
}

export function needsOrgName(value: AccountType): boolean {
  return accountTypeOption(value).needsOrgName;
}

/** The API's floor. Said on the field, not after a rejected submission. */
export const MIN_PASSWORD_LENGTH = 8;

export type SignupFields = {
  accountType: AccountType;
  name: string;
  orgName: string;
  email: string;
  phone: string;
  password: string;
};

export const EMPTY_SIGNUP: SignupFields = {
  accountType: "individual",
  name: "",
  orgName: "",
  email: "",
  phone: "",
  password: "",
};

export type SignupCheck = { ok: boolean; reason: string | null };

/** One field at a time, so a form can show the reason under the field itself. */
export function checkSignupField(
  field: keyof SignupFields,
  fields: SignupFields,
): SignupCheck {
  const ok: SignupCheck = { ok: true, reason: null };

  switch (field) {
    case "name":
      return fields.name.trim()
        ? ok
        : { ok: false, reason: "Enter the name this account belongs to." };
    case "orgName":
      if (!needsOrgName(fields.accountType)) return ok;
      return fields.orgName.trim()
        ? ok
        : {
            ok: false,
            reason:
              fields.accountType === "business"
                ? "Enter the business name. It goes on the job with every supplier who prints for you."
                : "Enter the organization's name. It goes on the job with every supplier who prints for you.",
          };
    case "email": {
      const value = fields.email.trim();
      if (!value) return { ok: false, reason: "Enter the email you will sign in with." };
      // The API's own bar: a complete address. Nothing stricter, so a valid
      // address is never rejected here and accepted there.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { ok: false, reason: "Enter a complete email address, like ana@company.com." };
      }
      return ok;
    }
    case "phone":
      return fields.phone.trim()
        ? ok
        : {
            ok: false,
            reason: "Enter a number Operations can reach you on about a job.",
          };
    case "password":
      return fields.password.length >= MIN_PASSWORD_LENGTH
        ? ok
        : {
            ok: false,
            reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
          };
    default:
      return ok;
  }
}

const ORDERED_FIELDS: (keyof SignupFields)[] = [
  "name",
  "orgName",
  "email",
  "phone",
  "password",
];

/** The first thing still missing, so the button can say why it will not go. */
export function firstSignupProblem(fields: SignupFields): string | null {
  for (const field of ORDERED_FIELDS) {
    const result = checkSignupField(field, fields);
    if (!result.ok) return result.reason;
  }
  return null;
}

export function canSubmitSignup(fields: SignupFields): boolean {
  return firstSignupProblem(fields) === null;
}

/** Form values → exactly the body `POST /auth/signup` wants. */
export function signupInput(fields: SignupFields): ClientSignupInput {
  const orgName = fields.orgName.trim();
  return {
    email: fields.email.trim().toLowerCase(),
    password: fields.password,
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    accountType: fields.accountType,
    ...(needsOrgName(fields.accountType) && orgName ? { orgName } : {}),
  };
}
