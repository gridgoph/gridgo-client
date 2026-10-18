import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Camera, ImageUp, PenLine } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import { ApprovalReviewList } from "@/components/approval/ApprovalReviewList";
import { SignaturePreview } from "@/components/approval/SignaturePreview";
import { ErrorState } from "@/components/ErrorState";
import { Screen } from "@/components/Screen";
import { SkeletonLine, SkeletonList } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  approvalDevice,
  approvalErrorMessage,
  approvalIsStale,
  approvalRefusalCode,
  APPROVAL_STATEMENT,
  SAMPLE_PHOTO_REASON,
  snapshotReview,
} from "@/lib/approvalProof";
import { userFacingError } from "@/lib/copy";
import { approvalStatus, sampleApprovalScope, useApproval } from "@/store/approval";

/**
 * Approving the sample (gridgo-client#248; gridgo-api
 * `docs/APPROVAL_PROOF_API.md`, "Received-sample approval").
 *
 * The order is in its proof step. Approving sends it out for matching exactly
 * as it is, so the screen first restates what is being approved — GRIDGO's
 * current review of the order, never the phone's idea of it — then takes a
 * photo of the sample the client received and their signature. Both are
 * required: GRIDGO records them together with that review's fingerprint, and
 * a change to the order after this point needs a new signature and photo.
 */
export default function ApproveSampleScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const scope = sampleApprovalScope(orderId ?? "");

  const [proof, setProof] = useState<api.ApprovalProofRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  const draft = useApproval((state) => state.drafts[scope]);
  const photo = useApproval((state) => state.samplePhotos[scope]);
  const reviewed = proof?.review.snapshotSha256 ?? "";
  const signed = reviewed ? approvalStatus(draft, "drawn", reviewed) : "missing";
  const photoReady = photo?.phase === "stored" && Boolean(photo.fileId);
  const ready = signed === "given" && photoReady && Boolean(reviewed);

  const load = useCallback(async () => {
    if (!orderId) return;
    const at = ++sequence.current;
    try {
      const read = await api.getApprovalProof(orderId);
      if (at !== sequence.current) return;
      setProof(read);
      setLoadError(null);
    } catch (e) {
      if (at !== sequence.current) return;
      setLoadError(userFacingError(e, "GRIDGO could not load what you are approving. Try again in a moment."));
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const approve = async () => {
    if (!orderId || !ready || busy || !photo?.fileId) return;
    setBusy(true);
    setError(null);
    try {
      const approval: api.ApprovalBody = {
        accepted: true,
        method: "drawn",
        signatureFileId: await useApproval.getState().signatureFileId(scope),
        samplePhotoFileId: photo.fileId,
        expectedSnapshotSha256: reviewed,
        device: await approvalDevice(),
      };
      await api.transitionOrder(orderId, "approved_for_matching", { note: "Approved by client", approval });
      useApproval.getState().withdraw(scope);
      router.back();
    } catch (e) {
      const code = approvalRefusalCode(e);
      if (approvalIsStale(code)) {
        // The order moved under the client: show the new review and ask again.
        useApproval.getState().withdraw(scope);
        void load();
      }
      setError(
        approvalErrorMessage(code) ??
          (e instanceof Error && e.message === "signature_missing"
            ? "Sign again, then approve."
            : userFacingError(e, "That approval did not go through. Check your connection and try again.")),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!proof) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-4">
          {loadError ? (
            <ErrorState label="Not loaded" body={loadError} onRetry={() => void load()} />
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

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Approve the sample</Text>
          <Text className="text-body text-text-secondary">
            Check the printed sample against your order. Approving sends this job out for supplier
            matching exactly as it is below.
          </Text>
        </View>

        <View className="gg-card gap-2">
          <Text className="text-overline text-text-muted">WHAT YOU ARE APPROVING</Text>
          <ApprovalReviewList items={snapshotReview(proof.review.snapshot)} />
        </View>

        <View className="gap-3">
          <Text className="text-overline text-text-muted">PHOTO OF THE SAMPLE</Text>
          <Text className="text-body text-text-secondary">{SAMPLE_PHOTO_REASON}</Text>
          {photo?.localUri ? (
            <View className="flex-row items-center gap-3">
              <Image
                source={{ uri: photo.localUri }}
                accessibilityLabel="Photo of the sample you received"
                className="h-20 w-20 rounded-card bg-surface-variant"
                resizeMode="cover"
              />
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-body text-text-primary" numberOfLines={1}>
                  {photo.fileName ?? "Sample photo"}
                </Text>
                {photo.phase === "sending" ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color={colors.textMuted} />
                    <Text className="text-caption text-text-muted">Sending to GRIDGO…</Text>
                  </View>
                ) : photo.phase === "stored" ? (
                  <Text className="text-caption text-success">Saved with GRIDGO</Text>
                ) : null}
              </View>
            </View>
          ) : null}
          {photo?.error ? (
            <Text className="text-caption text-error" accessibilityRole="alert">
              {photo.error}
            </Text>
          ) : null}
          <ActionRow
            icon={photo?.localUri ? ImageUp : Camera}
            label={photo?.localUri ? "Choose another photo" : "Add a photo of the sample"}
            disabled={busy || photo?.phase === "sending"}
            onPress={() => void useApproval.getState().pickSamplePhoto(scope)}
          />
        </View>

        <View className="gap-3">
          <Text className="text-overline text-text-muted">YOUR SIGNATURE</Text>
          {signed === "given" && draft?.signature ? (
            <>
              <SignaturePreview signature={draft.signature} />
              <Text className="text-caption text-text-secondary">
                Signed: &quot;{APPROVAL_STATEMENT}&quot;.
              </Text>
            </>
          ) : (
            <Text className="text-body text-text-secondary">
              {signed === "stale"
                ? "This order changed after you signed. Check it again and sign this version."
                : "Sign to say this sample is what you want printed."}
            </Text>
          )}
          <ActionRow
            icon={PenLine}
            label={signed === "given" ? "Sign again" : "Sign to approve"}
            disabled={busy}
            onPress={() =>
              router.push({ pathname: "/approval/sign", params: { scope, reviewed } })
            }
          />
        </View>

        {error ? <ErrorState label="Not approved" body={error} /> : null}
      </ScrollView>

      <View className="gap-2 border-t border-outline bg-surface px-4 pb-2 pt-3">
        <Pressable
          onPress={() => void approve()}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityLabel="Approve and continue"
          accessibilityState={{ disabled: !ready || busy }}
          className={!ready || busy ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
          style={({ pressed }) => (pressed && ready && !busy ? { opacity: 0.9 } : undefined)}
        >
          <Text className="text-button text-action-yellow-on">{busy ? "Approving…" : "Approve & continue"}</Text>
        </Pressable>
        <Text className="text-center text-caption text-text-muted">
          {ready
            ? "GRIDGO keeps your signature, the photo and this order together."
            : !photoReady
              ? "Add a photo of the sample to approve."
              : "Sign to approve."}
        </Text>
      </View>
    </Screen>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: typeof Camera;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <Icon size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
      <Text className="text-button text-text-primary">{label}</Text>
    </Pressable>
  );
}
