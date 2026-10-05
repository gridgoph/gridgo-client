import { ApiError, type ClientOrganization, type OrganizationStatement } from "@/lib/api";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";
import { requestedPeriod, useStatements } from "@/store/statements";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrganization: jest.fn(),
    confirmOrganizationOfficer: jest.fn(),
    getOrganizationStatement: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORGANIZATION: ClientOrganization = {
  userId: "u1",
  name: "Grade 10 PTA",
  school: "DCNHS",
  email: "pta@school.edu.ph",
  currentOfficer: { id: "officer_1", fullName: "Ana Reyes", verifiedAt: "2026-07-01T00:00:00Z" },
  confirmedAt: null,
  nextConfirmationAt: "2026-10-01T00:00:00Z",
  confirmationRequestedAt: "2026-10-01T00:00:00Z",
  approvalCase: { id: "apc_1", status: "approved", version: 3 },
  actions: ["confirm_officer", "change_officer"],
};

const STATEMENT: OrganizationStatement = {
  notice: "Not a tax document. Official receipts are issued separately.",
  currency: "PHP",
  period: { from: "2026-10-01", to: "2026-10-31", timezone: "Asia/Manila" },
  orderCount: 0,
  totalSpendMinor: 0,
  discountEarnedMinor: 0,
  orders: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({
    user: { id: "u1", email: "pta@school.edu.ph", name: "Ana", role: "client", accountType: "organization" },
    source: "clerk",
    loading: false,
    error: null,
    signingOut: false,
  });
  useOrganization.getState().reset();
  useStatements.getState().reset();
});

describe("the organization record", () => {
  it("treats a missing route as no organization rather than a failure", async () => {
    api.getOrganization.mockRejectedValue(new ApiError(404, { error: "organization_not_found" }));
    await useOrganization.getState().load();
    expect(useOrganization.getState()).toMatchObject({ status: "ready", organization: null, error: null });
  });

  it("confirms the officer it is showing, by id", async () => {
    api.getOrganization.mockResolvedValue(ORGANIZATION);
    await useOrganization.getState().load();
    api.confirmOrganizationOfficer.mockResolvedValue({ ...ORGANIZATION, confirmationRequestedAt: null });

    expect(await useOrganization.getState().confirm()).toBe(true);
    expect(api.confirmOrganizationOfficer).toHaveBeenCalledWith("officer_1");
    expect(useOrganization.getState()).toMatchObject({ justConfirmed: true });
    expect(useOrganization.getState().organization?.confirmationRequestedAt).toBeNull();
  });

  it("re-reads when the officer changed under the question", async () => {
    api.getOrganization.mockResolvedValue(ORGANIZATION);
    await useOrganization.getState().load();
    api.confirmOrganizationOfficer.mockRejectedValue(new ApiError(409, { error: "officer_changed" }));

    expect(await useOrganization.getState().confirm()).toBe(false);
    expect(useOrganization.getState().confirmError).toContain("officer changed");
    expect(api.getOrganization).toHaveBeenCalledTimes(2);
  });

  it("never shows one account's organization to the next", async () => {
    api.getOrganization.mockResolvedValue(ORGANIZATION);
    await useOrganization.getState().load();
    useSession.setState({ user: { id: "u2", email: "b@x.ph", name: "B", role: "client" } });
    api.getOrganization.mockReturnValue(new Promise(() => undefined));
    void useOrganization.getState().load();
    expect(useOrganization.getState().organization).toBeNull();
  });
});

describe("the statement", () => {
  it("asks for this month first, and the quarter when picked", async () => {
    api.getOrganizationStatement.mockResolvedValue(STATEMENT);
    await useStatements.getState().load();
    expect(api.getOrganizationStatement).toHaveBeenLastCalledWith({ kind: "this_month" });
    useStatements.getState().setKind("this_quarter");
    expect(api.getOrganizationStatement).toHaveBeenLastCalledWith({ kind: "this_quarter" });
  });

  it("waits for a whole custom range before asking", () => {
    useStatements.setState({ kind: "custom", customFrom: "2026-10-01", customTo: "" });
    expect(requestedPeriod(useStatements.getState())).toBeNull();
    useStatements.setState({ customTo: "2026-10-15" });
    expect(requestedPeriod(useStatements.getState())).toEqual({ kind: "custom", from: "2026-10-01", to: "2026-10-15" });
  });

  it("says an unapproved account's refusal in words", async () => {
    api.getOrganizationStatement.mockRejectedValue(new ApiError(403, { error: "organization_approval_required" }));
    await useStatements.getState().load();
    expect(useStatements.getState()).toMatchObject({ status: "failed" });
    expect(useStatements.getState().error).toContain("approved");
  });
});
