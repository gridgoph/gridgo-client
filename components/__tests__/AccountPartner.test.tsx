import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { View } from "react-native";

import { AccountPartnerBadge, AccountPartnerRows } from "@/components/organization/AccountPartner";
import { ApiError } from "@/lib/api";
import { useSession } from "@/store/session";
import { ORG_USER, PARTNERSHIP } from "@/test/organizationMembers";
import { officerApi as api, signInOfficer } from "@/test/organizationScreens";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/organizationMembersApi");

const ui = (
  <View>
    <AccountPartnerBadge />
    <AccountPartnerRows />
  </View>
);

beforeEach(() => {
  jest.clearAllMocks();
  signInOfficer();
});

it("shows the badge and both rows with their counts", async () => {
  await render(ui);
  expect(await screen.findByText("GRIDGO Partner Org")).toBeOnTheScreen();
  expect(screen.getByText("47 active · 2 requests to answer · SY 2026-27")).toBeOnTheScreen();
  expect(screen.getByText("18 members ordered · 2 liquidation records")).toBeOnTheScreen();
});

it("shows no badge when the partnership does not have one", async () => {
  api.getPartnership.mockResolvedValue({ ...PARTNERSHIP, benefits: { ...PARTNERSHIP.benefits, badge: false } });
  await render(ui);
  expect(await screen.findByText("Members")).toBeOnTheScreen();
  await waitFor(() => expect(screen.getByText(/liquidation records/)).toBeOnTheScreen());
  expect(screen.queryByText("GRIDGO Partner Org")).toBeNull();
});

it("shows nothing to an organization that is not a partner", async () => {
  api.getMembersSummary.mockRejectedValue(new ApiError(403, { error: "organization_partner_required" }));
  api.getPartnership.mockRejectedValue(new ApiError(403, { error: "organization_partner_required" }));
  await render(ui);
  await waitFor(() => expect(api.getPartnership).toHaveBeenCalled());
  expect(screen.queryByText("Members")).toBeNull();
});

it("asks GRIDGO nothing for a personal account", async () => {
  useSession.setState({ user: { ...ORG_USER, id: "u_person", accountType: "individual" } });
  await render(ui);
  expect(api.getMembersSummary).not.toHaveBeenCalled();
  expect(screen.queryByText("Members")).toBeNull();
});

it("opens Members", async () => {
  await render(ui);
  await fireEvent.press(await screen.findByLabelText("Members"));
  expect(mockPush).toHaveBeenCalledWith("/organization/members");
});
