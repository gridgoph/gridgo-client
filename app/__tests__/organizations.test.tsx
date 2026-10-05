import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrganizationsScreen from "@/app/(tabs)/organizations";
import type { ClientOrganization, OrganizationStatement, User } from "@/lib/api";
import { useNotifications } from "@/store/notifications";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";
import { useStatements } from "@/store/statements";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getOrganization: jest.fn(), getOrganizationStatement: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORG_USER: User = {
  id: "u_org",
  email: "pta@school.edu.ph",
  name: "Ana Reyes",
  role: "client",
  accountType: "organization",
  orgName: "Grade 10 PTA",
  approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 3 },
};

const ORGANIZATION: ClientOrganization = {
  userId: "u_org",
  name: "Grade 10 PTA",
  school: "Davao City National High School",
  email: "pta@school.edu.ph",
  currentOfficer: { id: "officer_1", fullName: "Ana Reyes", verifiedAt: "2026-07-01T02:00:00Z" },
  confirmedAt: "2026-07-01T02:00:00Z",
  nextConfirmationAt: "2026-10-01T02:00:00Z",
  confirmationRequestedAt: "2026-10-01T02:00:00Z",
  approvalCase: { id: "apc_1", status: "approved", version: 3 },
  actions: ["confirm_officer", "change_officer"],
};

const STATEMENT: OrganizationStatement = {
  notice: "Not a tax document. Official receipts are issued separately.",
  currency: "PHP",
  period: { from: "2026-10-01", to: "2026-10-31", timezone: "Asia/Manila" },
  orderCount: 2,
  totalSpendMinor: 315000,
  discountEarnedMinor: 9500,
  orders: [
    {
      date: "2026-10-03",
      closedAt: "2026-10-03T04:00:00Z",
      orderId: "ord_3ff0128e105a",
      product: "Tarpaulin 4x8",
      amountMinor: 120000,
      organizationDiscountMinor: 3500,
      invoiceNumber: "GG-2026-0012",
      officerOfRecord: "Ana Reyes",
    },
    {
      date: "2026-10-04",
      closedAt: "2026-10-04T04:00:00Z",
      orderId: "ord_9aa0128e105b",
      product: "Class shirts",
      amountMinor: 195000,
      organizationDiscountMinor: 6000,
      invoiceNumber: "GG-2026-0013",
      officerOfRecord: "",
    },
  ],
};

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

/* Render-only: no presses in this file (see AGENTS.md on RNTL 14). */
describe("the Organizations tab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
    useOrganization.getState().reset();
    useStatements.getState().reset();
    useNotifications.setState({
      items: [
        {
          id: "ntf_1",
          userId: "u_org",
          type: "organization_notice",
          title: "Uniform orders close Friday",
          body: "Send the class list by Thursday noon.",
          read: false,
          at: "2026-10-04T02:00:00Z",
        },
      ],
    });
    api.getOrganization.mockResolvedValue(ORGANIZATION);
    api.getOrganizationStatement.mockResolvedValue(STATEMENT);
  });

  it("asks the quarterly question, shows the officer, the notices and the statement", async () => {
    await renderInSafeArea(<OrganizationsScreen />);

    await screen.findByText("₱3,150.00");
    expect(screen.getByText("Is Ana Reyes still your officer?")).toBeTruthy();
    expect(screen.getByText("Confirm Ana Reyes is still the officer")).toBeTruthy();
    expect(screen.getByText("No, change officer")).toBeTruthy();
    expect(screen.getByTestId("officer-card")).toBeTruthy();
    expect(screen.getByText("Uniform orders close Friday")).toBeTruthy();

    // Summary: total spend, orders, discount earned, and the savings line.
    expect(screen.getByText("Total spend")).toBeTruthy();
    expect(screen.getByLabelText("2 orders")).toBeTruthy();
    expect(screen.getByLabelText("Discount earned ₱95.00")).toBeTruthy();
    expect(screen.getByText("You've saved ₱95.00 with your Organization account")).toBeTruthy();
    // Clearly not a tax document, on the slip itself.
    expect(screen.getByText("Not a tax document")).toBeTruthy();

    // The table: date, order, product, amount, invoice, officer — and a blank
    // officer is said, never filled with today's name.
    expect(screen.getByText("Tarpaulin 4x8")).toBeTruthy();
    expect(screen.getByText("3FF0-128E-105A")).toBeTruthy();
    expect(screen.getByText("Invoice GG-2026-0012")).toBeTruthy();
    expect(screen.getByText("Officer: Ana Reyes")).toBeTruthy();
    expect(screen.getByText("Officer: Not recorded")).toBeTruthy();
    expect(screen.getByText("₱1,200.00")).toBeTruthy();

    expect(screen.getByText("Export PDF")).toBeTruthy();
    expect(screen.getByText("Export CSV")).toBeTruthy();
    // GRIDGO's fee is never on this screen.
    expect(screen.queryByText(/service fee/i)).toBeNull();
  });

  it("says a handover is with Operations and keeps the current officer on record", async () => {
    useSession.setState({ user: { ...ORG_USER, approvalCase: { ...ORG_USER.approvalCase!, status: "pending" } } });
    api.getOrganization.mockResolvedValue({
      ...ORGANIZATION,
      confirmationRequestedAt: null,
      approvalCase: { id: "apc_1", status: "pending", version: 4 },
    });
    await renderInSafeArea(<OrganizationsScreen />);

    await screen.findByText("Change with Operations");
    expect(screen.getByText(/stays the officer of record until they approve/)).toBeTruthy();
    expect(screen.queryByText("Change officer")).toBeNull();
    expect(screen.queryByText("Is Ana Reyes still your officer?")).toBeNull();
  });

  it("is closed to an account Operations has not approved as an organization", async () => {
    useSession.setState({ user: { ...ORG_USER, approvalCase: null } });
    api.getOrganization.mockResolvedValue(null);
    await renderInSafeArea(<OrganizationsScreen />);

    await waitFor(() => expect(screen.getByText("For approved organizations")).toBeTruthy());
    expect(api.getOrganizationStatement).not.toHaveBeenCalled();
    expect(screen.queryByTestId("statement-summary")).toBeNull();
  });
});
