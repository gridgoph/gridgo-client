import type { CancellationQuote } from "@/lib/api";

/**
 * The contract's worked example (gridgo-api `docs/REFUNDS_AND_FAULT_API.md`):
 * shop principal ₱1,000, service fee ₱100, delivery ₱50, all collected.
 * Before production everything comes back; after it the shop keeps its 40%
 * start entitlement and the fee comes back in proportion.
 */
export function cancellationQuote(overrides: Partial<CancellationQuote> = {}): CancellationQuote {
  return {
    policyVersion: "cancellation_quote_v1",
    quoteToken: "quote_after_start",
    beforeProduction: false,
    refund: { principalMinor: 60000, feeMinor: 6000, deliveryMinor: 5000, totalMinor: 71000 },
    ...overrides,
  };
}

export const BEFORE_PRODUCTION_QUOTE = cancellationQuote({
  quoteToken: "quote_before_production",
  beforeProduction: true,
  refund: { principalMinor: 100000, feeMinor: 10000, deliveryMinor: 5000, totalMinor: 115000 },
});
