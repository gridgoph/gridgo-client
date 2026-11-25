import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { LinkRow, PartnerBadge } from "@/components/organization/MemberParts";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { MEMBERS_ROUTE, membersRowDetail, PARTNERSHIP_ROUTE, partnershipRowDetail } from "@/lib/organizationMembers";
import { useOrganizationMembers } from "@/store/organizationMembers";
import { useSession } from "@/store/session";

/**
 * What a partner organization has on Account (gridgo-client#474): the badge by
 * its name, and the way to its members and partnership. GRIDGO's answer decides
 * whether any of it is there, so an account that is not a partner sees nothing.
 */

/** The badge beside the account chips, while GRIDGO's partnership has it. */
export function AccountPartnerBadge() {
  const shown = useOrganizationMembers((s) => s.partner === "live" && Boolean(s.partnership?.benefits.badge));
  return shown ? <PartnerBadge /> : null;
}

/** Members and Partnership. Reads both each time Account comes back into view. */
export function AccountPartnerRows() {
  const partner = useOrganizationMembers((s) => s.partner);
  const summary = useOrganizationMembers((s) => s.summary);
  const partnership = useOrganizationMembers((s) => s.partnership);
  const isOrganization = useSession((s) => s.user?.accountType === "organization");

  const load = useCallback(async () => {
    if (useSession.getState().user?.accountType !== "organization") return;
    const store = useOrganizationMembers.getState();
    await Promise.all([store.loadSummary(), store.loadPartnership()]);
  }, []);

  useLiveRefresh(["identity"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!isOrganization || partner !== "live") return null;
  return (
    <View className="gap-2" testID="account-partner-rows">
      <LinkRow boxed title="Members" detail={membersRowDetail(summary)} onPress={() => router.push(MEMBERS_ROUTE)} />
      <LinkRow
        boxed
        title="Partnership"
        detail={partnershipRowDetail(partnership)}
        onPress={() => router.push(PARTNERSHIP_ROUTE)}
      />
    </View>
  );
}
