import { ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormField } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ErrorState } from "@/components/ErrorState";
import { EvidencePhotoList } from "@/components/EvidencePhotoList";
import { IssueWindowCountdown } from "@/components/IssueWindowCountdown";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { Issue, Order } from "@/lib/api";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { storedFileIds, type ImageUpload } from "@/lib/imageUpload";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  checkIssueDescription,
  checkProblemPhotos,
  DEFAULT_ISSUE_WINDOW_HOURS,
  issueDecisionView,
  issueKindLabel,
  issueWindowOpenedAt,
  ISSUE_KINDS,
  MAX_PROBLEM_PHOTOS,
  PROBLEM_OUTCOME_COPY,
  PROBLEM_PHOTO_MAX_MIB,
  summarizeIssueWindow,
  type IssueKind,
} from "@/lib/issueWindow";
import { useProblemReport } from "@/store/problemReport";
import { useSurvey } from "@/store/survey";

const NO_PHOTOS: ImageUpload[] = [];

type Props = {
  order: Order;
  /** The order after the client closes it as fine. */
  onUpdated: (order: Order) => void;
  /** The countdown reached zero: read the order again, which the platform has closed. */
  onWindowElapsed?: () => void;
};

/**
 * The material-issue window, with both of its endings.
 *
 * Its length is one platform-wide setting, so the card reads it from
 * `GET /settings` rather than stating a number of its own. The window really
 * expires under v2 — the platform stamps the expiry on the order and closes it
 * when it passes — so the time left is a fact worth showing, next to how long
 * ago the job arrived.
 *
 * The card's one yellow control is "Everything is fine": the client confirms
 * the order arrived as agreed, the job closes now, and the screen becomes the
 * finished job. Reporting a problem is the quieter second choice, and takes
 * the yellow only once its form is open — the screen never carries two.
 *
 * A report carries the problem's type, the client's words and at least one
 * photo. GRIDGO gathers the rest of the case itself — the approved details,
 * the file, printing and delivery checks — but that bundle is Operations'
 * only: the card says it happens and never shows or asks for any of it.
 */
