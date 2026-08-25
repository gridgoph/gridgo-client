import { router } from "expo-router";
import { Check, MapPin } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RequestStepper } from "@/components/RequestStepper";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import type { ClientAddress } from "@/lib/api";
import {
  applyContactProblems,
  applyStepProblem,
  type ApplyStepId,
} from "@/lib/accountProfile";
import { useBusinessApply } from "@/store/businessApply";
import { useSession } from "@/store/session";

/**
 * Turning a personal account into a business one.
 *
 * Stepped rather than one long form, because these are four different
 * questions with four different answers and only the first is about the
 * business at all. A client who opens a single page of six fields reads it as
 * an application to be vetted; a client answering one question at a time reads
 * it as what it is — GRIDGO learning the name to put on their jobs.
 *
 * The steps are numbered, and they are numbered because the content really is
 * a sequence: each answer is carried into the next screen and shown back on
 * Review before anything is sent. Nothing is written to the account until that
 * last step, and nothing is written locally at all — an account type kept on
 * the phone is one the next `/me` overwrites, after telling the client for an
 * afternoon that they are something GRIDGO has never heard of.
 *
 * This is a **business client** upgrade. It is not an application to become a
 * print shop: suppliers exist by invitation from Operations and have an app of
 * their own, and nothing here goes near that.
 */
