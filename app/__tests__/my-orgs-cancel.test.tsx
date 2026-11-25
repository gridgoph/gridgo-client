import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { MembershipCard } from "@/components/MembershipCard";
import { useMemberships } from "@/store/memberships";
import { membership } from "@/test/membershipFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("@/lib/membershipsApi");

// Two presses, alone in its file.
it("cancels a waiting request once it is confirmed", async () => {
  const end = jest.fn(async () => true);
  useMemberships.setState({ end });
  await renderScreen(<MembershipCard membership={membership({ status: "pending" })} />);
  fireEvent.press(screen.getByText("Cancel request"));
  await screen.findByText("Cancel your request to Sample Guild?");
  fireEvent.press(screen.getByLabelText("Cancel request"));
  await waitFor(() => expect(end).toHaveBeenCalledWith("mem_1"));
});
