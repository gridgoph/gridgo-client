import { useEffect } from "react";

import { PlayOptinCard } from "@/components/PlayOptinCard";
import { TesterCheckInCard } from "@/components/TesterCheckInCard";
import { TesterFeedbackCard } from "@/components/TesterFeedbackCard";
import { playOptinCardVisible } from "@/lib/playOptin";
import { feedbackAllowed, feedbackToShow, testerCardView } from "@/lib/testerProgram";
import { currentPlayOptinInstall, usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * The Google Play tester's one line on Home: the check-in card, or — once
 * today is in and GRIDGO has a feedback ask due — the feedback card in its
 * place, so Home never grows by two cards. Nothing for anyone not enrolled.
 *
 * Ahead of both, on an Android install Play does not count yet, GRIDGO's ask
 * to join the Play closed test (`lib/playOptin.ts`) — the run only counts once
 * the person is on the Play build.
 */
export function HomeTesterSlot({ onOpenPlayOptin }: { onOpenPlayOptin: () => void }) {
  const userId = useSession((s) => s.user?.id ?? null);
  const optinOwner = usePlayOptin((s) => s.owner);
  const optin = usePlayOptin((s) => (optinOwner === userId ? s.state : null));
  const optinClosed = usePlayOptin((s) => s.dismissedThisSession);
  const showOptin = playOptinCardVisible(optin, currentPlayOptinInstall(), optinClosed);
  const owner = useTesterProgram((s) => s.owner);
  const program = useTesterProgram((s) => (owner === userId ? s.program : null));
  const held = useTesterProgram((s) => s.held);
  const busy = useTesterProgram((s) => s.checkingIn);
  const failed = useTesterProgram((s) => s.checkInFailed);
  const readAt = useTesterProgram((s) => s.readAt);

  const view = testerCardView(program);
  const feedback =
    program?.enrolled && feedbackAllowed(program) ? feedbackToShow(program.nudge, held, userId, readAt) : null;
  // Never "shown" while the Play ask holds the slot instead.
  const freshTrigger = feedback?.fresh && !showOptin ? feedback.trigger : null;

  // A card GRIDGO offered is "shown" the moment it is drawn, and held from then on.
  useEffect(() => {
    if (freshTrigger) useTesterProgram.getState().feedbackShown(freshTrigger);
  }, [freshTrigger]);

  // GRIDGO's ask is "shown" only once it is actually on screen.
  useEffect(() => {
    if (showOptin) usePlayOptin.getState().shown();
  }, [showOptin]);

  if (showOptin) {
    return (
      <PlayOptinCard
        onOpen={() => {
          usePlayOptin.getState().tapped();
          onOpenPlayOptin();
        }}
        onDismiss={() => usePlayOptin.getState().dismiss()}
      />
    );
  }
  if (feedback) {
    return (
      <TesterFeedbackCard
        onOpen={() => void useTesterProgram.getState().feedbackTapped()}
        onDismiss={() => useTesterProgram.getState().feedbackDismissed()}
      />
    );
  }
  if (!view) return null;
  return (
    <TesterCheckInCard
      view={view}
      busy={busy}
      failed={failed}
      onCheckIn={() => void useTesterProgram.getState().checkIn()}
    />
  );
}