export function IssueWindowCard({ order, onUpdated, onWindowElapsed }: Props) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [windowHours, setWindowHours] = useState(DEFAULT_ISSUE_WINDOW_HOURS);
  const [loadFailed, setLoadFailed] = useState(false);
  const [opened, setOpened] = useState(false);
  /*
    The survey's "Report a problem with this order" lands here rather than on
    a second form: the ask opens this one, and answering it — sending,
    cancelling — clears the ask.
  */
  const reportAsked = useSurvey((state) => state.reportIntent === order.id);
  const clearReport = useSurvey((state) => state.clearReport);
  const open = opened || reportAsked;
  const setOpen = (next: boolean) => {
    setOpened(next);
    if (!next) clearReport();
  };
  const [kind, setKind] = useState<IssueKind>("material_quality");
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [closingAsFine, setClosingAsFine] = useState(false);
  const [showConsequences, setShowConsequences] = useState(false);
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another order's photos are never this report's.
  const photos = useProblemReport((state) => (state.orderId === order.id ? state.photos : NO_PHOTOS));
  const addPhoto = useProblemReport((state) => state.addPhoto);
  const removePhoto = useProblemReport((state) => state.removePhoto);

  const load = useCallback(async () => {
    try {
      setIssues(await api.listIssues(order.id));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    // The window's length is Operations' to change. A failure here only costs
    // the wording, so it falls back rather than blocking the report.
    try {
      setWindowHours((await api.getSettings()).issueWindowHours);
    } catch {
      // Keep the default wording.
    }
  }, [order.id]);

  useEffect(() => {
    // Every write in `load` lands after an await; the async wrapper keeps the
    // effect body itself free of synchronous state writes.
    void (async () => {
      await load();
    })();
  }, [load]);

  const openIssue = issues.find((issue) => issue.status === "open") ?? null;
  const openedAt = order.issueWindowOpenedAt ?? issueWindowOpenedAt(order.timeline);
  const status = summarizeIssueWindow({
    state: order.state,
    openedAt,
    expiresAt: order.issueWindowExpiresAt,
    windowHours,
    hasOpenIssue: Boolean(openIssue),
  });
  const check = checkIssueDescription(description);
  const photoProblem = checkProblemPhotos(photos);
  const decision = issueDecisionView(openIssue?.faultDecision);
  const liveClock =
    order.state === "issue_window_open" && Number.isFinite(Date.parse(order.issueWindowExpiresAt ?? ""));

  const closeAsFine = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.confirmDelivery(order.id);
      setClosingAsFine(false);
      onUpdated(updated);
    } catch (e) {
      setClosingAsFine(false);
      setError(
        userFacingError(
          e,
          "GRIDGO could not close this job just now. Check your connection and try again — the window stays open meanwhile.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.reportIssue(order.id, {
        problemType: kind,
        description: description.trim(),
        photoFileIds: storedFileIds(photos),
      });
      setConfirming(false);
      setOpen(false);
      setDescription("");
      useProblemReport.getState().reset();
      await load();
    } catch (e) {
      setConfirming(false);
      setError(
        userFacingError(
          e,
          "The report did not reach Operations. Check your connection and send it again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gg-card gap-4">
      <View className="gap-2">
        {/* Only when this says something the order's own state chip does not:
            that a report is already under review, or that the window has
            closed. "Issue window open" is already up in the header. */}
        {openIssue ? (
          <StatusChip tone="info" label="Issue under review" icon="clock" />
        ) : !status.canReport ? (
          <StatusChip tone="neutral" label="Issue window closed" icon="circle-check" />
        ) : null}
        {/* While the window is open and the order says when it closes, the
            time left leads the card, live (report 5A28D524). An older payload
            without the expiry keeps the one-line caption under the copy. */}
        {liveClock ? (
          <View className="pb-2">
            <IssueWindowCountdown
              openedAt={openedAt}
              expiresAt={order.issueWindowExpiresAt}
              windowHours={windowHours}
              elapsedLabel={status.elapsedLabel}
              onElapsed={onWindowElapsed}
            />
          </View>
        ) : null}
        <Text className="text-h3 text-text-primary">{status.headline}</Text>
        {/* Once Operations has a finding, it is the answer the detail promised. */}
        {decision ? null : <Text className="text-body text-text-secondary">{status.detail}</Text>}
        {status.consequences && !decision && !openIssue ? (
          <View className="gap-1">
            <Pressable
              onPress={() => setShowConsequences((shown) => !shown)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showConsequences }}
              accessibilityLabel="What happens next"
              className="gg-touch flex-row items-center gap-1 self-start"
              hitSlop={8}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <Text className="text-body font-medium text-text-primary underline">What happens next</Text>
              <View style={showConsequences ? { transform: [{ rotate: "180deg" }] } : undefined}>
                <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              </View>
            </Pressable>
            {showConsequences ? (
              <Text className="text-caption text-text-muted">{status.consequences}</Text>
            ) : null}
          </View>
        ) : null}
        {!liveClock && (status.elapsedLabel || status.remainingLabel) ? (
          <Text className="text-caption text-text-muted">
            {[status.elapsedLabel, status.remainingLabel].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>

      {openIssue ? (
        <View className="gg-panel gap-2">
          <Text className="text-caption text-text-muted">
            {issueKindLabel(openIssue.kind)} · reported {formatRelativeTime(openIssue.createdAt)}
          </Text>
          <Text className="text-body text-text-primary">{openIssue.description}</Text>
          {openIssue.photoFileIds?.length ? (
            <Text className="text-caption text-text-muted">
              {openIssue.photoFileIds.length === 1 ? "1 photo sent" : `${openIssue.photoFileIds.length} photos sent`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {decision ? (
        <View className="gg-panel gap-1" accessibilityLiveRegion="polite">
          <Text className="text-caption text-text-muted">Operations&apos; finding</Text>
          <Text className="text-body-lg font-medium text-text-primary">{decision.headline}</Text>
          {decision.reason ? <Text className="text-body text-text-secondary">{decision.reason}</Text> : null}
        </View>
      ) : null}

      {loadFailed ? (
        <ErrorState
          label="Could not check"
          body="GRIDGO could not check whether you already reported something on this job. Try again before sending a new report, so Operations does not get it twice."
          onRetry={() => void load()}
        />
      ) : null}

      {error ? <ErrorState label="Not done" body={error} /> : null}

      {status.canReport && !open ? (
        <View className="gap-3">
          <PrimaryButton
            label="Everything is fine"
            disabled={busy}
            onPress={() => setClosingAsFine(true)}
          />
          <SecondaryButton
            label="Report a problem"
            disabled={busy}
            onPress={() => {
              setError(null);
              setOpen(true);
            }}
          />
        </View>
      ) : null}

      {status.canReport && open ? (
        <View className="gap-4">
          <FormField label="What is wrong">
            <OptionPicker
              title="What is wrong?"
              accessibilityLabel="Type of issue"
              value={kind}
              options={ISSUE_KINDS.map((option) => ({
                value: option.value,
                label: option.label,
                hint: option.hint,
              }))}
              onChange={(value) => setKind(value as IssueKind)}
              placeholder="Choose what went wrong"
            />
          </FormField>

          <FormField
            label="Describe it"
            helper="Operations and your supplier both read this."
            error={description.length > 0 && !check.ok ? check.reason : null}
          >
            <TextField
              value={description}
              onChangeText={setDescription}
              placeholder="Colour is washed out across all 200 flyers — the brand red printed orange."
              accessibilityLabel="Describe the issue"
              multiline
              maxLength={500}
            />
          </FormField>

          <FormField
            label="Photos"
            helper={`At least one photo of what is wrong, up to ${MAX_PROBLEM_PHOTOS}. JPEG, PNG or WebP, ${PROBLEM_PHOTO_MAX_MIB} MB each. Only you and Operations see them.`}
          >
            <EvidencePhotoList
              photos={photos}
              max={MAX_PROBLEM_PHOTOS}
              disabled={busy}
              onAdd={() => void addPhoto(order.id)}
              onRemove={removePhoto}
            />
          </FormField>

          <Text className="text-caption text-text-muted">{PROBLEM_OUTCOME_COPY}</Text>
          {check.ok && photoProblem ? <Text className="text-caption text-text-muted">{photoProblem}</Text> : null}

          <PrimaryButton
            label="Send this to Operations"
            disabled={!check.ok || Boolean(photoProblem) || busy}
            onPress={() => setConfirming(true)}
          />
          <SecondaryButton
            label="Cancel"
            disabled={busy}
            onPress={() => {
              setOpen(false);
              setError(null);
            }}
          />
        </View>
      ) : null}

      <ConfirmDialog
        visible={closingAsFine}
        question={`Close ${order.title} as fine?`}
        body="This confirms the order arrived as agreed. The check window closes now, your supplier is paid for the job, and neither a problem nor a refund can be asked for on it from the app."
        confirmLabel="Yes, everything is fine"
        cancelLabel="Not yet"
        busy={busy}
        onConfirm={() => void closeAsFine()}
        onCancel={() => setClosingAsFine(false)}
      />

      <ConfirmDialog
        visible={confirming}
        question={`Report "${issueKindLabel(kind).toLowerCase()}" on ${order.title}?`}
        body="This holds your supplier's payout while Operations reviews it, and cannot be withdrawn from the app. You get the outcome within 2 business days. Only one report can be open on a job at a time."
        confirmLabel="Send report"
        cancelLabel="Keep checking"
        busy={busy}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
