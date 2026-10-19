import { render, screen } from "@testing-library/react-native";

import { FoundingTesterCard, FoundingTesterChip } from "@/components/FoundingTesterCard";
import { foundingTesterView } from "@/lib/foundingTester";

function missions(placed: boolean, received: boolean, rated: boolean) {
  const view = foundingTesterView({
    foundingTester: {
      eligible: true,
      label: null,
      awardedAt: null,
      missions: { placed, received, rated },
      completedCount: [placed, received, rated].filter(Boolean).length,
      rewardStatus: "pending",
      reward: null,
    },
  });
  if (view?.kind !== "missions") throw new Error("expected missions");
  return view;
}

it.each([
  [false, false, false, 0],
  [true, false, false, 1],
  [true, true, false, 2],
  [true, true, true, 3],
])("draws %s/%s/%s as %i of 3 done, each finished mission marked Done", async (placed, received, rated, count) => {
  await render(<FoundingTesterCard view={missions(placed, received, rated)} />);

  expect(screen.getByText("Become a Founding Tester")).toBeTruthy();
  expect(screen.getByText(`${count} of 3 done`)).toBeTruthy();
  expect(screen.getByText("Place your first order")).toBeTruthy();
  expect(screen.getByText("Receive it")).toBeTruthy();
  expect(screen.getByText("Rate it")).toBeTruthy();
  // Every tick is said in words as well as drawn.
  expect(screen.queryAllByText("Done")).toHaveLength(count);
  expect(screen.getByText(/a ₱15 voucher, valid 30 days/)).toBeTruthy();
  // One announcement for the whole card, carrying the count and each step.
  expect(screen.getByLabelText(new RegExp(`^Founding Tester missions, ${count} of 3 done`))).toBeTruthy();
});

it("says how the next mission counts until it does", async () => {
  await render(<FoundingTesterCard view={missions(true, false, false)} />);

  expect(screen.queryByText("Counts once GRIDGO confirms your payment")).toBeNull();
  expect(screen.getByText("Counts when it is delivered to you or you pick it up")).toBeTruthy();
  expect(screen.getByText("Counts when you send the short survey after it arrives")).toBeTruthy();
});

it("draws the earned label as a chip", async () => {
  await render(<FoundingTesterChip label="Founding Tester" />);
  expect(screen.getByText("Founding Tester")).toBeTruthy();
});
