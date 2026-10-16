import { Clock } from "lucide-react-native";
import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { REVIEW_DELAYED, type ReviewScheduleView } from "@/lib/operatingHours";
import { readyByDate } from "@/lib/readyTime";

type Props = {
  view: ReviewScheduleView;
  /**
   * `checkout`: before the order exists, so the run starts with "now".
   * `order`: placed, so it starts at the review.
   */
  variant: "checkout" | "order";
  /** "Mon–Sat · 8:00 AM – 5:00 PM", from `GET /settings`. */
  hours?: string[] | null;
  /** "Closed 25–26 Dec", said when a closure is what delayed the review. */
  closures?: string[];
};

type Stop = { key: string; label: string; value: string; detail?: string | null; current?: boolean };

/**
 * When GRIDGO looks at the artwork, and what that means for the date
 * (gridgo-api#203).
 *
 * Out of hours, an order placed at 9 PM is not looked at until morning, and
 * every date GRIDGO gives already counts that. Said as a short run of stops —
 * now, review, ready by — because it is a sequence and a client reads it as
 * one: what happens next, then when it is done. Every instant is the API's;
 * this only draws them.
 *
 * Info, never warning: being closed is nothing the client did wrong, and
 * paying is not held back by it. A closure that delays the review is the one
 * thing worth a warning chip, beside the words that say so.
 */
export function ReviewScheduleCard({ view, variant, hours, closures = [] }: Props) {
  const colors = useThemeColors();
  const readyBy = readyByDate(view.readyBy);

  const title =
    variant === "checkout"
      ? view.closed
        ? "GRIDGO is closed right now"
        : "Your artwork review is delayed"
      : "When GRIDGO reviews your artwork";
  const body =
    variant === "checkout"
      ? view.closed
        ? "You can still place your order and pay. GRIDGO checks your artwork when it opens."
        : "A GRIDGO closure moves the artwork review. You can still place your order and pay."
      : view.delayed
        ? "A GRIDGO closure moved your review. Your ready-by date stays the same."
        : "GRIDGO is closed now. Your order is in, and nothing more is needed from you.";

  const stops: Stop[] = [
    ...(variant === "checkout"
      ? [{ key: "now", label: "Place your order and pay", value: "Now", current: true }]
      : []),
    {
      key: "review",
      label: "Artwork review",
      value: capitalise(view.reviewAt) ?? "When GRIDGO opens",
      detail: view.length ? `${capitalise(view.length)}, during opening hours` : null,
    },
    {
      key: "ready",
      // Before the order exists it is an estimate; once placed it is GRIDGO's
      // promise, and a review delay never moves it.
      label: variant === "checkout" ? "Ready by, estimated" : "Ready by",
      value: readyBy ?? "GRIDGO confirms after review",
      detail: readyBy ? "Counts the review, printing and delivery" : null,
    },
  ];

  return (
    <View className="gg-card gap-4" testID="review-schedule">
      <View className="flex-row gap-3" accessible accessibilityLabel={`${title}. ${body}`}>
        <View aria-hidden className="h-10 w-10 shrink-0 items-center justify-center rounded-pill">
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-pill"
            style={{ backgroundColor: colors.info, opacity: 0.14 }}
          />
          <Clock size={19} color={colors.info} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-bold text-text-primary" accessibilityRole="header">
            {title}
          </Text>
          <Text className="text-body text-text-secondary">{body}</Text>
        </View>
      </View>

      {view.delayed ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusChip tone="warning" icon="clock" label={REVIEW_DELAYED} />
          {closures.map((line) => (
            <Text key={line} className="text-caption text-text-secondary">
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <View>
        {stops.map((stop, index) => (
          <StopRow key={stop.key} stop={stop} last={index === stops.length - 1} />
        ))}
      </View>

      {hours?.length ? (
        <Text className="text-caption text-text-muted">
          GRIDGO reviews artwork {hours.join("; ")}, Davao time.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One stop on the run: a dot, the thread to the next one, and the words.
 * Stacked rather than label-left value-right, so a 1.3 text scale wraps a
 * line instead of squeezing two columns.
 */
function StopRow({ stop, last }: { stop: Stop; last: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      className="flex-row gap-3"
      accessible
      accessibilityLabel={[stop.label, stop.value, stop.detail].filter(Boolean).join(", ")}
    >
      <View aria-hidden className="w-3 items-center">
        <View
          style={{
            marginTop: 5,
            width: 12,
            height: 12,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: stop.current ? colors.textPrimary : colors.info,
            backgroundColor: stop.current ? colors.textPrimary : colors.surface,
          }}
        />
        {last ? null : (
          <View style={{ flex: 1, width: 2, marginVertical: 3, backgroundColor: colors.textMuted, opacity: 0.4 }} />
        )}
      </View>
      <View className={last ? "min-w-0 flex-1" : "min-w-0 flex-1 pb-4"}>
        <Text className="text-caption text-text-muted">{stop.label}</Text>
        <Text className="text-body-lg font-medium text-text-primary">{stop.value}</Text>
        {stop.detail ? <Text className="text-caption text-text-secondary">{stop.detail}</Text> : null}
      </View>
    </View>
  );
}

function capitalise(value: string | null): string | null {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
}
