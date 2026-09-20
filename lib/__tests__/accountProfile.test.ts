import { ApiError, type ClientAddress, type User } from "@/lib/api";
import {
  accountHeadline,
  accountInitials,
  accountPatch,
  accountProblems,
  accountSubName,
  applyContactProblems,
  applySteps,
  applyStepProblem,
  businessApplyInput,
  canApplyAsBusiness,
  draftFromUser,
  hasAccountChanges,
  mobileNumberProblem,
  saveAccount,
  submitBusinessApply,
} from "@/lib/accountProfile";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, patchAccount: jest.fn(), applyAsBusiness: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const PERSONAL: User = {
  id: "u1",
  email: "ana@bautista.ph",
  name: "Ana Bautista",
  role: "client",
  phone: "+639171234567",
  accountType: "individual",
  version: 3,
};

const BUSINESS: User = {
  ...PERSONAL,
  accountType: "business",
  orgName: "Bautista Trading",
};

const ADDRESS: ClientAddress = {
  id: "addr_1",
  label: "Office",
  addressLine: "12 Quimpo Blvd, Talomo",
  point: { lat: 7.07, lng: 125.61, label: "12 Quimpo Blvd, Talomo" },
  isDefault: false,
  version: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("the identity card", () => {
  it("names a business by its business name and keeps the person under it", () => {
    expect(accountHeadline(BUSINESS)).toBe("Bautista Trading");
    expect(accountSubName(BUSINESS)).toBe("Ana Bautista");
  });

  it("names a personal account by the person, and does not repeat them", () => {
    expect(accountHeadline(PERSONAL)).toBe("Ana Bautista");
    expect(accountSubName(PERSONAL)).toBeNull();
  });

  it("never infers a business from orgName alone", () => {
    // A leftover orgName on a personal account must not flip the lockup — the
    // account type is the declaration, and re-deriving it is what makes the
    // identity flicker on a profile edit.
    const leftover: User = { ...PERSONAL, orgName: "Bautista Trading" };
    expect(accountHeadline(leftover)).toBe("Ana Bautista");
    expect(canApplyAsBusiness(leftover)).toBe(true);
  });

  it("takes the ends of a name for the monogram", () => {
    expect(accountInitials("Ana Bautista")).toBe("AB");
    expect(accountInitials("Davao Print Supply Co")).toBe("DC");
    expect(accountInitials("Ana")).toBe("A");
    expect(accountInitials("   ")).toBe("");
  });

  it("stops offering the upgrade once the account is one", () => {
    expect(canApplyAsBusiness(BUSINESS)).toBe(false);
    expect(canApplyAsBusiness(null)).toBe(false);
  });

  it("stops offering a new application while one is waiting", () => {
    const pending: User = {
      ...PERSONAL,
      approvalCase: {
        id: "apc_1",
        kind: "business_client",
        status: "pending",
        version: 1,
      },
    };
    expect(canApplyAsBusiness(pending)).toBe(false);
  });
});

describe("correcting the details", () => {
  it("sends only what moved", () => {
    const draft = { ...draftFromUser(PERSONAL), name: "Ana R. Bautista" };
    expect(hasAccountChanges(PERSONAL, draft)).toBe(true);
    expect(accountPatch(PERSONAL, draft)).toEqual({ name: "Ana R. Bautista" });
  });

  it("never sends orgName for a personal account", () => {
    // GRIDGO refuses it outright with `org_name_not_allowed`, and a patch that
    // carries an untouched field is the write that loses someone else's edit.
    const draft = { ...draftFromUser(PERSONAL), orgName: "Something" };
    expect(accountPatch(PERSONAL, draft)).toEqual({});
    expect(hasAccountChanges(PERSONAL, draft)).toBe(false);
  });

  it("sends orgName for a business account that changed it", () => {
    const draft = { ...draftFromUser(BUSINESS), orgName: "Bautista Trading Inc" };
    expect(accountPatch(BUSINESS, draft)).toEqual({ orgName: "Bautista Trading Inc" });
  });

  it("checks the number the way GRIDGO will, before the round trip", () => {
    expect(mobileNumberProblem("0917 123 4567")).toBeNull();
    expect(mobileNumberProblem("+639171234567")).toBeNull();
    expect(mobileNumberProblem("(0917) 123-4567")).toBeNull();
    expect(mobileNumberProblem("12345")).toContain("Philippine mobile number");
    expect(mobileNumberProblem("")).toContain("reach you on");
  });

  it("asks a business for its name and a client for theirs", () => {
    expect(accountProblems({ name: "", phone: "0917 123 4567", orgName: "" }, "individual"))
      .toEqual({ name: expect.stringContaining("name") });
    expect(
      accountProblems({ name: "Ana", phone: "0917 123 4567", orgName: "" }, "business"),
    ).toEqual({ orgName: expect.stringContaining("business name") });
  });
});

describe("saving", () => {
  beforeEach(() => {
    api.patchAccount.mockReset();
  });

  it("quotes the version it read, so GRIDGO can refuse a stale edit", async () => {
    api.patchAccount.mockResolvedValue(PERSONAL);
    await saveAccount({ name: "Ana R. Bautista" }, 3);
    expect(api.patchAccount).toHaveBeenCalledWith({ name: "Ana R. Bautista" }, 3);
  });

  it("reads a version conflict as stale, not as a failure to retry", async () => {
    api.patchAccount.mockRejectedValue(
      new ApiError(409, { error: "account_version_conflict", currentVersion: 4 }),
    );
    expect(await saveAccount({ name: "x" }, 3)).toEqual({ status: "stale" });
  });

  it("does not read every 409 as stale", async () => {
    // `/me` answers 409 for an identity with no editable client profile too,
    // and offering "load the latest" for that sends a client round a loop.
    api.patchAccount.mockRejectedValue(
      new ApiError(409, { error: "client_profile_unavailable", message: "No client." }),
    );
    const outcome = await saveAccount({ name: "x" }, 3);
    expect(outcome.status).toBe("failed");
  });

  it("points a refusal at the field GRIDGO named", async () => {
    api.patchAccount.mockRejectedValue(
      new ApiError(400, {
        error: "invalid_account_profile",
        message: "Enter a Philippine mobile number, for example 0917 123 4567.",
        field: "phone",
      }),
    );
    const outcome = await saveAccount({ phone: "12345" }, 3);
    expect(outcome).toEqual({
      status: "failed",
      field: "phone",
      message: "Enter a Philippine mobile number, for example 0917 123 4567.",
    });
  });

  it("says a missing route is not open yet rather than showing a failure", async () => {
    api.patchAccount.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    expect(await saveAccount({ name: "x" }, 3)).toEqual({ status: "not_open_yet" });
  });
});

describe("applying as a business", () => {
  beforeEach(() => {
    api.applyAsBusiness.mockReset();
  });

  it("skips the contact step when GRIDGO already holds a name and a number", () => {
    expect(applySteps(PERSONAL).map((step) => step.id)).toEqual(["name", "where", "review"]);
  });

  it("asks for contact details when the account has none", () => {
    const bare: User = { ...PERSONAL, phone: undefined };
    expect(applySteps(bare).map((step) => step.id)).toEqual([
      "name",
      "contact",
      "where",
      "review",
    ]);
  });

  it("will not leave the first step without a business name and nature", () => {
    const draft = {
      orgName: "  ",
      nature: "",
      accountType: "business" as const,
      contactName: "Ana",
      phone: "0917 123 4567",
      addressId: null,
    };
    expect(applyStepProblem("name", draft)).toContain("business name");
    expect(applyStepProblem("name", { ...draft, orgName: "Bautista Trading" })).toContain("what this business does");
    expect(
      applyStepProblem("name", { ...draft, orgName: "Bautista Trading", nature: "Events" }),
    ).toBeNull();
  });

  it("says which of the two contact answers is wrong, not just that one is", () => {
    // A number rejected for its format, explained under the name, sends a
    // client to correct the field that is already right.
    const problems = applyContactProblems({
      orgName: "Bautista Trading",
      nature: "Events",
      accountType: "business",
      contactName: "Ana",
      phone: "12345",
      addressId: null,
    });
    expect(problems.contactName).toBeNull();
    expect(problems.phone).toContain("Philippine mobile number");
  });

  it("never blocks on the address — GRIDGO asks again at checkout", () => {
    const draft = {
      orgName: "Bautista Trading",
      nature: "Events",
      accountType: "business" as const,
      contactName: "Ana",
      phone: "0917",
      addressId: null,
    };
    expect(applyStepProblem("where", draft)).toBeNull();
    expect(applyStepProblem("review", draft)).toBeNull();
  });

  it("sends the name, nature, and requested account type", () => {
    const input = businessApplyInput({
      orgName: " Bautista Trading ",
      nature: " Events and merchandise ",
      accountType: "organization",
      contactName: "Ana Bautista",
      phone: "0917 123 4567",
      addressId: ADDRESS.id,
    });

    expect(input).toEqual({
      businessName: "Bautista Trading",
      businessNature: "Events and merchandise",
      accountType: "organization",
    });
  });

  it("hands back the pending account GRIDGO returned", async () => {
    const pending = {
      ...PERSONAL,
      approvalCase: { id: "apc_1", kind: "business_client" as const, status: "pending" as const, version: 1 },
    };
    api.applyAsBusiness.mockResolvedValue(pending);
    expect(await submitBusinessApply({
      businessName: "Bautista Trading",
      businessNature: "Events",
    }, "apply-1")).toEqual({
      status: "ok",
      value: pending,
    });
    expect(api.applyAsBusiness).toHaveBeenCalledWith(
      { businessName: "Bautista Trading", businessNature: "Events" },
      "apply-1",
    );
  });
});
