import type { FoundingTesterRead, TesterInvites } from "@/lib/api";
import { useFoundingTester } from "@/store/foundingTester";
import { useSession } from "@/store/session";

/** Shared set-up for the invite screen's tests, which are split one press per file. */

export const LINK = "https://forms.example.test/signup?entry.123=490AACF00590880CC0461E17";

export function inviteRead(invites: Partial<TesterInvites> = {}): FoundingTesterRead {
  return {
    serverTime: new Date().toISOString(),
    foundingTester: {
      eligible: true,
      label: null,
      awardedAt: null,
      missions: { added: true, placed: false, tracked: false, received: false, rated: false },
      completedCount: 1,
      rewardStatus: "pending",
      reward: null,
    },
    invites: { code: "490AACF00590880CC0461E17", link: LINK, invited: 3, joined: 2, completed: 1, ...invites },
  };
}

export function setUpInvite() {
  useFoundingTester.getState().resetAccount();
  useSession.setState({ user: { id: "u1", email: "c@example.test", name: "Client", role: "client" } } as never);
}
