import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The moment GRIDGO is looking for a printer.
 *
 * GRIDGO's mark is a 3x3 grid with one corner lit: the grid is the network, the
 * yellow dot is the job moving through it. Matching is exactly that sentence
 * happening — so the wait is the mark itself, working, rather than a spinner
 * that could belong to any app.
 *
 * One token, nine quiet dots, and nothing else. Two richer versions were built
 * and thrown away against screenshots, and both failures are worth keeping:
 *
 *  - A trail of drying ink behind the token. On a route that crosses the grid
 *    the lit cells are never adjacent, so the trail read as three unrelated
 *    dots going dark — noise, not a path.
 *  - Ink that stays until the loop restarts. That reads well and is a lie: a
 *    grid filling nine-ninths is a progress bar, and a match has no progress
 *    to report. It answers when it answers.
 *
 * So the token carries the whole thing, and the route is what gives it shape:
 * out from the centre and once around, ending on the top-right cell — the one
 * the GRIDGO mark lights. Every loop closes on the logo for a beat, and nothing
 * draws that beat but the route ending where it does.
 *
 * Deliberately not `GridgoLogo`. That lockup belongs to identity surfaces —
 * login, onboarding, the home header — and this is a loading state. What is
 * borrowed is the geometry the mark is built from, with no wordmark and no
 * role, so the app does not grow a fourth place its logo flashes.
 *
 * Nothing here carries state: the line underneath says what is happening, and
 * with reduce motion on the token simply sits on that last beat.
 *
 * Yellow is inside the rule. There is no primary action on a screen that is
 * still loading, so the screen's whole attention budget is unspent — and this
 * token is the same "where you are" case the stepper's yellow step is.
 */

/** Circle centres on both axes, and the radius — `GridgoMark`'s own proportions. */
const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;

/**
 * The order the job visits the nine cells, indexed row-major.
 *
 * Out from the centre, then once round the edge. A raster reads as a progress
 * bar folded up and a plain ring reads as a spinner; opening on the centre
 * breaks both, and the walk itself is what says GRIDGO is going through
 * everything it has.
 */
export const MATCH_WAIT_ROUTE = [4, 1, 0, 3, 6, 7, 8, 5, 2] as const;

/**
 * Where the token stands when the loop closes, and where reduce motion leaves
 * it: the top-right cell, which is the dot the GRIDGO mark lights.
 */
export const MATCH_WAIT_RESTING_CELL =
  MATCH_WAIT_ROUTE[MATCH_WAIT_ROUTE.length - 1];

/** One hop, dwell included. Nine of them make the loop. */
const CELL_MS = 380;
const LOOP_MS = CELL_MS * MATCH_WAIT_ROUTE.length;

/** The share of a cell's time the token stands still before hopping. */
const DWELL = 0.42;

type Props = {
  /** What is being printed, so the screen reader says something specific. */
  thing: string;
  /** Rendered edge length of the grid in px. */
  size?: number;
};

export function MatchingWait({ thing, size = 156 }: Props) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: LOOP_MS, easing: Easing.linear }),
      -1,
    );
  }, [progress, reducedMotion]);

  return (
    <View
      className="items-center gap-6"
      accessibilityRole="progressbar"
      accessibilityLabel={`Finding a printer for ${thing.toLowerCase()}`}
    >
      <View
        style={{ width: size, height: size }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Field size={size} />
        {reducedMotion ? (
          <RestingToken size={size} />
        ) : (
          <TravellingToken size={size} progress={progress} />
        )}
      </View>

      {/*
        One sentence, and no estimate under it. "Usually a second or two" is a
        promise the app cannot keep on a slow connection, and a wait that
        overruns its own copy reads as broken. The motion is what says it is
        still working.
      */}
      <Text className="text-body-lg font-medium text-text-primary">
        GRIDGO is finding a printer.
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------------------
   Pieces
   --------------------------------------------------------------------------- */

type SharedProgress = ReturnType<typeof useSharedValue<number>>;

/** Where cell `index` sits, in px, for a grid of `size`. */
function cellCentre(index: number, size: number): { x: number; y: number } {
  return {
    x: (CENTRES[index % 3] / 100) * size,
    y: (CENTRES[Math.floor(index / 3)] / 100) * size,
  };
}

function dotBox(centre: { x: number; y: number }, radius: number) {
  return {
    position: "absolute" as const,
    left: centre.x - radius,
    top: centre.y - radius,
    width: radius * 2,
    height: radius * 2,
    borderRadius: radius,
  };
}

/** The nine cells the job moves through, drawn quiet so the token carries it. */
function Field({ size }: { size: number }) {
  const colors = useThemeColors();
  const radius = (RADIUS / 100) * size;

  return (
    <>
      {Array.from({ length: 9 }, (_, cell) => (
        <View
          key={cell}
          style={[dotBox(cellCentre(cell, size), radius), { backgroundColor: colors.outline }]}
        />
      ))}
    </>
  );
}

/** The job: one yellow dot, the size of any other, walking the grid. */
function TravellingToken({ size, progress }: { size: number; progress: SharedProgress }) {
  const colors = useThemeColors();
  const radius = (RADIUS / 100) * size;
  // Rebuilt only when the grid resizes: the worklet closes over this array, so
  // a fresh one every render would rebuild the animation for nothing.
  const centres = useMemo(
    () => MATCH_WAIT_ROUTE.map((cell) => cellCentre(cell, size)),
    [size],
  );

  const move = useAnimatedStyle(() => {
    const length = centres.length;
    const t = progress.value * length;
    const index = Math.floor(t) % length;
    const fraction = t - Math.floor(t);

    // Stand still for the dwell, then ease across. A constant glide would read
    // as an object being dragged; a job is handed from one press to the next.
    const hop = fraction < DWELL ? 0 : (fraction - DWELL) / (1 - DWELL);
    const back = -2 * hop + 2;
    const eased = hop < 0.5 ? 2 * hop * hop : 1 - (back * back) / 2;

    const from = centres[index];
    const to = centres[(index + 1) % length];
    return {
      transform: [
        { translateX: from.x + (to.x - from.x) * eased - radius },
        { translateY: from.y + (to.y - from.y) * eased - radius },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: colors.actionYellow,
        },
        move,
      ]}
    />
  );
}

/**
 * The token with reduce motion on: the loop's last beat, held.
 *
 * The same picture the animation keeps returning to, simply stopped — which is
 * what the design system asks an animation to fall back to. Nothing about this
 * screen is said by movement alone.
 */
function RestingToken({ size }: { size: number }) {
  const colors = useThemeColors();
  const radius = (RADIUS / 100) * size;

  return (
    <View
      style={[
        dotBox(cellCentre(MATCH_WAIT_RESTING_CELL, size), radius),
        { backgroundColor: colors.actionYellow },
      ]}
    />
  );
}
