import { ApiError, type User } from "@/lib/api";
import {
  accountHeadline,
  accountInitials,
  accountPatch,
  accountProblems,
  accountSubName,
  canApplyAsBusiness,
  draftFromUser,
  hasAccountChanges,
  mobileNumberProblem,
  saveAccount,
} from "@/lib/accountProfile";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, patchAccount: jest.fn() };
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

  it("stops offering the upgrade once Operations has approved it", () => {
    const approved: User = {
      ...BUSINESS,
      approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 2 },
    };
    expect(canApplyAsBusiness(approved)).toBe(false);
    expect(canApplyAsBusiness(null)).toBe(false);
  });

  it("still offers the checklist to a business only declared at sign-up", () => {
    // Declaring is not being approved: no discount and no Organizations tab
    // until the documents have been checked.
    expect(canApplyAsBusiness(BUSINESS)).toBe(true);
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
