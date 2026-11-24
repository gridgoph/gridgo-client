import { act, render, screen } from "@testing-library/react-native";

import { GroupOrderCard } from "@/components/express/GroupOrderCard";
import { useExpress } from "@/store/express";
import { useExpressGroup } from "@/store/expressGroup";
import { useSession } from "@/store/session";
import { groupFixture } from "@/test/expressGroup";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

beforeEach(() => {
  useExpressGroup.getState().reset();
  useExpress.getState().reset();
  useSession.setState({ user: { id: "u_host" } as never });
});

// gridgo-client#450: every group entry is hidden where GRIDGO does not offer groups.
it("draws nothing until GRIDGO says it offers groups", async () => {
  useExpressGroup.setState({ available: "off", mine: [] });
  await render(<GroupOrderCard />);
  expect(screen.queryByText("Group order")).toBeNull();
});

it("offers a new group, or the one already open with its time left", async () => {
  useExpressGroup.setState({ available: "on", mine: [] });
  await render(<GroupOrderCard />);
  expect(screen.getByText("Group order")).toBeTruthy();
  await act(async () => {
    useExpressGroup.setState({ mine: [groupFixture({ closesAt: new Date(Date.now() + 10 * 60_000).toISOString() })] });
  });
  expect(await screen.findByText("Your group order")).toBeTruthy();
  expect(screen.getByText(/^(9|10):\d\d left to add files$/)).toBeTruthy();
});

it("stays out of a member's own group files", async () => {
  useExpressGroup.setState({ available: "on", mine: [] });
  useExpress.setState({ group: { id: "grp_1" } } as never);
  await render(<GroupOrderCard />);
  expect(screen.queryByText("Group order")).toBeNull();
});
