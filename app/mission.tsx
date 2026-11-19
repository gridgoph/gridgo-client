import { FoundingTesterScreen } from "@/components/FoundingTesterScreen";

/**
 * The once-a-day mission popup (gridgo-client#441): the Founding Tester screen
 * unchanged, presented over Home with the How to order tip bar and Later.
 * Home opens it (`shouldOpenMissionPopup`); GRIDGO keeps the day it was shown.
 */
export default function MissionPopupRoute() {
  return <FoundingTesterScreen popup />;
}
