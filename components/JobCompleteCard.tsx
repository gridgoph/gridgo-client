import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { SpecRow } from "@/components/SpecRow";
import { useThemeColors } from "@/hooks/useTheme";
import type { Issue, Order } from "@/lib/api";
import * as api from "@/lib/api";
import { summarizeJobComplete } from "@/lib/jobComplete";

type Props = {
  order: Order;
};

/**
 * The job, finished.
 *
 * A job under v2 closes itself when the issue window expires, so nothing on
 * the screen used to mark the moment: the chip flipped to "Completed" and the
 * line under the title said "This job is closed." This card is the sentence a
 * person would say instead — it arrived, nothing was wrong with it, it is
 * paid, you are done — followed by the three facts that back the sentence up.
 *
 * It reads the issue list itself so that "nothing reported" is a fact rather
 * than a guess. Until that read answers, and if it fails, the copy says the
 * window closed and stops there; see `lib/jobComplete.ts`.
 *
 * No control. The rating prompt below it is the finished job's one action,
 * and this card is the record it sits under.
 */
export function JobCompleteCard({ order }: Props) {
  const [issues, setIssues] = useState<Issue[] | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listIssues(order.id)
      .then((list) => {
        if (live) setIssues(list);
      })
      .catch(() => {
        if (live) setIssues(null);
      });
    return () => {
      live = false;
    };
  }, [order.id]);

  const summary = summarizeJobComplete(order, issues);

  return (
    <View
      className="gg-card gap-4"
      accessibilityRole="summary"
      accessibilityLabel={`${summary.headline}. ${summary.body}`}
    >
      <View className="flex-row items-center gap-4">
        <CompletedMark size={44} />
        <View className="flex-1 gap-1">
          <Text className="text-h3 text-text-primary">{summary.headline}</Text>
          <Text className="text-body text-text-secondary">{summary.body}</Text>
        </View>
      </View>
      <View>
        {summary.facts.map((fact) => (
          <SpecRow key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------------------
   The mark, arrived
   --------------------------------------------------------------------------- */

/** Circle centres on both axes, and the radius — the GRIDGO mark's own proportions. */
const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;

/** Top-right: the cell the GRIDGO mark lights. */
const LIT_CELL = 2;
/** The right column below it is muted in the mark, never white. */
const MUTED_CELLS = [5, 8];

/**
 * The GRIDGO mark with its job home.
 *
 * `MatchingWait` walks one yellow token round nine quiet dots while a printer
 * is being found, and deliberately never lets the grid fill: a match has no
 * progress to report. A finished job is the other end of that story, so this
 * is the same geometry inked in — every cell solid, the token resting on the
 * top-right cell where the mark lights it. The two share their proportions
 * and nothing else, so neither becomes the logo.
 */
function CompletedMark({ size }: { size: number }) {
  const colors = useThemeColors();
  const radius = (RADIUS / 100) * size;

  return (
    <View
      style={{ width: size, height: size }}
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, cell) => {
        const x = (CENTRES[cell % 3] / 100) * size;
        const y = (CENTRES[Math.floor(cell / 3)] / 100) * size;
        const fill =
          cell === LIT_CELL
            ? colors.actionYellow
            : MUTED_CELLS.includes(cell)
              ? colors.textMuted
              : colors.textPrimary;
        return (
          <View
            key={cell}
            style={{
              position: "absolute",
              left: x - radius,
              top: y - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: radius,
              backgroundColor: fill,
            }}
          />
        );
      })}
    </View>
  );
}