export default function BusinessApplyScreen() {
  const user = useSession((s) => s.user);
  const {
    steps,
    index,
    draft,
    addresses,
    addressNotice,
    showProblem,
    submitting,
    notice,
    start,
    edit,
    next,
    back,
    loadAddresses,
    submit,
    reset,
  } = useBusinessApply();

  // Start from what GRIDGO already holds, and start clean: a previous
  // application abandoned last week is not one to resume silently.
  useEffect(() => {
    start(useSession.getState().user);
    return reset;
  }, [start, reset]);

  const step = steps[index];
  const stepId: ApplyStepId = step?.id ?? "name";
  const problem = showProblem ? applyStepProblem(stepId, draft) : null;
  // The contact step has two answers, and each says what is wrong with itself:
  // a number rejected for its format explained under the name would send a
  // client to correct the field that is already right.
  const contact = showProblem ? applyContactProblems(draft) : null;
  const last = index === steps.length - 1;

  useEffect(() => {
    if (stepId === "where") void loadAddresses();
  }, [stepId, loadAddresses]);

  async function finish() {
    const applied = await submit();
    // Only a real answer from GRIDGO leaves the screen. A refusal keeps every
    // answer where the client can still see and correct it.
    if (applied) router.back();
  }

  return (
    <FormScreen
      overlay={
        <LoadingOverlay
          visible={submitting}
          label="Switching your account over…"
          body="GRIDGO is putting your business name on the account."
        />
      }
    >
      <View className="gg-page gap-8 pb-16 pt-4">
        <RequestStepper steps={steps} currentIndex={index} />

        {stepId === "name" ? (
          <StepShell
            heading="What is the business called?"
            body="This is the name suppliers and riders see on every job you order, and the name on your account from here on."
          >
            <FormField
              label="Business name"
              error={problem}
              helper="Exactly as you trade — GRIDGO prints it as you type it."
            >
              <TextField
                value={draft.orgName}
                onChangeText={(orgName) => edit({ orgName })}
                placeholder="Bautista Trading"
                accessibilityLabel="Business name"
                autoCapitalize="words"
                autoFocus
              />
            </FormField>
          </StepShell>
        ) : null}

        {stepId === "contact" ? (
          <StepShell
            heading="Who does GRIDGO talk to?"
            body="One person GRIDGO can reach when a job needs a decision — an artwork correction, or a delivery nobody is in for."
          >
            <FormField label="Contact person" error={contact?.contactName}>
              <TextField
                value={draft.contactName}
                onChangeText={(contactName) => edit({ contactName })}
                placeholder="Ana Bautista"
                accessibilityLabel="Contact person"
                autoCapitalize="words"
                textContentType="name"
              />
            </FormField>
            <FormField
              label="Mobile number"
              helper="The rider delivering your job gets this number."
              error={contact?.phone}
            >
              <TextField
                value={draft.phone}
                onChangeText={(phone) => edit({ phone })}
                placeholder="0917 123 4567"
                accessibilityLabel="Mobile number"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FormField>
          </StepShell>
        ) : null}

        {stepId === "where" ? (
          <StepShell
            heading="Where do orders go?"
            body="Pick the address GRIDGO should treat as this business's usual drop-off. You can still choose a different one on any single order."
          >
            {addressNotice ? (
              <Text className="text-caption text-text-muted">{addressNotice}</Text>
            ) : null}

            {addresses === null ? (
              <Text className="text-body text-text-secondary">Reading your addresses…</Text>
            ) : addresses.length ? (
              <View className="gap-3">
                {addresses.map((address) => (
                  <AddressRow
                    key={address.id}
                    address={address}
                    selected={draft.addressId === address.id}
                    onPress={() =>
                      edit({
                        // Tapping the chosen one again takes it back off: a
                        // client who did not mean to pick any must be able to
                        // say so without leaving the step.
                        addressId: draft.addressId === address.id ? null : address.id,
                      })
                    }
                  />
                ))}
              </View>
            ) : (
              /*
                No saved address is not a dead end and does not get an
                invitation to go and make one — a client mid-application should
                not be sent into the request flow to drop a pin. GRIDGO asks
                for the drop-off at checkout anyway, so this step says so and
                lets them carry on.
              */
              <View className="gg-panel gap-2">
                <Text className="text-body-lg font-medium text-text-primary">
                  No saved addresses yet
                </Text>
                <Text className="text-body text-text-muted">
                  You have not saved one. Carry on — GRIDGO asks where your first order is
                  going when you check out, and saves it for next time.
                </Text>
              </View>
            )}
          </StepShell>
        ) : null}

        {stepId === "review" ? (
          <StepShell
            heading="Is this right?"
            body="GRIDGO puts this on your account and on every job from here on. Nothing has been changed yet."
          >
            <View className="gg-card gap-4">
              <ReviewRow label="Business name" value={draft.orgName.trim() || "—"} />
              <ReviewRow
                label="Contact person"
                value={draft.contactName.trim() || user?.name || "—"}
              />
              <ReviewRow
                label="Mobile number"
                value={draft.phone.trim() || user?.phone || "—"}
              />
              <ReviewRow
                label="Orders go to"
                value={
                  addresses?.find((address) => address.id === draft.addressId)?.label ??
                  "Asked at checkout"
                }
              />
              <ReviewRow label="Sign-in email" value={user?.email || "—"} />
            </View>

            {notice ? (
              <ErrorState
                label={notice.notOpenYet ? "Not open yet" : "Not switched over"}
                body={notice.message}
                retryLabel={notice.notOpenYet ? "Check again" : "Try again"}
                onRetry={() => void finish()}
              />
            ) : null}
          </StepShell>
        ) : null}

        <View className="gap-3">
          {last ? (
            <PrimaryButton
              label={submitting ? "Applying…" : "Apply as a business"}
              disabled={submitting}
              onPress={() => void finish()}
            />
          ) : (
            <PrimaryButton label="Continue" onPress={next} />
          )}
          {index > 0 ? <SecondaryButton label="Back" onPress={back} /> : null}
        </View>
      </View>
    </FormScreen>
  );
}

/** One step: what it is asking, why, then the controls that answer it. */
function StepShell({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text className="text-h1 text-text-primary">{heading}</Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>
      {children}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-caption text-text-muted">{label}</Text>
      <Text className="text-body-lg text-text-primary">{value}</Text>
    </View>
  );
}

function AddressRow({
  address,
  selected,
  onPress,
}: {
  address: ClientAddress;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Send orders to ${address.label}`}
      accessibilityState={{ selected }}
      className={
        selected
          ? "gg-touch flex-row items-center gap-3 rounded-card border border-accent bg-surface-high p-4"
          : "gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <MapPin
        size={18}
        color={colors.textMuted}
        strokeWidth={2}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View className="min-w-0 flex-1">
        <Text className="text-body-lg font-medium text-text-primary">{address.label}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {address.addressLine}
        </Text>
      </View>
      {selected ? (
        <Check
          size={18}
          color={colors.textPrimary}
          strokeWidth={2.5}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
    </Pressable>
  );
}
