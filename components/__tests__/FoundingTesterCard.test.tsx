import { fireEvent, render, screen } from "@testing-library/react-native";

import { FoundingTesterCard, FoundingTesterChip } from "@/components/FoundingTesterCard";
import type { FoundingTester } from "@/lib/api";
import { foundingTesterView } from "@/lib/foundingTester";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

const NONE = { added: false, placed: false, tracked: false, received: false, rated: false };
const CONTEXT = { orders: [], cartOpen: true, startHref: "/request/category" };

function path(missions: FoundingTester["missions"], rewardStatus = "pending") {
  const view = foundingTesterView({
    foundingTester: {
      eligible: true,
      label: null,
      awardedAt: null,
      missions,
      completedCount: Object.values(missions).filter(Boolean).length,
      rewardStatus,
      reward: null,
    },
  });
  if (view?.kind !== "missions") throw new Error("expected the path");
  return view;
}

beforeEach(() => mockPush.mockClear());

it.each([
  [NONE, 0],
  [{ ...NONE, added: true }, 1],
  [{ ...NONE, added: true, placed: true }, 2],
  [{ ...NONE, added: true, placed: true, tracked: true, received: true }, 4],
])("draws the five steps with %j as %i of 5 done, each finished step marked Done", async (missions, count) => {
  await render(<FoundingTesterCard view={path(missions)} context={CONTEXT} />);

  expect(screen.getByText("Become a Founding Tester")).toBeTruthy();
  expect(screen.getByText(`${count} of 5 done`)).toBeTruthy();
  for (const title of ["Add an item to your cart", "Place your order", "Track your order", "Receive your order", "Complete the survey"]) {
    expect(screen.getByText(title)).toBeTruthy();
  }
  // Every tick is said in words as well as drawn.
  expect(screen.queryAllByText("Done")).toHaveLength(count);
  expect(screen.getByText(/a ₱15 voucher, valid 30 days/)).toBeTruthy();
  expect(screen.getByLabelText(new RegExp(`^Founding Tester steps, ${count} of 5 done`))).toBeTruthy();
  // Exactly one step is a button: the next one.
  expect(screen.getAllByRole("button", { name: /next step$/ })).toHaveLength(1);
  expect(screen.getByLabelText(`Step ${count + 1} of 5, ${path(missions).steps[count].title}, next step`, { exact: false })).toBeTruthy();
});

it("says only the next step's how-it-counts, and quiets the ones after it", async () => {
  await render(<FoundingTesterCard view={path({ ...NONE, added: true })} context={CONTEXT} />);

  expect(screen.getByText("Counts once GRIDGO confirms your payment")).toBeTruthy();
  expect(screen.queryByText("Counts when you open your paid order to follow it")).toBeNull();
  expect(screen.getByLabelText("Step 3 of 5, Track your order, not done yet")).toBeTruthy();
  expect(screen.getByLabelText("Step 1 of 5, Add an item to your cart, done")).toBeTruthy();
});

it("says a finished path is waiting on approval or budget, with no step left to press", async () => {
  await render(
    <FoundingTesterCard
      view={path({ added: true, placed: true, tracked: true, received: true, rated: true }, "paused")}
      context={CONTEXT}
    />,
  );

  expect(screen.getByText("5 of 5 done")).toBeTruthy();
  expect(screen.getByText("Reward awaiting approval/budget")).toBeTruthy();
  expect(screen.queryByText(/a ₱15 voucher, valid 30 days/)).toBeNull();
  expect(screen.queryAllByRole("button", { name: /next step$/ })).toHaveLength(0);
  // The way to invite a friend is still there.
  expect(screen.getByRole("button", { name: "Invite a friend" })).toBeTruthy();
});

it("draws the earned label as a chip", async () => {
  await render(<FoundingTesterChip label="Founding Tester" />);
  expect(screen.getByText("Founding Tester")).toBeTruthy();
});

// Last: one press per file (AGENTS.md § "Running and testing").
it("opens what completes the next step — checkout, with a basket open", async () => {
  await render(<FoundingTesterCard view={path({ ...NONE, added: true })} context={CONTEXT} />);

  fireEvent.press(screen.getByRole("button", { name: /^Go to checkout\. Step 2 of 5, Place your order, next step$/ }));
  expect(mockPush).toHaveBeenCalledWith("/checkout");
});
