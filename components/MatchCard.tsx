import { Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { readyInShort, samplePhotoUri } from "@/lib/listing";
import type { MatchResult } from "@/lib/api";
import { primaryReason, queueLine, reasonLine, reasonTag } from "@/lib/match";
import { widestPrinterCapFeet } from "@/lib/printerWidth";

type Props = {
  match: MatchResult;
  /** What is being printed, for the reason line. */
  subcategoryName: string;
  /** Straight-line metres to the drop-off, or null when none was given. */
  distanceMeters: number | null;
};

/**
 * GRIDGO's answer for the thing the client wants printed.
 *
 * Every marketplace answers "who can print this?" with a grid of shops and
 * leaves the client to compare twelve near-identical tiles. GRIDGO is not a
 * grid of shops — it is the counter. The client deals with GRIDGO, GRIDGO
 * decides which press runs the job, and the press is GRIDGO's business rather
 * than the client's. So no name and no street address appears here: they would
 * hand back the comparing this whole flow exists to remove, and they would tell
 * a client to phone somebody GRIDGO answers for.
 *
 * What is left is the part that was always the product: the WHY band. A ruled
 * strip, the way a job docket is ruled, carrying the factor the pick was made
 * on and one concrete line of evidence — every number in it real, from the
 * match the platform actually ran.
 *
 * Underneath, the two facts a client plans around sit in a readout: where they
 * are in the queue, and how long the whole wait is. Neither is drawn unless the
 * match carried it.
 *
 * No yellow. This card is the answer; the listings underneath are the action,
 * and the one primary control in this flow waits on the listing sheet where the
 * client actually commits to something.
 */
export function MatchCard({ match, subcategoryName, distanceMeters }: Props) {
  const reason = primaryReason(match.reasons);
  const queue = queueLine(match.queue);
  const wait = readyInShort(match.queue.estimatedHours);
  const sample = samplePhotoUri(match.listings[0]?.photos[0]);
  const thing = subcategoryName.toLowerCase();
  const widest = widestPrinterCapFeet(match.listings);

  return (
    <View className="gg-card-flush">
      {/* The work leads. It is the one thing a client reads before any words —
          and it is the job, not a shopfront. */}
      <View className="bg-surface-variant px-2 pt-2">
        <SamplePhoto
          url={sample}
          altText={`Sample ${match.listings[0]?.name ?? thing} printed through GRIDGO`}
          ratio="wide"
          emptyLabel="No sample photo yet"
        />
      </View>

      <View className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-h2 text-text-primary">GRIDGO’s pick for {thing}</Text>
          <Text className="text-caption text-text-muted">
            GRIDGO prints it, checks it, and gets it to you.
          </Text>
        </View>

        {/*
          The why band. A hairline rule with the reason set into it — the
          structure says "this is an annotation on the pick above", which is
          exactly what it is. The tag is the factor; the line is the evidence.
        */}
        <View className="gap-2">
          <View className="flex-row items-center gap-3">
            <Text className="text-overline text-brand">
              {reason ? reasonTag(reason.factor) : "MATCHED"}
            </Text>
            <View className="h-px flex-1 bg-outline" />
          </View>
          <Text className="text-body-lg text-text-primary">
            {reasonLine({
              reason,
              queue: match.queue,
              distanceMeters,
              alternativesCount: match.alternativesCount,
              subcategoryName,
            })}
          </Text>
        </View>

        {/*
          The two things a client plans around. Ruled cells, one per fact. A
          tarpaulin press adds a third on its own row: how wide it prints,
          which decides whether the banner fits before anything else does.
          Drawn only when the listings publish it.
        */}
        <View className="rounded-field border border-outline">
          <View className="flex-row">
            <Readout
              label="YOUR PLACE"
              value={queue ?? "Not published"}
              hint={
                match.queue.jobsAhead > 0
                  ? `${match.queue.jobsAhead} ${match.queue.jobsAhead === 1 ? "job" : "jobs"} ahead of yours`
                  : "nothing ahead of yours"
              }
            />
            <View className="w-px bg-outline" />
            <Readout
              label="READY IN"
              value={wait ?? "GRIDGO confirms"}
              hint={wait ? "queue included" : undefined}
            />
          </View>
          {widest != null ? (
            <>
              <View className="h-px bg-outline" />
              <View className="flex-row">
                <Readout label="PRINT WIDTH" value={`Up to ${widest} ft wide`} />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** One cell of the readout: what it is, what it says, and any qualifier. */
function Readout({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View className="min-w-0 flex-1 gap-1 p-3">
      <Text className="text-overline text-text-muted">{label}</Text>
      <Text className="text-body-lg font-medium text-text-primary">{value}</Text>
      {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
    </View>
  );
}
