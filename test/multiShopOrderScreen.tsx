/**
 * Shared set-up for the multi-shop order view tests: one shop group's order
 * and the basket behind it. The mocks themselves stay in each test file,
 * because `jest.mock` is hoisted per file.
 */
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Order } from "@/lib/api";

export function groupOrder(patch: Partial<Order> = {}): Order {
  return {
    id: "ord_b",
    basketId: "bsk_1",
    groupLabel: "Shop B",
    basketDeadline: "2026-10-26T08:00:00.000Z",
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    state: "production",
    productId: "",
    title: "Custom apparel",
    quantity: 1,
    size: "",
    material: "",
    deadline: "2026-10-26T08:00:00.000Z",
    address: "San Pedro St, Davao City",
    zone: "",
    subtotalMinor: 18000,
    serviceFeeMinor: 1800,
    serviceFeeRateBps: 1000,
    deliveryFeeMinor: 5000,
    totalMinor: 24800,
    downpaymentMinor: 24800,
    balanceMinor: 0,
    downpaymentPercent: 100,
    payments: {
      initial: {
        amountMinor: 24800,
        method: "qr_manual",
        status: "confirmed",
        reference: "1012345678903",
        submittedAt: "2026-10-05T07:00:00.000Z",
        confirmedAt: "2026-10-05T08:00:00.000Z",
      },
      final_online: {
        amountMinor: 0,
        method: "qr_manual",
        status: "not_required",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
    },
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    fulfillmentMode: "delivery",
    createdAt: "2026-10-05T07:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
    timeline: [{ at: "2026-10-05T08:00:00.000Z", state: "production" }],
    ...patch,
  };
}

export function renderPhone(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}
