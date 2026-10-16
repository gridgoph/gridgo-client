import { Check } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatTimelineStamp } from "@/lib/relativeTime";
import { currentMilestoneIndex, type Milestone } from "@/lib/tracking";

/**
 * The six steps as one bar: done in ink, the current step in the stepper's
 * yellow, the rest as outline. Read aloud as the step it has reached, because
 * a row of coloured segments says nothing to a screen reader.
 */
export function MilestoneRail({ milestones }: { milestones: Milestone[] }) {
  const colors = useThemeColors();
  const current = currentMilestoneIndex(milestones);
  const reached = milestones[current];

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        reached
          ? `Delivery step ${current + 1} of ${milestones.length}: ${reached.label}`
          : "Delivery not started"
      }
      accessibilityValue={{ min: 0, max: milestones.length, now: current + 1 }}
      className="flex-row gap-1"
    >
      {milestones.map((milestone, index) => (
        <View
          key={milestone.code}
          className="h-1.5 flex-1 rounded-pill"
          // Not `outline` for the steps ahead: in Dark it is within a shade of
          // the panel, and the bar would read as two steps long.
          style={
            index === current
              ? { backgroundColor: colors.actionYellow }
              : index < current
                ? { backgroundColor: colors.accent }
                : { backgroundColor: colors.textMuted, opacity: 0.35 }
          }
        />
      ))}
    </View>
  );
}

/**
 * Every step with the time it happened.
 *
 * A step the rider's phone never recorded — an older app, or one skipped on
 * the way — is drawn as passed with no time, never a guessed one.
 */
export function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  const colors = useThemeColors();
  const current = currentMilestoneIndex(milestones);

  return (
    <View>
      {milestones.map((milestone, index) => {
        const done = milestone.status !== "pending";
        const isCurrent = index === current;
        const last = index === milestones.length - 1;
        const when = milestone.at
          ? formatTimelineStamp(milestone.at)
          : milestone.status === "passed"
            ? "Time not recorded"
            : null;
        return (
          <View
            key={milestone.code}
            accessible
            accessibilityLabel={`${milestone.label}. ${
              done ? (isCurrent ? "Current step" : "Done") : "Not yet"
            }${when ? `. ${when}` : ""}`}
            className="flex-row gap-3"
          >
            <View className="items-center" style={{ width: 24 }}>
              <View
                className="h-6 w-6 items-center justify-center rounded-pill"
                style={
                  done
                    ? {
                        backgroundColor: isCurrent ? colors.actionYellow : colors.accent,
                      }
                    : {
                        borderWidth: 2,
                        borderColor: colors.textMuted,
                        backgroundColor: colors.surface,
                      }
                }
              >
                {done ? (
                  <Check
                    size={14}
                    strokeWidth={3}
                    color={isCurrent ? colors.actionYellowOn : colors.accentOn}
                    aria-hidden
                  />
                ) : null}
              </View>
              {last ? null : (
                <View
                  className="w-0.5 flex-1"
                  style={{
                    backgroundColor: index < current ? colors.accent : colors.textMuted,
                    opacity: index < current ? 1 : 0.35,
                    minHeight: 12,
                  }}
                />
              )}
            </View>
            <View className={last ? "flex-1" : "flex-1 pb-4"}>
              <Text
                className={
                  done
                    ? isCurrent
                      ? "text-body font-bold text-text-primary"
                      : "text-body font-medium text-text-primary"
                    : "text-body text-text-muted"
                }
              >
                {milestone.label}
              </Text>
              {when ? <Text className="text-caption text-text-muted">{when}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
