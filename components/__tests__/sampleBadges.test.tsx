import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";

import { OrderCard } from "@/components/OrderCard";
import { SampleLinkCard } from "@/components/SampleLinkCard";
import { artworkOrder } from "@/test/artworkFixtures";
import { sampleOrderFields } from "@/test/sampleBatch";

/**
 * A paid sample and the batch made from it are tagged on the Orders list and
 * linked to each other on the order (gridgo-api#222).
 */

afterEach(async () => {
  await cleanup();
});

describe("OrderCard sample badges", () => {
  it("tags a sample", async () => {
    await render(<OrderCard order={artworkOrder(sampleOrderFields("sample"))} onPress={() => undefined} />);
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(screen.getByLabelText(/^Trade fair flyers, Sample, /)).toBeTruthy();
  });

  it("tags a batch from a sample", async () => {
    await render(<OrderCard order={artworkOrder(sampleOrderFields("batch"))} onPress={() => undefined} />);
    expect(screen.getByText("Batch from sample")).toBeTruthy();
  });

  it("tags nothing on an ordinary order", async () => {
    await render(<OrderCard order={artworkOrder()} onPress={() => undefined} />);
    expect(screen.queryByText("Sample")).toBeNull();
    expect(screen.queryByText("Batch from sample")).toBeNull();
  });
});

describe("SampleLinkCard", () => {
  it("is absent on an ordinary order", async () => {
    await render(<SampleLinkCard order={artworkOrder()} onOpenOrder={jest.fn()} onOpenSample={jest.fn()} />);
    expect(screen.queryByTestId("sample-link-card")).toBeNull();
  });

  it("links a delivered sample to its decision and its batch order", async () => {
    await render(
      <SampleLinkCard
        order={artworkOrder(sampleOrderFields("sample", { state: "completed", batchOrderId: "ord_batch" }))}
        onOpenOrder={jest.fn()}
        onOpenSample={jest.fn()}
      />,
    );
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(screen.getByText("You approved this sample and ordered the batch.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open the sample record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open the batch order" })).toBeTruthy();
  });

  it("asks for a decision on an arrived sample", async () => {
    await render(
      <SampleLinkCard
        order={artworkOrder(sampleOrderFields("sample", { state: "issue_window_open" }))}
        onOpenOrder={jest.fn()}
        onOpenSample={jest.fn()}
      />,
    );
    expect(screen.getByText("Your sample has arrived. Approve it or say what is wrong.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check your sample" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open the batch order" })).toBeNull();
  });

  it("links a batch back to its sample", async () => {
    const onOpenOrder = jest.fn();
    await render(
      <SampleLinkCard order={artworkOrder(sampleOrderFields("batch"))} onOpenOrder={onOpenOrder} onOpenSample={jest.fn()} />,
    );
    expect(screen.getByText("Batch from sample")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Open the sample order" }));
    expect(onOpenOrder).toHaveBeenCalledWith("ord_sample");
  });
});
