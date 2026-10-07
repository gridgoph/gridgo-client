import { render, screen } from "@testing-library/react-native";
import { LatestProgressCard } from "@/components/LatestProgressCard";
import type { Order } from "@/lib/api";
import { useOrderSections, ORDER_SECTIONS_FOLDED } from "@/store/orderSections";
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(),
}));
it("renders the packing photo as a distinct update with an accessible photo label", async () => {
  useOrderSections.setState({
    open: { ...ORDER_SECTIONS_FOLDED, history: true },
  });
  const order = {
    id: "job",
    state: "production",
    fulfillmentMode: "delivery",
    payments: {},
    timeline: [
      {
        at: "2026-10-07T01:00:00Z",
        state: "production",
        note: "In production",
      },
    ],
    productionProgress: { status: "photos_available", photos: [] },
    packingProgress: {
      status: "photos_available",
      photos: [
        {
          fileId: "packed",
          contentType: "image/jpeg",
          at: "2026-10-07T02:00:00Z",
          downloadUrl: "https://storage.test/packed.jpg",
          downloadUrlExpiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      ],
    },
  } as unknown as Order;
  await render(<LatestProgressCard order={order} />);
  expect(
    screen.getAllByText("Your order is packed and waiting for the rider.")
      .length,
  ).toBeGreaterThan(0);
  expect(screen.getByTestId("sample-photo-image").props.source.uri).toBe(
    "https://storage.test/packed.jpg",
  );
  expect(screen.getByLabelText(/^Open Packing photo/)).toBeTruthy();
});
