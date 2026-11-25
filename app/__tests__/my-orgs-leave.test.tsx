import { fireEvent, screen } from "@testing-library/react-native";

import { MembershipCard } from "@/components/MembershipCard";
import { membership } from "@/test/membershipFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("@/lib/membershipsApi");

// One press: its own file.
it("asks before leaving and says what stays", async () => {
  await renderScreen(<MembershipCard membership={membership()} />);
  fireEvent.press(screen.getByText("Leave Sample Guild"));
  expect(await screen.findByText("Leave Sample Guild?")).toBeTruthy();
  expect(screen.getByText(/Your past orders stay as they are/)).toBeTruthy();
  expect(screen.getByText("Stay")).toBeTruthy();
});
