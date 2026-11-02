/**
 * One shop, two products on two dates (gridgo-api#275,
 * `docs/SHOP_DELIVERIES_API.md`): by default one delivery by the earlier date,
 * or — once the client ticks "Deliver separately" — two deliveries under the
 * same label, each with its own delivery fee.
 */
import type { Cart, CartGroup, CartLineRecord } from "@/lib/api";
import { DATE_EARLY, DATE_LATE, multiCart } from "@/test/multiShopFixtures";

export const SHOP_DATES = [DATE_EARLY, DATE_LATE] as const;

function shopLines(groupIds: [string, string]): CartLineRecord[] {
  const base = multiCart(2);
  return base.lines.map((line, index) => ({
    ...line,
    groupId: groupIds[index],
    deadline: SHOP_DATES[index],
    listing: { name: index === 0 ? "Flyers" : "Tarpaulin Print" } as CartLineRecord["listing"],
  }));
}

/** Both products in one delivery, due by the earlier date. */
export function combinedShopCart(): Cart {
  const base = multiCart(2);
  const group: CartGroup = {
    id: "cline_0",
    label: "Shop A",
    deadline: DATE_EARLY,
    lineIds: ["cline_0", "cline_1"],
    clientItemSubtotalMinor: 63800,
    deliveryFeeMinor: 2500,
    totalMinor: 66300,
    deliveryNumber: 1,
    shopDeliveryCount: 1,
    separateDelivery: false,
    canDeliverSeparately: true,
  };
  return {
    ...base,
    deadline: DATE_EARLY,
    isMultiGroup: false,
    groupCount: 1,
    shopCount: 1,
    lines: shopLines(["cline_0", "cline_0"]),
    groups: [group],
    clientQuote: {
      ...base.clientQuote!,
      clientItemSubtotalMinor: 63800,
      deliveryLines: [
        {
          groupId: "cline_0",
          label: "Shop A",
          deliveryNumber: 1,
          shopDeliveryCount: 1,
          deadline: DATE_EARLY,
          lineIds: ["cline_0", "cline_1"],
          distanceZone: { key: "nearby", label: "Nearby" },
          deliveryFeeMinor: 2500,
        },
      ],
      deliveryFeeMinor: 2500,
      totalMinor: 66300,
      downpaymentPercent: 75,
      downpaymentMinor: 49725,
      balanceMinor: 16575,
    },
  };
}

/** The same shop sent separately: two deliveries, one per date, each with its own fee. */
export function splitShopCart(): Cart {
  const base = multiCart(2);
  const fees = [2500, 5000];
  const items = [44000, 19800];
  const groups: CartGroup[] = SHOP_DATES.map((deadline, index) => ({
    id: `cline_${index}`,
    label: "Shop A",
    deadline,
    lineIds: [`cline_${index}`],
    clientItemSubtotalMinor: items[index],
    deliveryFeeMinor: fees[index],
    totalMinor: items[index] + fees[index],
    deliveryNumber: index + 1,
    shopDeliveryCount: 2,
    separateDelivery: true,
    canDeliverSeparately: true,
  }));
  return {
    ...base,
    deadline: null,
    isMultiGroup: true,
    groupCount: 2,
    shopCount: 1,
    lines: shopLines(["cline_0", "cline_1"]),
    groups,
    clientQuote: {
      ...base.clientQuote!,
      deliveryLines: groups.map((group, index) => ({
        groupId: group.id,
        label: group.label,
        deliveryNumber: group.deliveryNumber,
        shopDeliveryCount: group.shopDeliveryCount,
        deadline: group.deadline,
        lineIds: group.lineIds,
        distanceZone: { key: "nearby", label: "Nearby" },
        deliveryFeeMinor: fees[index],
      })),
      deliveryFeeMinor: 7500,
      totalMinor: 71300,
      downpaymentPercent: 100,
      downpaymentMinor: 71300,
      balanceMinor: 0,
    },
  };
}
