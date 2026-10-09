import { router } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import {
  ChecklistProgress,
  CheckRow,
  ChoiceCard,
  ChoicePill,
  DocumentRow,
  PrivacyNote,
  ReviewBlock,
  ReviewRow,
  SentBackCard,
  StepShell,
} from "@/components/application/ApplicationParts";
import { OtpCodeStep } from "@/components/auth/OtpCodeStep";
import { ErrorState } from "@/components/ErrorState";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import { FormScreen } from "@/components/FormScreen";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RequestStepper } from "@/components/RequestStepper";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import type { ClientOrganization } from "@/lib/api";
import {
  accountProblems,
  BUSINESS_TYPES,
  documentProblems,
  DOCUMENT_PRIVACY,
  formatDateTyping,
  GOVERNMENT_ID_TYPES,
  governmentIdLabel,
  idCanHaveNoExpiry,
  manilaToday,
  personProblems,
  stepProblem,
  type ApplicationMode,
} from "@/lib/clientApplication";
import { currentChecklist, useClientApplication } from "@/store/clientApplication";
import { useSession } from "@/store/session";

/**
 * An organization or business application, a first-officer verification, or
 * an officer handover (gridgo-client#163, #164) — one stepped flow, because
 * all three are the same promise: a named, verified person answers for this
 * account.
 *
 * Written for a school officer on a phone between classes: one question per
 * step, every document said in the words on the paper, who can see the files
 * said before they are asked for, and nothing sent until Review has shown it
 * all back.
 */
