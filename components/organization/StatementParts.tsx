import { router } from "expo-router";
import { BadgePercent, ChevronRight, ReceiptText } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type OrganizationStatement, type StatementRow } from "@/lib/api";
import {
  manilaDay,
  officerOfRecordName,
  orderCountLabel,
  periodRange,
  PERIOD_OPTIONS,
  savedLine,
  STATEMENT_NOTICE,
  type PeriodKind,
} from "@/lib/organization";
import { orderReference } from "@/lib/orderReference";

/** This month / This quarter / Custom — one control, monochrome. */
export function PeriodSelector({
  kind,
  customLabel,
  onChange,
}: {
  kind: PeriodKind;
  /** "1 Sep – 15 Oct 2026" once a custom range is set. */
  customLabel: string | null;
  onChange: (kind: PeriodKind) => void;
}) {
  return (
    <View className="gap-2">
      <View
        className="flex-row rounded-field border border-outline bg-surface-variant p-1"
        accessibilityRole="tablist"
      >
        {PERIOD_OPTIONS.map((option) => {
          const selected = option.kind === kind;
          return (
            <Pressable
              key={option.kind}
              onPress={() => onChange(option.kind)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              className={
                selected
                  ? "min-h-11 flex-1 items-center justify-center rounded-md bg-surface-high"
                  : "min-h-11 flex-1 items-center justify-center rounded-md"
              }
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <Text
                className={
                  selected ? "text-button text-text-primary" : "text-body text-text-muted"
                }
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {kind === "custom" && customLabel ? (
        <Pressable
          onPress={() => router.push("/statement-period")}
          accessibilityRole="button"
          accessibilityLabel={`Custom period ${customLabel}. Change dates`}
          className="gg-touch flex-row items-center justify-between"
        >
          <Text className="text-body text-text-secondary">{customLabel}</Text>
          <Text className="text-button text-text-primary underline">Change dates</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The statement's head: what the organization spent in the period, how many
 * orders, and what the organization discount saved — drawn as a slip, with a
 * perforation above the line that says what it is not. "Not a tax document"
 * sits on the slip itself, where a treasurer photographing it cannot crop it
 * off by accident.
 */
export function StatementSummary({ statement }: { statement: OrganizationStatement }) {
  const colors = useThemeColors();
  const period = periodRange(statement.period.from, statement.period.to);
  return (
    <View className="overflow-hidden rounded-card border border-outline bg-surface" testID="statement-summary">
      <View className="gap-4 p-4">
        <View className="flex-row items-center gap-2">
          <ReceiptText size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <Text className="text-caption text-text-muted">Spend statement · {period}</Text>
        </View>
        <View className="gap-1" accessible accessibilityLabel={`Total spend ${formatPhp(statement.totalSpendMinor)}`}>
          <Text className="text-display text-text-primary">{formatPhp(statement.totalSpendMinor)}</Text>
          <Text className="text-body text-text-secondary">Total spend</Text>
        </View>
        <View className="flex-row border-t border-outline-subtle pt-4">
          <View className="flex-1 gap-1" accessible accessibilityLabel={orderCountLabel(statement.orderCount)}>
            <Text className="text-h3 text-text-primary">{statement.orderCount}</Text>
            <Text className="text-caption text-text-muted">
              {statement.orderCount === 1 ? "Order" : "Orders"}
            </Text>
          </View>
          <View
            className="flex-1 gap-1"
            accessible
            accessibilityLabel={`Discount earned ${formatPhp(statement.discountEarnedMinor)}`}
          >
            <Text className="text-h3 text-text-primary">{formatPhp(statement.discountEarnedMinor)}</Text>
            <Text className="text-caption text-text-muted">Discount earned</Text>
          </View>
        </View>
        {statement.discountEarnedMinor > 0 ? (
          <View className="flex-row items-center gap-2">
            <BadgePercent size={16} color={colors.success} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-success">
              {savedLine(statement.discountEarnedMinor)}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        className="border-t border-dashed border-outline bg-surface-variant px-4 py-3"
        accessible
        accessibilityLabel={statement.notice || STATEMENT_NOTICE}
      >
        <Text className="text-body font-medium text-text-primary">Not a tax document</Text>
        <Text className="text-caption text-text-secondary">
          {(statement.notice || STATEMENT_NOTICE).replace(/^Not a tax document\.\s*/, "")}
        </Text>
      </View>
    </View>
  );
}

/**
 * The orders behind the totals, as a ledger a phone can hold: six columns do
 * not fit 390 points, so each order is one row with the date leading, the
 * amount trailing, and the order, invoice and officer stacked under the
 * product — every column of the export, none of them truncated.
 */
export function StatementLedger({ rows }: { rows: StatementRow[] }) {
  return (
    <View className="gg-card-flush" testID="statement-ledger">
      <View className="flex-row gap-3 border-b border-outline px-4 py-2">
        <Text className="w-14 text-caption text-text-muted">Date</Text>
        <Text className="min-w-0 flex-1 text-caption text-text-muted">Order</Text>
        <Text className="text-caption text-text-muted">Amount</Text>
      </View>
      {rows.map((row, index) => (
        <LedgerRow key={row.orderId} row={row} last={index === rows.length - 1} />
      ))}
    </View>
  );
}

function LedgerRow({ row, last }: { row: StatementRow; last: boolean }) {
  const colors = useThemeColors();
  const officer = officerOfRecordName(row.officerOfRecord);
  const reference = orderReference(row.orderId) ?? row.orderId;
  return (
    <Pressable
      onPress={() => router.push(`/order/${row.orderId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${manilaDay(row.date) ?? row.date}, ${row.product || "Order"}, ${formatPhp(row.amountMinor)}`}
      accessibilityHint="Opens this order"
      className={last ? "flex-row gap-3 px-4 py-3" : "flex-row gap-3 border-b border-outline-subtle px-4 py-3"}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text className="w-14 text-body text-text-secondary">{manilaDay(row.date, { year: false }) ?? row.date}</Text>
      <View className="min-w-0 flex-1 gap-0.5">
        {/* Product and amount share the first line; the references below get
            the column's whole width, so an invoice number never breaks. */}
        <View className="flex-row items-start gap-3">
          <Text className="min-w-0 flex-1 text-body font-medium text-text-primary" numberOfLines={2}>
            {row.product || "Print order"}
          </Text>
          <View className="items-end">
            <Text className="text-body font-medium text-text-primary">{formatPhp(row.amountMinor)}</Text>
            {row.organizationDiscountMinor > 0 ? (
              <Text className="text-caption text-success">−{formatPhp(row.organizationDiscountMinor)}</Text>
            ) : null}
          </View>
        </View>
        <Text className="text-caption text-text-muted">{reference}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          Invoice {row.invoiceNumber || "—"}
        </Text>
        <Text className="text-caption text-text-muted">Officer: {officer ?? "Not recorded"}</Text>
      </View>
      <View className="justify-center">
        <ChevronRight size={16} color={colors.textMuted} aria-hidden />
      </View>
    </Pressable>
  );
}
