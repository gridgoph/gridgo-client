import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CircleCheck, TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { StarRating } from "@/components/StarRating";
import {
  ChoicePicker,
  PriceScale,
  QuestionMark,
  RecommendScale,
  RewardMeter,
  TagPicker,
} from "@/components/survey/SurveyControls";
import { VoucherTicket } from "@/components/VoucherTicket";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { orderTotalMinor } from "@/lib/orderState";
import {
  DIRECT_SHOP_QUESTION,
  EMPTY_SURVEY_DRAFT,
  NOT_WORTH_IT,
  ORDER_AGAIN_QUESTION,
  PRICE_WORTH_QUESTION,
  REPORT_PROBLEM_BODY,
  REPORT_PROBLEM_LABEL,
  REPORT_PROBLEM_TITLE,
  SURVEY_NOTE_MAX,
  surveyReward,
  canSend,
  directShopLabel,
  directShopOptionsFor,
  easeTagsFor,
  expectedPriceProblem,
  fulfillmentQuestion,
  fulfillmentTagsFor,
  missingLine,
  noRewardLine,
  offersNotWorthIt,
  openUntilLine,
  orderAgainLabel,
  orderAgainOptionsFor,
  priceWorthLabel,
  priceWorthTagsFor,
  recommendWord,
  requiredAnswered,
  surveyThanks,
  surveyView,
  toggleChoice,
  toggleTag,
  toggleWorthTag,
  type SurveyDraft,
} from "@/lib/survey";
import { VOUCHERS_ROUTE, exactTime } from "@/lib/vouchers";
import { useSurvey } from "@/store/survey";

/**
 * The post-order survey (report 81CA4493; gridgo-api `docs/SURVEY_API.md`).
 *
 * One page, not a wizard. Five questions paged one at a time would be five
 * screens and four "Next"s for something promised to take thirty seconds;
 * on one page the whole length is visible from the first star, which is what
 * makes "about 30 seconds" believable.
 *
 * The three questions that count for the voucher are numbered and come
 * first, and a meter in the pinned bar fills as they are answered — so the
 * reward is earned in front of the client rather than described. The rest
 * sits under "If you have a moment", plainly optional.
 *
 * Answers are kept per order for as long as the app is open (`useSurvey`), so
 * leaving to check something and coming back finds them as they were. There
 * is no partial save on GRIDGO and no editing afterwards: "Send" is final,
 * and the screen becomes the thank-you — with the voucher and its code when
 * one came with it, and the way to report a problem when a low star score
 * arrived while the issue window is still open. The survey itself never
 * reports anything or asks for a refund.
 */