export function ApplicationFlow({
  mode,
  organization = null,
  onDone,
}: {
  mode: ApplicationMode;
  organization?: ClientOrganization | null;
  onDone: () => void;
}) {
  const state = useClientApplication();
  const {
    steps,
    index,
    draft,
    showProblem,
    uploads,
    email,
    submitting,
    notice,
    loginEmail,
    prefill,
    sentBack,
    edit,
    editPerson,
    next,
    back,
    goTo,
    pickDocument,
    removeDocument,
    sendCode,
    setCode,
    verifyCode,
    submit,
  } = state;

  useEffect(() => {
    const { start, loadChecklist, loadPrevious, reset } = useClientApplication.getState();
    start({ mode, user: useSession.getState().user, organization });
    void loadChecklist();
    // A sent-back or waiting application comes back filled in (#187).
    void loadPrevious();
    return reset;
    // `organization` is read once, at the start, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Each step opens at its heading, not wherever the last one was scrolled to.
  const scrollRef = useRef<{ scrollTo?: (opts: { y: number; animated?: boolean }) => void }>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [index]);

  const step = steps[index];
  const stepId = step?.id ?? "account";
  const last = index === steps.length - 1;
  const organizationTrack = mode !== "apply" || draft.accountType === "organization";
  const checklist = currentChecklist(state);
  const today = manilaToday();
  const accountShown = showProblem && stepId === "account" ? accountProblems(draft) : {};
  const personShown =
    showProblem && stepId === "person"
      ? personProblems(draft.person, { organization: organizationTrack, today })
      : {};
  const documentsShown =
    showProblem && stepId === "documents" ? documentProblems(draft, checklist, sentBack) : {};
  const documentsMissing =
    showProblem && stepId === "documents"
      ? stepProblem("documents", draft, { mode, checklist, emailVerified: false, today, sentBack })
      : null;
  // A document sent back is needed again, even one the checklist calls optional.
  const needed = checklist.filter((item) => item.required || sentBack?.documents[item.key]);
  const requiredCount = needed.length;
  const requiredDone = needed.filter((item) => draft.documents[item.key]).length;
  const sentBackCount = checklist.filter((item) => sentBack?.documents[item.key]).length;
  // The ones Operations asked for again lead the list, straight under their words.
  const documentRows = sentBackCount
    ? [
        ...checklist.filter((item) => sentBack?.documents[item.key]),
        ...checklist.filter((item) => !sentBack?.documents[item.key]),
      ]
    : checklist;
  const officerWord = organizationTrack ? "officer" : "signatory";
  const currentOfficer = organization?.currentOfficer?.fullName ?? null;
  const caseNow = useSession((s) => s.user?.approvalCase ?? null);
  // The read-back's words when it landed; the session's reason until then, or
  // from an API that has no read-back.
  const turnedDown =
    sentBack ??
    (caseNow?.kind === "business_client" && caseNow.status === "rejected"
      ? { reason: caseNow.rejectionReason?.trim() || null, documents: {} }
      : null);

  async function finish() {
    if (await submit()) onDone();
  }

  const primaryLabel = last
    ? submitting
      ? "Sending…"
      : mode === "handover"
        ? "Send for review"
        : "Send application"
    : "Continue";

  if (prefill !== "idle") {
    return (
      <FormScreen>
        <View className="gg-page gap-8 pb-16 pt-4">
          {prefill === "loading" ? (
            <View className="gap-4" accessibilityLabel="Loading what you sent before" accessible>
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-36 w-full" />
              <SkeletonLine width="w-2/3" height="h-6" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
            </View>
          ) : (
            <>
              <ErrorState
                label="Not loaded"
                body="Your earlier answers did not load. Check your connection and try again — nothing you sent is lost."
                onRetry={() => {
                  useClientApplication.setState({ prefill: "loading" });
                  void useClientApplication.getState().loadPrevious();
                }}
              />
              <SecondaryButton
                label="Fill it in again instead"
                onPress={() => useClientApplication.getState().startFresh()}
              />
            </>
          )}
        </View>
      </FormScreen>
    );
  }

  // The code box carries its own button; a second one under it would be two
  // primaries for one action.
  const codeOpen = stepId === "email" && (email.phase === "sent" || email.phase === "verifying");

  return (
    <FormScreen
      scrollRef={scrollRef}
      overlay={
        <LoadingOverlay
          visible={submitting}
          label={mode === "handover" ? "Sending the new officer's details…" : "Sending your application…"}
          body="Operations checks every document before anything on the account changes."
        />
      }
    >
      <View className="gg-page gap-8 pb-16 pt-4">
        <RequestStepper steps={steps} currentIndex={index} />

        {/*
          Over every step where something can be fixed, so the client never has
          to remember what Operations asked while correcting it.
        */}
        {turnedDown && (stepId === "account" || stepId === "person" || stepId === "documents") ? (
          <SentBackCard sentBack={turnedDown} />
        ) : null}

        {stepId === "account" ? (
          <StepShell
            heading={
              mode === "first_officer"
                ? "Confirm your organization"
                : "Who is this account for?"
            }
            body={
              mode === "first_officer"
                ? "Your organization is approved. Verify the officer who answers for it now, so their name can go on your invoices and statements."
                : "Operations checks this before the account changes. You keep ordering as you do now in the meantime."
            }
          >
            {mode === "apply" ? (
              <View className="gap-3" accessibilityRole="radiogroup">
                <ChoiceCard
                  label="Organization"
                  hint="A school organization, PTA or student council. One shared email signs in for it."
                  selected={draft.accountType === "organization"}
                  onPress={() => edit({ accountType: "organization" })}
                />
                <ChoiceCard
                  label="Business"
                  hint="A sole proprietor, partnership or corporation registered to trade."
                  selected={draft.accountType === "business"}
                  onPress={() => edit({ accountType: "business" })}
                />
              </View>
            ) : null}

            {draft.accountType === "business" && mode === "apply" ? (
              <FormField label="How is it registered?" error={accountShown.businessType}>
                <View className="gap-3" accessibilityRole="radiogroup">
                  {BUSINESS_TYPES.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      label={option.label}
                      hint={option.hint}
                      selected={draft.businessType === option.value}
                      onPress={() => edit({ businessType: option.value })}
                    />
                  ))}
                </View>
              </FormField>
            ) : null}

            <FormField
              label={organizationTrack ? "Organization name" : "Registered business name"}
              error={accountShown.businessName}
              helper={
                organizationTrack
                  ? "As the school knows it. GRIDGO prints it on your invoices."
                  : "Exactly as it is on your BIR and DTI or SEC papers."
              }
            >
              <TextField
                value={draft.businessName}
                onChangeText={(businessName) => edit({ businessName })}
                placeholder={organizationTrack ? "Grade 10 Parents-Teachers Association" : "Bautista Trading"}
                accessibilityLabel={organizationTrack ? "Organization name" : "Registered business name"}
                autoCapitalize="words"
              />
            </FormField>

            {organizationTrack ? (
              <FormField
                label="School"
                error={accountShown.school}
                helper="Two organizations can share a school, but not a name at the same school."
              >
                <TextField
                  value={draft.school}
                  onChangeText={(school) => edit({ school })}
                  placeholder="Davao City National High School"
                  accessibilityLabel="School"
                  autoCapitalize="words"
                />
              </FormField>
            ) : null}

            <FormField
              label="What do you do?"
              error={accountShown.businessNature}
              helper="One line for Operations — events, uniforms, a school fair."
            >
              <TextField
                value={draft.businessNature}
                onChangeText={(businessNature) => edit({ businessNature })}
                placeholder={organizationTrack ? "Parents' association for Grade 10" : "Events and corporate merchandise"}
                accessibilityLabel="What do you do?"
                autoCapitalize="sentences"
              />
            </FormField>

            {organizationTrack ? (
              <FormField
                label="Faculty adviser's contact"
                optional
                helper="A name and number or email Operations can check with."
              >
                <TextField
                  value={draft.facultyAdviserContact}
                  onChangeText={(facultyAdviserContact) => edit({ facultyAdviserContact })}
                  placeholder="Ms. Cruz, 0917 123 4567"
                  accessibilityLabel="Faculty adviser's contact"
                />
              </FormField>
            ) : null}
          </StepShell>
        ) : null}

        {stepId === "person" ? (
          <StepShell
            heading={
              mode === "handover"
                ? "Who is the new officer?"
                : organizationTrack
                  ? "Who is the officer?"
                  : "Who signs for the business?"
            }
            body={
              mode === "handover"
                ? `Enter the new officer's details exactly as they are on their ID. ${currentOfficer ?? "The current officer"} stays the officer of record until Operations approves them, and ordering carries on as normal.`
                : organizationTrack
                  ? "The officer answers for this account, and their name goes on every invoice and statement. Enter the details exactly as they are on the ID."
                  : "The owner or the person authorised to sign. Enter the details exactly as they are on the ID."
            }
          >
            <FormField label="Full name" error={personShown.fullName}>
              <TextField
                value={draft.person.fullName}
                onChangeText={(fullName) => editPerson({ fullName })}
                placeholder="Ana Marie Reyes"
                accessibilityLabel="Full name"
                autoCapitalize="words"
                textContentType="name"
              />
            </FormField>
            <FormField label="Date of birth" error={personShown.dateOfBirth} helper="Year, month, day — 2004-03-15.">
              <TextField
                value={draft.person.dateOfBirth}
                onChangeText={(value) => editPerson({ dateOfBirth: formatDateTyping(value) })}
                placeholder="YYYY-MM-DD"
                accessibilityLabel="Date of birth"
                keyboardType="number-pad"
                maxLength={10}
              />
            </FormField>
            <View className="gap-2">
              <FormField label="Address" error={personShown.address} helper="As it is printed on the ID.">
                <TextField
                  value={draft.person.address}
                  onChangeText={(address) => editPerson({ address })}
                  placeholder="Purok 3, Bajada, Davao City"
                  accessibilityLabel="Address"
                  autoCapitalize="words"
                />
              </FormField>
              <WhyWeAsk>Operations check it against the ID you send. Shops and riders never see it.</WhyWeAsk>
            </View>
            <View className="gap-2">
              <FormField label="Mobile number" error={personShown.phone}>
                <TextField
                  value={draft.person.phone}
                  onChangeText={(phone) => editPerson({ phone })}
                  placeholder="0917 123 4567"
                  accessibilityLabel="Mobile number"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoCorrect={false}
                />
              </FormField>
              <WhyWeAsk>Operations call this number if they need to check the application with you.</WhyWeAsk>
            </View>

            <FormField label="Primary government ID" error={personShown.governmentIdType}>
              <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                {GOVERNMENT_ID_TYPES.map((option) => (
                  <ChoicePill
                    key={option.value}
                    label={option.label}
                    selected={draft.person.governmentIdType === option.value}
                    onPress={() =>
                      editPerson({
                        governmentIdType: option.value,
                        ...(option.canHaveNoExpiry ? {} : { governmentIdHasNoExpiry: false }),
                      })
                    }
                  />
                ))}
              </View>
            </FormField>

            {draft.person.governmentIdHasNoExpiry && idCanHaveNoExpiry(draft.person.governmentIdType) ? null : (
              <FormField label="ID valid until" error={personShown.governmentIdExpiresOn} helper="The expiry date printed on the ID.">
                <TextField
                  value={draft.person.governmentIdExpiresOn}
                  onChangeText={(value) => editPerson({ governmentIdExpiresOn: formatDateTyping(value) })}
                  placeholder="YYYY-MM-DD"
                  accessibilityLabel="ID valid until"
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </FormField>
            )}
            {idCanHaveNoExpiry(draft.person.governmentIdType) ? (
              <CheckRow
                label="This ID has no expiry date"
                checked={draft.person.governmentIdHasNoExpiry}
                onPress={() => editPerson({ governmentIdHasNoExpiry: !draft.person.governmentIdHasNoExpiry })}
              />
            ) : null}

            {organizationTrack ? (
              <FormField
                label="Student ID valid until"
                error={personShown.studentIdExpiresOn}
                helper="The last day the student ID is valid, from the card or the enrolment form."
              >
                <TextField
                  value={draft.person.studentIdExpiresOn}
                  onChangeText={(value) => editPerson({ studentIdExpiresOn: formatDateTyping(value) })}
                  placeholder="YYYY-MM-DD"
                  accessibilityLabel="Student ID valid until"
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </FormField>
            ) : null}

            <View className="gap-2">
              <CheckRow
                label="The ID is the original and has not expired"
                hint="A clear photo or scan of the card itself, not a photocopy."
                checked={draft.person.originalId}
                onPress={() => editPerson({ originalId: !draft.person.originalId })}
              />
              <CheckRow
                label="These details match the ID exactly"
                checked={draft.person.detailsMatchId}
                onPress={() => editPerson({ detailsMatchId: !draft.person.detailsMatchId })}
              />
              {personShown.confirm ? (
                <Text className="text-caption text-error">{personShown.confirm}</Text>
              ) : null}
            </View>
          </StepShell>
        ) : null}

        {stepId === "documents" ? (
          <StepShell
            heading={
              sentBackCount
                ? sentBackCount === 1
                  ? "Upload the document again"
                  : "Upload those documents again"
                : mode === "handover"
                  ? "Add the new officer's documents"
                  : "Add your documents"
            }
            body={
              sentBackCount
                ? "The rest are kept from your last application. Operations opens every one before approving the account."
                : mode === "handover"
                ? "Fresh copies in the new officer's name. Files from an earlier approval cannot be reused."
                : "A clear photo or a PDF of each. Operations opens every one before approving the account."
            }
          >
            <PrivacyNote>{DOCUMENT_PRIVACY}</PrivacyNote>
            <ChecklistProgress done={requiredDone} total={requiredCount} />
            <View className="gap-3">
              {documentRows.map((item) => (
                <DocumentRow
                  key={item.key}
                  item={item}
                  uploaded={draft.documents[item.key]}
                  upload={uploads[item.key]}
                  missing={Boolean(documentsShown[item.key])}
                  sentBack={sentBack?.documents[item.key] ?? null}
                  onAdd={() => void pickDocument(item.key)}
                  onRemove={() => removeDocument(item.key)}
                />
              ))}
            </View>
            <Text className="text-caption text-text-muted">JPEG, PNG, WebP or PDF, up to 20 MB each.</Text>
            {documentsMissing ? <Text className="text-body text-error">{documentsMissing}</Text> : null}
          </StepShell>
        ) : null}

        {stepId === "email" ? (
          codeOpen ? (
            <OtpCodeStep
              heading="Enter the code"
              body={`We sent a 6-digit code to ${loginEmail}. It works for 10 minutes.`}
              code={email.code}
              onChangeCode={setCode}
              onSubmit={() => void verifyCode()}
              onResend={() => void sendCode()}
              busy={email.phase === "verifying"}
              submitLabel="Verify email"
              busyLabel="Checking…"
              error={email.error ? <Text className="text-body text-error">{email.error}</Text> : null}
            />
          ) : (
            <StepShell
              heading="Verify the organization email"
              body="The organization signs in with one shared email that passes from officer to officer. A code sent there shows the organization still holds it."
            >
              <EmailPanel email={loginEmail} verified={email.phase === "verified"} />
              {email.error ? <Text className="text-body text-error">{email.error}</Text> : null}
              {showProblem && email.phase !== "verified" ? (
                <Text className="text-caption text-error">Verify the email to continue.</Text>
              ) : null}
              {email.phase === "verified" ? (
                <Text className="text-caption text-text-muted">
                  Send the application in the next 10 minutes, or you will need a new code.
                </Text>
              ) : (
                <Text className="text-caption text-text-muted">
                  Send the code when you are ready to finish — it works for 10 minutes. To use a different email, change the sign-in email in Your details first.
                </Text>
              )}
            </StepShell>
          )
        ) : null}

        {stepId === "review" ? (
          <StepShell
            heading="Check and send"
            body={
              mode === "handover"
                ? `${currentOfficer ?? "The current officer"} stays the officer of record until Operations approves ${draft.person.fullName.trim() || "the new officer"}. Orders keep the current officer's name until then, and ordering is not paused.`
                : "This goes to Operations. Nothing on the account changes until they approve it, and you keep ordering in the meantime."
            }
          >
            {mode !== "handover" ? (
              <ReviewBlock title={organizationTrack ? "Organization" : "Business"} onEdit={() => goTo("account")}>
                <ReviewRow label="Name" value={draft.businessName.trim() || "—"} />
                {organizationTrack ? <ReviewRow label="School" value={draft.school.trim() || "—"} /> : null}
                {!organizationTrack ? (
                  <ReviewRow
                    label="Registered as"
                    value={BUSINESS_TYPES.find((option) => option.value === draft.businessType)?.label ?? "—"}
                  />
                ) : null}
                <ReviewRow label="What you do" value={draft.businessNature.trim() || "—"} />
                {organizationTrack && draft.facultyAdviserContact.trim() ? (
                  <ReviewRow label="Faculty adviser" value={draft.facultyAdviserContact.trim()} />
                ) : null}
              </ReviewBlock>
            ) : null}

            <ReviewBlock
              title={mode === "handover" ? "New officer" : organizationTrack ? "Officer" : "Signatory"}
              onEdit={() => goTo("person")}
            >
              <ReviewRow label="Full name" value={draft.person.fullName.trim() || "—"} />
              <ReviewRow label="Date of birth" value={draft.person.dateOfBirth || "—"} />
              <ReviewRow label="Address" value={draft.person.address.trim() || "—"} />
              <ReviewRow label="Mobile number" value={draft.person.phone.trim() || "—"} />
              <ReviewRow
                label="Government ID"
                value={`${governmentIdLabel(draft.person.governmentIdType)} · ${
                  draft.person.governmentIdHasNoExpiry && idCanHaveNoExpiry(draft.person.governmentIdType)
                    ? "no expiry date"
                    : `valid until ${draft.person.governmentIdExpiresOn || "—"}`
                }`}
              />
              {organizationTrack ? (
                <ReviewRow label="Student ID valid until" value={draft.person.studentIdExpiresOn || "—"} />
              ) : null}
            </ReviewBlock>

            <ReviewBlock title="Documents" onEdit={() => goTo("documents")}>
              {checklist
                .filter((item) => item.required || draft.documents[item.key] || sentBack?.documents[item.key])
                .map((item) => {
                  const file = draft.documents[item.key];
                  return (
                    <ReviewRow
                      key={item.key}
                      label={item.label}
                      value={
                        !file
                          ? "Not added"
                          : file.kept
                            ? `${file.name} (sent before)`
                            : sentBack?.documents[item.key]
                              ? `${file.name} (new)`
                              : file.name
                      }
                    />
                  );
                })}
            </ReviewBlock>

            {organizationTrack ? (
              <View className="gap-2">
                <Text className="text-caption text-text-muted">Organization email</Text>
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-body-lg text-text-primary">{loginEmail || "—"}</Text>
                  {email.phase === "verified" ? (
                    <StatusChip tone="success" label="Verified" icon="circle-check" />
                  ) : null}
                </View>
              </View>
            ) : null}

            <Text className="text-caption text-text-muted">
              By sending, you confirm the documents are genuine and belong to the {officerWord} named above.
            </Text>
          </StepShell>
        ) : null}

        {notice ? (
          notice.tone === "error" && last ? (
            <ErrorState
              label="Not sent"
              body={notice.message}
              retryLabel="Try again"
              onRetry={() => void finish()}
            />
          ) : (
            <Text className={notice.tone === "error" ? "text-body text-error" : "text-body text-text-secondary"}>
              {notice.message}
            </Text>
          )
        ) : null}

        <View className="gap-3">
          {stepId === "email" && email.phase === "idle" ? (
            <PrimaryButton label="Send code" onPress={() => void sendCode()} />
          ) : stepId === "email" && email.phase === "sending" ? (
            <PrimaryButton label="Sending code…" disabled />
          ) : codeOpen ? null : last ? (
            <PrimaryButton label={primaryLabel} disabled={submitting} onPress={() => void finish()} />
          ) : (
            <PrimaryButton label={primaryLabel} onPress={next} />
          )}
          {index > 0 ? <SecondaryButton label="Back" onPress={back} /> : null}
          {index === 0 ? <SecondaryButton label="Not now" onPress={() => router.back()} /> : null}
        </View>
      </View>
    </FormScreen>
  );
}

function EmailPanel({ email, verified }: { email: string; verified: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card flex-row items-center gap-3">
      <MailCheck size={22} color={verified ? colors.success : colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-caption text-text-muted">Organization sign-in email</Text>
        <Text className="text-body-lg font-medium text-text-primary" numberOfLines={1}>
          {email || "—"}
        </Text>
      </View>
      {verified ? <StatusChip tone="success" label="Verified" icon="circle-check" /> : null}
    </View>
  );
}
