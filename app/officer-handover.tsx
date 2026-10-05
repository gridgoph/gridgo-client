import { router } from "expo-router";

import { ApplicationFlow } from "@/components/application/ApplicationFlow";
import { useOrganization } from "@/store/organization";

/**
 * Handing an organization to a new officer (gridgo-client#164).
 *
 * The new officer verifies the same way the first one did — their own ID,
 * student ID and enrolment, and a fresh code to the organization's email — so
 * the account passes to a newly verified person rather than a name simply
 * being swapped. The current officer stays on record, and ordering carries on,
 * until Operations approves (5 Oct decision).
 */
export default function OfficerHandoverScreen() {
  const organization = useOrganization((s) => s.organization);
  return <ApplicationFlow mode="handover" organization={organization} onDone={() => router.back()} />;
}
