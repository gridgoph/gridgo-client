import { render, screen } from "@testing-library/react-native";

import { OrganizationDiscountRow, OrganizationSavingsNote } from "@/components/OrganizationDiscount";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const PERSONAL: User = { id: "u1", email: "a@b.ph", name: "Ana", role: "client", accountType: "individual" };
const ORGANIZATION: User = {
  ...PERSONAL,
  accountType: "organization",
  approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 2 },
};

describe("the organization discount at checkout", () => {
  it("draws the discount in pesos as its own line, and never GRIDGO's fee", async () => {
    await render(<OrganizationDiscountRow source={{ organizationDiscountMinor: 500 }} />);
    expect(screen.getByText("Organization discount")).toBeTruthy();
    expect(screen.getByText("−₱5.00")).toBeTruthy();
    expect(screen.queryByText(/fee/i)).toBeNull();
  });

  it("draws nothing when there is no discount", async () => {
    await render(<OrganizationDiscountRow source={{ organizationDiscountMinor: 0 }} />);
    expect(screen.queryByTestId("organization-discount-row")).toBeNull();
  });

  it("tells an organization what it saved", async () => {
    useSession.setState({ user: ORGANIZATION });
    await render(<OrganizationSavingsNote source={{ organizationDiscountMinor: 41000 }} />);
    expect(screen.getByText("You've saved ₱410.00 with your Organization account")).toBeTruthy();
    expect(screen.queryByTestId("organization-nudge")).toBeNull();
  });

  it("nudges a personal account to register, once", async () => {
    useSession.setState({ user: PERSONAL });
    await render(<OrganizationSavingsNote source={{}} />);
    expect(screen.getByTestId("organization-nudge")).toBeTruthy();
    expect(screen.getByText("Ordering for a school organization?")).toBeTruthy();
  });

  it("does not nudge while an application is with Operations, or an approved organization", async () => {
    useSession.setState({
      user: { ...PERSONAL, approvalCase: { id: "apc_1", kind: "business_client", status: "pending", version: 1 } },
    });
    await render(<OrganizationSavingsNote source={{}} />);
    expect(screen.queryByTestId("organization-nudge")).toBeNull();
  });
});
