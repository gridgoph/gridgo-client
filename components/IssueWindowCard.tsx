import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormField } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ErrorState } from "@/components/ErrorState";
import { StatusChip } from "@/components/StatusChip";
import type { Issue, Order } from "@/lib/api";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  checkIssueDescription,
  DEFAULT_ISSUE_WINDOW_HOURS,
  issueKindLabel,
  issueWindowOpenedAt,
  ISSUE_KINDS,
  summarizeIssueWindow,
  type IssueKind,
} from "@/lib/issueWindow";

type Props = {
  order: Order;
};

/**
 * The material-issue window.
 *
 * Its length is one platform-wide setting, so the card reads it from
 * `GET /settings` rather than stating a number of its own. The window really
 * expires under v2 — the platform stamps the expiry on the order and closes it
 * when it passes — so the time left is a fact worth showing, next to how long
 * ago the job arrived.
 */
export function IssueWindowCard({ order }: Props) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [windowHours, setWindowHours] = useState(DEFAULT_ISSUE_WINDOW_HOURS);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<IssueKind>("material_quality");
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void load();
  }, [load]);

  const openIssue = issues.find((issue) => issue.status === "open") ?? null;
  const status = summarizeIssueWindow({
    state: order.state,
    openedAt: order.issueWindowOpenedAt ?? issueWindowOpenedAt(order.timeline),
    expiresAt: order.issueWindowExpiresAt,
    windowHours,
    hasOpenIssue: Boolean(openIssue),
  });
  const check = checkIssueDescription(description);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.reportIssue(order.id, { kind, description: description.trim() });
      setConfirming(false);
      setOpen(false);
      setDescription("");
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
        <Text className="text-h3 text-text-primary">{status.headline}</Text>
        <Text className="text-body text-text-secondary">{status.detail}</Text>
        {status.elapsedLabel || status.remainingLabel ? (
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
        </View>
      ) : null}

      {loadFailed ? (
        <ErrorState
          label="Could not check"
          body="GRIDGO could not check whether you already reported something on this job. Try again before sending a new report, so Operations does not get it twice."
          onRetry={() => void load()}
        />
      ) : null}

      {error ? <ErrorState label="Not sent" body={error} /> : null}

      {status.canReport && !open ? (
        <PrimaryButton label="Report a problem" onPress={() => setOpen(true)} />
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

          <PrimaryButton
            label="Send this to Operations"
            disabled={!check.ok || busy}
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
        visible={confirming}
        question={`Report "${issueKindLabel(kind).toLowerCase()}" on ${order.title}?`}
        body="This holds your supplier's payout while Operations reviews it, and cannot be withdrawn from the app. Only one report can be open on a job at a time."
        confirmLabel="Send report"
        cancelLabel="Keep checking"
        busy={busy}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
