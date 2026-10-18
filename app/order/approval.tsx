import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ApprovalReviewList } from "@/components/approval/ApprovalReviewList";
import { EvidenceImage } from "@/components/approval/EvidenceImage";
import { ErrorState } from "@/components/ErrorState";
import { OrderReference } from "@/components/OrderReference";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SkeletonLine, SkeletonList } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import {
  approvalRecordView,
  approvalTime,
  shortFingerprint,
  snapshotReview,
} from "@/lib/approvalProof";
import { downloadApprovalProof } from "@/lib/approvalProofDownload";
import { userFacingError } from "@/lib/copy";

/**
 * The approval record (gridgo-client#248): what the client approved, frozen
 * when they approved it, with the signature or the tap, the photo of a sample,
 * who and when. This is what a correct print is if there is a disagreement,
 * so it is drawn from GRIDGO's stored records only — never rebuilt from the
 * order as it stands now — and a record GRIDGO kept without an approval says
 * so plainly. The PDF is the same records, rendered by GRIDGO.
 */
export default function ApprovalRecordScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [proof, setProof] = useState<api.ApprovalProofRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!orderId) return;
    const at = ++sequence.current;
    try {
      const read = await api.getApprovalProof(orderId);
      if (at !== sequence.current) return;
      setProof(read);
      setError(null);
    } catch (e) {
      if (at !== sequence.current) return;
      setError(userFacingError(e, "GRIDGO could not load the approval record. Try again in a moment."));
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const download = async () => {
    if (!orderId) return;
    setSaving(true);
    const result = await downloadApprovalProof(orderId);
    setNote(result.message ? { ok: result.ok, text: result.message } : null);
    setSaving(false);
  };

  if (!proof) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-4">
          {error ? (
            <ErrorState label="Not loaded" body={error} onRetry={() => void load()} />
          ) : (
            <>
              <SkeletonLine width="w-3/5" />
              <SkeletonList count={2} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  const records = [...proof.approvalProofs].reverse();
  const anyApproved = records.some((record) => approvalRecordView(record).approved);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Approval record</Text>
          {orderId ? <OrderReference id={orderId} /> : null}
          <Text className="text-body text-text-secondary">
            {anyApproved
              ? "What you approved, kept by GRIDGO exactly as it was when you approved it. If there is ever a disagreement about the print, this record is what a correct print is."
              : "What GRIDGO kept of this order when it was placed."}
          </Text>
        </View>

        {records.length ? (
          records.map((record) => <RecordCard key={record.id} record={record} />)
        ) : (
          <View className="gg-card">
            <Text className="text-body text-text-secondary">
              {proof.requirement?.required
                ? "GRIDGO is waiting for your approval of this order."
                : "No approval has been recorded for this order."}
            </Text>
          </View>
        )}
      </ScrollView>

      {records.length ? (
        <View className="gap-2 border-t border-outline bg-surface px-4 pb-2 pt-3">
          <PrimaryButton
            label={saving ? "Preparing the PDF…" : "Download approval record (PDF)"}
            disabled={saving}
            onPress={() => void download()}
          />
          {note ? (
            <Text
              className={note.ok ? "text-center text-caption text-text-secondary" : "text-center text-caption text-error"}
              accessibilityLiveRegion="polite"
            >
              {note.text}
            </Text>
          ) : (
            <Text className="text-center text-caption text-text-muted">
              The PDF lists your files and signature by reference. They stay private on GRIDGO.
            </Text>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function RecordCard({ record }: { record: api.ApprovalProofRecord }) {
  const view = approvalRecordView(record);
  const device = record.device
    ? [record.device.platform, record.device.appVersion && `version ${record.device.appVersion}`].filter(Boolean).join(" · ")
    : null;
  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-h3 text-text-primary">{view.title}</Text>
        <StatusChip
          tone={view.approved ? "success" : "neutral"}
          icon={view.approved ? "circle-check" : "triangle-alert"}
          label={view.statusLabel}
        />
      </View>

      {view.body ? <Text className="text-body text-text-secondary">{view.body}</Text> : null}

      <View>
        <SpecRow label="When" value={approvalTime(record.at)} />
        {view.methodLabel ? <SpecRow label="How" value={view.methodLabel} /> : null}
        {view.approved && record.account?.name ? <SpecRow label="By" value={record.account.name} /> : null}
        {view.approved && device ? <SpecRow label="Device" value={device} /> : null}
      </View>

      {/* One tap's How already quotes the statement. */}
      {view.approved && record.statement && record.method !== "one_tap" ? (
        <Text className="text-body-lg text-text-primary">&quot;{record.statement}&quot;</Text>
      ) : null}

      {view.approved && record.signatureFileId ? (
        <View className="gap-2">
          <Text className="text-overline text-text-muted">SIGNATURE</Text>
          <EvidenceImage fileId={record.signatureFileId} label="Your signature" paper />
        </View>
      ) : null}

      {view.approved && record.samplePhotoFileId ? (
        <View className="gap-2">
          <Text className="text-overline text-text-muted">SAMPLE YOU RECEIVED</Text>
          <EvidenceImage fileId={record.samplePhotoFileId} label="Photo of the sample you received" height={180} />
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-overline text-text-muted">{view.approved ? "WHAT YOU APPROVED" : "WHAT WAS ORDERED"}</Text>
        <ApprovalReviewList items={snapshotReview(record.snapshot)} />
      </View>

      <Text className="text-caption text-text-muted" selectable>
        Record fingerprint {shortFingerprint(record.snapshotSha256)}
      </Text>
    </View>
  );
}
