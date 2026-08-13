import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import { parsePushData, PUSH_FOREGROUND_BEHAVIOR, pushTargetRoute } from "@/lib/push";
import { hasActiveSession } from "@/lib/sessionGuard";
import { useNotifications } from "@/store/notifications";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";

/**
 * Push, wired to the app: registration, token rotation, and opening the right
 * screen when someone taps a notification.
 *
 * Mounted once, from the root layout. Everything it decides comes from
 * `lib/push.ts`; everything it stores goes through `store/push.ts`. The
 * supplier and rider apps can take this file wholesale — the only app-specific
 * thing it touches is `pushTargetRoute`.
 */

/**
 * What a push does while the app is open and in front of the person.
 *
 * Nothing visible — see `PUSH_FOREGROUND_BEHAVIOR`. Set at module scope
 * deliberately: this must be in place before the first notification can arrive,
 * and a handler installed inside an effect races the notification that woke the
 * app. It runs only in the foreground, so a closed or backgrounded app is
 * untouched and Android draws the server's own title and body.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ ...PUSH_FOREGROUND_BEHAVIOR }),
});

export function usePushNotifications(): void {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const signedIn = hasActiveSession(user);

  /**
   * A tap that arrived before there was anywhere to send it.
   *
   * A notification tapped from a cold start opens the app on the login screen,
   * because the session lives in memory and a killed process has none. Routing
   * to the order then would bounce off the route guard, so the target waits
   * here and is spent when a session appears.
   *
   * **Known gap, seen on a device:** in the one cold-start run observed, this
   * deferred push did not land — signing in went to Home. The likely cause is
   * that `Stack.Protected` swaps the root stack's children in the same commit
   * that flips the guard, so a `push` issued then is discarded. Taps route
   * correctly whenever the process is still alive. Persisting the session
   * would remove the situation; re-test on a device before trusting this path.
   */
  const pending = useRef<string | null>(null);
  /** Response identifiers already routed, so a tap opens its screen once. */
  const routed = useRef(new Set<string>());

  useEffect(() => {
    // Register on **every launch**, signed in or not, and again whenever the
    // account changes. The contract calls this idempotent and cheap and asks
    // apps to do exactly that — a token Firebase has quietly reissued is the
    // common way push stops arriving with nothing visibly wrong.
    //
    // Not gated on a session: a phone with permission granted and nobody
    // signed in registers unclaimed, which is what lets GRIDGO tell a customer
    // that installed the app and stopped there to update it. Signing in
    // re-runs this with a bearer and claims the same token — see `store/push.ts`.
    void usePush.getState().registerIfGranted();
  }, [signedIn, user?.id]);

  useEffect(() => {
    const route = (identifier: string, data: unknown) => {
      if (routed.current.has(identifier)) return;
      routed.current.add(identifier);
      const target = pushTargetRoute(parsePushData(data));
      if (!hasActiveSession(useSession.getState().user)) {
        pending.current = target;
        return;
      }
      // The push carries no order state by design, so the screen fetches the
      // order itself. Re-read the list too: the record behind this push is
      // already in it, and its unread badge should not survive the tap.
      void useNotifications.getState().refresh();
      // `pushTargetRoute` returns a route this app declares; typed routes
      // cannot see that through a string it built at runtime.
      router.push(target as Href);
    };

    // A tap while the app is running or backgrounded.
    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      route(
        response.notification.request.identifier,
        response.notification.request.content.data,
      );
    });

    // A tap that launched the app. The listener above does not replay it.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      route(
        response.notification.request.identifier,
        response.notification.request.content.data,
      );
    });

    // A push landing in the foreground shows nothing (see the handler above);
    // its whole effect is that the in-app list and its badge catch up.
    const received = Notifications.addNotificationReceivedListener(() => {
      void useNotifications.getState().refresh();
    });

    // Firebase can reissue a token while the app is running. A stale one stops
    // delivering silently, which is the failure nobody reports.
    const rotated = Notifications.addPushTokenListener((token) => {
      if (typeof token.data === "string" && token.data) {
        void usePush.getState().adoptToken(token.data);
      }
    });

    return () => {
      tap.remove();
      received.remove();
      rotated.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!signedIn || !pending.current) return;
    const target = pending.current;
    pending.current = null;
    router.push(target as Href);
  }, [signedIn, router]);
}