export default function OrderSurveyScreen() {
  const { orderId = "", from } = useLocalSearchParams<{ orderId: string; from?: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  const survey = useSurvey((state) => state.surveys[orderId]);
  const status = useSurvey((state) => state.status[orderId]);
  const options = useSurvey((state) => state.options);
  const draft = useSurvey((state) => state.drafts[orderId]) ?? EMPTY_SURVEY_DRAFT;
  const busy = useSurvey((state) => state.busy[orderId] ?? null);
  const error = useSurvey((state) => state.errors[orderId] ?? null);
  const load = useSurvey((state) => state.load);
  const setDraft = useSurvey((state) => state.setDraft);
  const submit = useSurvey((state) => state.submit);
  const dismiss = useSurvey((state) => state.dismiss);
  const requestReport = useSurvey((state) => state.requestReport);
  const now = useServerNow(60_000);

  // The order's name and total: context only, so a failed read costs nothing.
  const [order, setOrder] = useState<api.Order | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let live = true;
    api
      .getOrder(orderId)
      .then((value) => {
        if (live) setOrder(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [orderId]);

  // Re-read on every visit: the low-score shortcut and the reward preview are
  // GRIDGO's to decide each time, and a survey can close while away.
  useFocusEffect(
    useCallback(() => {
      if (orderId) void load(orderId);
    }, [orderId, load]),
  );

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/order/${orderId}`);
  };
  const reportProblem = () => {
    requestReport(orderId);
    // Opened from the order: the issue form is one step back. Opened from a
    // notification: the order replaces the survey, with its form open.
    if (from === "order" && router.canGoBack()) router.back();
    else router.replace(`/order/${orderId}`);
  };

  const view = surveyView(survey, now);
  const update = (patch: Partial<SurveyDraft>) => setDraft(orderId, patch);

  if (survey === undefined) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pb-8 pt-4">
          {status === "error" ? (
            <ErrorState
              label="Survey not loaded"
              body="GRIDGO could not load this survey. Check your connection and try again."
              onRetry={() => void load(orderId)}
            />
          ) : (
            <View className="gap-4" accessibilityLabel="Loading the survey">
              <SkeletonLine width="w-3/4" height="h-8" />
              <SkeletonLine width="w-1/2" height="h-5" />
              <SkeletonBlock className="h-64 w-full rounded-card" />
            </View>
          )}
        </View>
      </FormScreen>
    );
  }

  if (!view) {
    return (
      <FormScreen>
        <View className="gg-page pb-8 pt-4">
          <EmptyState
            title={survey ? "This survey has closed" : "No survey for this order"}
            body={
              survey
                ? `It was open until ${exactTime(survey.expiresAt)}. Surveys stay open for 7 days after an order is handed over.`
                : "A short survey opens once an order has been delivered to you or collected."
            }
            actionLabel="Back to your order"
            onAction={leave}
          />
        </View>
      </FormScreen>
    );
  }

  /* ------------------------------------------------------------ Thank you */

  if (view.kind === "sent") {
    const thanks = surveyThanks(view.survey);
    const reward = thanks.rewardIssued ? view.survey.reward : null;
    const report = view.survey.reportProblem;
    return (
      <FormScreen
        footer={
          <View className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3">
            {report ? <SecondaryButton label="Done" onPress={leave} /> : <PrimaryButton label="Done" onPress={leave} />}
          </View>
        }
      >
        <View className="gg-page gap-6 pb-8 pt-4">
          <View className="gap-3" accessible accessibilityRole="header" accessibilityLabel={`${thanks.title}. ${thanks.body}`}>
            <CircleCheck size={40} color={colors.success} strokeWidth={1.75} aria-hidden />
            <Text className="text-h1 text-text-primary">{thanks.title}</Text>
            <Text className="text-body-lg text-text-secondary">{thanks.body}</Text>
          </View>

          {reward ? (
            <View className="gap-3">
              <VoucherTicket voucher={reward} />
              <Text className="text-caption text-text-muted">
                GRIDGO applies it at checkout on its own. The code is yours alone: it finds this same voucher and cannot
                be given to someone else.
              </Text>
              <SecondaryButton label="See your vouchers" onPress={() => router.push(VOUCHERS_ROUTE)} />
            </View>
          ) : null}

          {report ? (
            <View className="gg-card gap-3 border-warning" testID="survey-report">
              <View className="flex-row items-start gap-3">
                <TriangleAlert size={20} color={colors.warning} strokeWidth={2} aria-hidden />
                <View className="flex-1 gap-1">
                  <Text className="text-body-lg font-medium text-text-primary">{REPORT_PROBLEM_TITLE}</Text>
                  <Text className="text-body text-text-secondary">{REPORT_PROBLEM_BODY}</Text>
                </View>
              </View>
              <PrimaryButton label={report.label || REPORT_PROBLEM_LABEL} onPress={reportProblem} />
            </View>
          ) : null}
        </View>
      </FormScreen>
    );
  }

  /* ------------------------------------------------------------ The form */

  const kind = view.survey.fulfillmentKind;
  const question = fulfillmentQuestion(kind);
  const answered = requiredAnswered(draft);
  const ready = canSend(draft);
  const priceProblem = expectedPriceProblem(draft.expectedPrice);
  const missing = missingLine(draft, kind);
  const reward = surveyReward(view.survey);
  const noReward = noRewardLine(view.survey);
  const total = order ? orderTotalMinor(order) : null;
  const skipped = view.kind === "skipped";

  return (
    <FormScreen
      footer={
        <View testID="survey-footer" className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3">
          <RewardMeter answered={answered} reward={reward} />
          {error ? (
            <Text className="text-body text-error" accessibilityRole="alert">
              {error}
            </Text>
          ) : !ready && answered === 3 && priceProblem ? (
            <Text className="text-caption text-text-muted">Fix the expected price, or clear it, to send.</Text>
          ) : null}
          <PrimaryButton
            label={busy === "submitting" ? "Sending…" : "Send answers"}
            onPress={() => void submit(orderId)}
            disabled={!ready || busy != null}
          />
          <Pressable
            onPress={() => (skipped ? leave() : void dismiss(orderId).then((ok) => ok && leave()))}
            disabled={busy != null}
            accessibilityRole="button"
            accessibilityLabel={skipped ? "Not now" : "Skip this survey"}
            accessibilityState={{ disabled: busy != null }}
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : busy ? { opacity: 0.38 } : undefined)}
          >
            <Text className="text-button text-text-secondary">
              {skipped ? "Not now" : busy === "dismissing" ? "Skipping…" : "Skip this survey"}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="gg-page gap-6 pb-8 pt-2">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            How did your order go?
          </Text>
          {order?.title ? <Text className="text-body-lg text-text-secondary">{order.title}</Text> : null}
          <Text className="text-caption text-text-muted">
            About 30 seconds. {openUntilLine(view.survey)}.
          </Text>
          {noReward ? <Text className="text-caption text-text-muted">{noReward}</Text> : null}
        </View>

        {/* The three that count, on one board. */}
        <View className="gg-card-flush">
          <Question number={1} answered={draft.fulfillmentStars > 0} title={question.title}>
            <StarRating
              label={question.title}
              value={draft.fulfillmentStars}
              onChange={(stars) => update({ fulfillmentStars: stars })}
            />
            {draft.fulfillmentStars > 0 ? (
              <TagGroup
                group={question.title}
                tags={fulfillmentTagsFor(options, kind)}
                selected={draft.fulfillmentTags}
                onToggle={(code) => update({ fulfillmentTags: toggleTag(draft.fulfillmentTags, code) })}
              />
            ) : null}
          </Question>

          <Question number={2} answered={draft.easeStars > 0} title="How easy was ordering in the app?" divided>
            <StarRating
              label="How easy was ordering"
              value={draft.easeStars}
              onChange={(stars) => update({ easeStars: stars })}
            />
            {draft.easeStars > 0 ? (
              <TagGroup
                group="Ordering"
                tags={easeTagsFor(options)}
                selected={draft.easeTags}
                onToggle={(code) => update({ easeTags: toggleTag(draft.easeTags, code) })}
              />
            ) : null}
          </Question>

          <Question number={3} answered={draft.priceFeeling > 0} title="How did the price feel?" divided>
            {total != null ? (
              <Text className="text-caption text-text-muted">This order came to {formatPhp(total)}.</Text>
            ) : null}
            <PriceScale value={draft.priceFeeling} onChange={(value) => update({ priceFeeling: value })} />
            {draft.priceFeeling > 0 ? (
              <View className="gap-2 pt-1">
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text className="flex-1 text-body text-text-primary">What price would have felt right?</Text>
                  <Text className="text-caption text-text-muted">Optional</Text>
                </View>
                <TextField
                  value={draft.expectedPrice}
                  onChangeText={(text) => update({ expectedPrice: text })}
                  placeholder="₱ amount"
                  keyboardType="decimal-pad"
                  accessibilityLabel="What price would have felt right, in pesos, optional"
                  maxLength={14}
                />
                {priceProblem ? <Text className="text-caption text-error">{priceProblem}</Text> : null}
              </View>
            ) : null}
          </Question>
        </View>

        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-h3 text-text-primary">If you have a moment</Text>
            <Text className="text-caption text-text-muted">Optional. Leave any of these empty.</Text>
          </View>
          <View className="gg-card-flush">
            {/* The price questions come first, straight after the price itself. */}
            <Question title={DIRECT_SHOP_QUESTION}>
              <ChoicePicker
                choices={directShopOptionsFor(options)}
                value={draft.directShopComparison}
                onChange={(code) => update({ directShopComparison: toggleChoice(draft.directShopComparison, code) })}
                group="Compared with a print shop:"
                labelFor={directShopLabel}
              />
            </Question>
            <Question title={PRICE_WORTH_QUESTION} divided>
              <Text className="text-caption text-text-muted">Pick any.</Text>
              <TagPicker
                tags={priceWorthTagsFor(options, kind)}
                selected={draft.priceWorthTags}
                onToggle={(code) => update({ priceWorthTags: toggleWorthTag(draft.priceWorthTags, code) })}
                group="Worth it for"
                labelFor={priceWorthLabel}
              />
              {offersNotWorthIt(options) ? (
                // The opposite answer, set apart: choosing it clears the reasons above.
                <View className="flex-row items-center gap-3 pt-1">
                  <Text className="text-caption text-text-muted">or</Text>
                  <TagPicker
                    tags={[NOT_WORTH_IT]}
                    selected={draft.priceWorthTags}
                    onToggle={(code) => update({ priceWorthTags: toggleWorthTag(draft.priceWorthTags, code) })}
                    group="Price"
                    labelFor={priceWorthLabel}
                  />
                </View>
              ) : null}
            </Question>
            <Question title={ORDER_AGAIN_QUESTION} divided>
              <ChoicePicker
                choices={orderAgainOptionsFor(options)}
                value={draft.orderAgainAtPrice}
                onChange={(code) => update({ orderAgainAtPrice: toggleChoice(draft.orderAgainAtPrice, code) })}
                group="Order again at this price:"
                labelFor={orderAgainLabel}
                layout="row"
              />
            </Question>
            <Question title="How was the print quality?" divided>
              <StarRating
                label="Print quality"
                value={draft.qualityStars}
                onChange={(stars) => update({ qualityStars: stars === draft.qualityStars ? 0 : stars })}
              />
            </Question>
            <Question title="How likely are you to recommend GRIDGO to a friend?" divided>
              <RecommendScale
                value={draft.recommendScore}
                onChange={(score) => update({ recommendScore: score === draft.recommendScore ? null : score })}
              />
              <Text aria-hidden className={draft.recommendScore == null ? "text-body text-text-muted" : "text-body text-text-primary"}>
                {draft.recommendScore == null ? "Not answered" : recommendWord(draft.recommendScore)}
              </Text>
            </Question>
            <Question title="One thing GRIDGO could do better" divided>
              <TextField
                value={draft.improvementNote}
                onChangeText={(text) => update({ improvementNote: text })}
                placeholder="Anything at all, from ordering to delivery."
                multiline
                maxLength={SURVEY_NOTE_MAX}
                accessibilityLabel="One thing GRIDGO could do better, optional"
              />
            </Question>
          </View>
          {missing ? <Text className="text-caption text-text-muted">{missing}</Text> : null}
        </View>
      </View>
    </FormScreen>
  );
}

/** One question on a board: its number when it counts, its words, its control. */
function Question({
  number,
  answered = false,
  title,
  divided,
  children,
}: {
  number?: number;
  answered?: boolean;
  title: string;
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <View className={divided ? "gap-3 border-t border-outline-subtle p-4" : "gap-3 p-4"}>
      <View className="flex-row items-center gap-3">
        {number ? <QuestionMark number={number} answered={answered} /> : null}
        <Text className="flex-1 text-body-lg font-medium text-text-primary">{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** The optional tags under a star answer. */
function TagGroup({
  group,
  tags,
  selected,
  onToggle,
}: {
  group: string;
  tags: readonly string[];
  selected: readonly string[];
  onToggle: (code: string) => void;
}) {
  return (
    <View className="gap-2 pt-1">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-body text-text-primary">What stood out?</Text>
        <Text className="text-caption text-text-muted">Optional, pick any</Text>
      </View>
      <TagPicker tags={tags} selected={selected} onToggle={onToggle} group={group} />
    </View>
  );
}
