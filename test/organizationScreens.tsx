import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import * as members from "@/lib/organizationMembersApi";
import { useMemberInvite } from "@/store/memberInvite";
import { useMemberListDraft } from "@/store/memberListDraft";
import { useOrganizationEvents } from "@/store/organizationEvents";
import { useOrganizationMembers } from "@/store/organizationMembers";
import { useSession } from "@/store/session";
import { EVENT, MEMBER, ORG_USER, PARTNERSHIP, REQUEST, SUMMARY, TERM } from "@/test/organizationMembers";

/** For the #474 screen tests: the file itself mocks `@/lib/organizationMembersApi` and `expo-router`. */

export const officerApi = members as jest.Mocked<typeof members>;

export function renderScreen(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

/** A live partner with two pages' worth of nothing surprising. */
export function signInOfficer() {
  Object.values(officerApi).forEach((fn) => jest.isMockFunction(fn) && fn.mockReset());
  useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
  useOrganizationMembers.getState().reset();
  useMemberInvite.getState().reset();
  useMemberListDraft.getState().reset();
  useOrganizationEvents.getState().reset();
  officerApi.getMembersSummary.mockResolvedValue(SUMMARY);
  officerApi.getPartnership.mockResolvedValue(PARTNERSHIP);
  officerApi.listMemberRequests.mockResolvedValue({ requests: [REQUEST], total: 1, nextCursor: null });
  officerApi.listMembers.mockResolvedValue({ term: TERM, members: [MEMBER], total: 1, nextCursor: null });
  officerApi.getMember.mockResolvedValue(MEMBER);
  officerApi.getMemberInvite.mockResolvedValue({
    term: TERM,
    token: "tok",
    path: "/join/tok",
    createdAt: "2026-11-01T00:00:00Z",
    expiresAt: "2027-05-31T16:00:00Z",
  });
  officerApi.getMemberListEntries.mockResolvedValue({
    entries: [],
    nextCursor: null,
    counts: { waiting: 0, accepted: 0, dismissed: 0, expired: 0, removed: 0 },
  });
  officerApi.listOrganizationEvents.mockResolvedValue(PARTNERSHIP.events);
  officerApi.getOrganizationEvent.mockResolvedValue(EVENT);
}
