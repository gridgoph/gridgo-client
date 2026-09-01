import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OrderFilterBar } from "@/components/OrderFilterBar";
import type { OrderFilter, OrderSort } from "@/lib/orderList";

/**
 * The controls a client uses to find one job among many.
 *
 * What is asserted here is what went wrong on the real screen: the sort was an
 * unmarked pair of arrows sitting on top of the last filter chip, so the row
 * read as clipped and the control could only be understood by pressing it.
 */
function Harness({
  counts = { all: 15, needs_you: 3, payment_due: 0, active: 12, done: 3 },
  shown = 15,
  onSort,
}: {
  counts?: Record<OrderFilter, number>;
  shown?: number;
  onSort?: (value: OrderSort) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [sort, setSort] = useState<OrderSort>("recent");

  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <OrderFilterBar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        counts={counts}
        sort={sort}
        onSortChange={(value) => {
          setSort(value);
          onSort?.(value);
        }}
        shown={shown}
      />
    </SafeAreaProvider>
  );
}

describe("OrderFilterBar", () => {
  it("says how the list is ordered rather than leaving it to be guessed", async () => {
    await render(<Harness />);
    expect(screen.getByText("Recently updated")).toBeTruthy();
  });

  it("offers every order in words, and each says what it does", async () => {
    await render(<Harness />);

    fireEvent.press(screen.getByLabelText(/^Sort: recently updated/i));

    // The sheet mounts on the state change, so wait for it rather than
    // asserting on the frame the press happened in.
    expect(await screen.findByText("Newest first")).toBeTruthy();
    expect(screen.getByText("Oldest first")).toBeTruthy();
    expect(screen.getByText("Highest price")).toBeTruthy();
    expect(screen.getByText("The job you sent most recently")).toBeTruthy();
  });

  it("changes the order and shows the new one on the closed control", async () => {
    const onSort = jest.fn();
    await render(<Harness onSort={onSort} />);

    fireEvent.press(screen.getByLabelText(/^Sort: recently updated/i));
    fireEvent.press(await screen.findByLabelText(/^Highest price\./));

    expect(onSort).toHaveBeenCalledWith("price");
    // The closed control carries the new order, so the screen never has to be
    // reopened to find out what it is sorted by.
    expect(await screen.findByLabelText(/^Sort: highest price/i)).toBeTruthy();
  });

  it("carries every filter with its count, empty ones included", async () => {
    await render(<Harness />);

    // A filter with nothing behind it stays on the row: hiding it would shift
    // the other chips under the thumb every time a job changed state.
    expect(screen.getByLabelText("Payment due, 0 jobs")).toBeTruthy();
    expect(screen.getByLabelText("Needs you, 3 jobs")).toBeTruthy();
    expect(screen.getByLabelText("Done, 3 jobs")).toBeTruthy();
  });

  it("counts what is actually on screen, in the client's own words", async () => {
    const many = await render(<Harness shown={3} />);
    expect(screen.getByText("3 jobs")).toBeTruthy();
    many.unmount();

    await render(<Harness shown={1} />);
    expect(screen.getByText("1 job")).toBeTruthy();
  });
});
