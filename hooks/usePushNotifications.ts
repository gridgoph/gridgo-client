import { getOrder } from "@/lib/api";
import {
  useRouter,
  useRootNavigationState,
  useSegments,
  type Href,
} from "expo-router";
import { useEffect, useLayoutEffect, useRef } from "react";

import {
  parsePushData,
  PUSH_FOREGROUND_BEHAVIOR,
  pushTargetRoute,
} from "@/lib/push";
import { hasActiveSession } from "@/lib/sessionGuard";
import { useNotifications } from "@/store/notifications";
import { getNotificationsNative, pushSupported, usePush } from "@/store/push";
import { useSession } from "@/store/session";

/**
 * Push, wired to the app: registration, token rotation, and opening the right
 * screen when someone taps a notification.
 *
 * Mounted once, from the root layout. Everything it decides comes from
 * `lib/push.ts`; everything it stores goes through `store/push.ts`. The
 * supplier and rider apps must adapt the protected-route readiness check and
 * authorized destination read as well as `pushTargetRoute`.
 *
 * Do not statically import `expo-notifications`. Expo Go Android SDK 53 throws
 * at import time; `getNotificationsNative` skips that runtime or swallows a
 * failed load so a throw costs push, never the app.
 */

export function usePushNotifications(): void {
  const router = useRouter();
  const navigation = useRootNavigationState();
  const segments = useSegments();
  const protectedReady = Boolean(
    navigation?.key &&
    segments[0] &&
    segments[0] !== "(auth)" &&
    segments[0] !== "index" &&
    segments[0] !== "sso-callback",
  );
  const readyRef = useRef(protectedReady);
  useLayoutEffect(() => {
    readyRef.current = protectedReady;
  }, [protectedReady]);
  const user = useSession((s) => s.user);
  const signedIn = hasActiveSession(user);

  /**
   * A tap that arrived before there was anywhere to send it.
   *
   * The GRIDGO projection lives in memory, so a cold-start target waits while
   * Clerk restores or the person signs in. Routing before that projection is
   * ready would bounce off the route guard.
   *
   * Wait for an authenticated destination to mount, then route on the next
   * animation frame. Authentication alone does not mean Stack.Protected has
   * committed its destination tree. Native cold-start delivery still needs a
   * device check after builds.
   */
  const tapSequence = useRef(0);
  const pending = useRef<{target: string; ownerId: string | null; sequence: number} | null>(null);
  useEffect(() => {
    const unsubscribe = useSession.subscribe((state, previous) => {
      if (previous.user?.id && previous.user.id !== state.user?.id) {
        tapSequence.current++;
        pending.current = null;
      }
    });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the latest tap on cleanup; this ref is a sequence counter, not a node.
      tapSequence.current++;
      unsubscribe();
    };
  }, []);
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
    // Web has no FCM surface in this MVP; Expo Go throws on the import. A
    // throw from any of these calls must cost push, never the screen.
    if (!pushSupported()) return;
    let Notifications: ReturnType<typeof getNotificationsNative>;
    try {
      Notifications = getNotificationsNative();
    } catch {
      return;
    }
    if (!Notifications) return;

    const route = (identifier: string, data: unknown) => {
      if (routed.current.has(identifier)) return;
      routed.current.add(identifier);
      const sequence = ++tapSequence.current;
      pending.current = null;
      const target = pushTargetRoute(parsePushData(data));
      if (!hasActiveSession(useSession.getState().user) || !readyRef.current) {
        pending.current = {target, ownerId: useSession.getState().user?.id ?? null, sequence};
        return;
      }
      // The push carries no order state by design, so the screen fetches the
      // order itself. Re-read the list too: the record behind this push is
      // already in it, and its unread badge should not survive the tap.
      void useNotifications.getState().refresh();
      // `pushTargetRoute` returns a route this app declares; typed routes
      // cannot see that through a string it built at runtime.
      const ownerId = useSession.getState().user?.id;
      void (async () => {
        let destination = target;
        if (target.startsWith("/order/")) {
          try { await getOrder(target.slice("/order/".length)); }
          catch { destination = "/(tabs)/notifications"; }
        }
        if (sequence === tapSequence.current && ownerId && ownerId === useSession.getState().user?.id && readyRef.current) router.push(destination as Href);
      })();
    };

    try {
      /**
       * What a push does while the app is open and in front of the person.
       *
       * Nothing visible — see `PUSH_FOREGROUND_BEHAVIOR`. Installed as soon as
       * the native module is known to exist, before the listeners below. It
       * runs only in the foreground, so a closed or backgrounded app is
       * untouched and Android draws the server's own title and body.
       */
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ ...PUSH_FOREGROUND_BEHAVIOR }),
      });

      // A tap while the app is running or backgrounded.
      const launchSequence = tapSequence.current;
      const tap = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          route(
            response.notification.request.identifier,
            response.notification.request.content.data,
          );
        },
      );

      // A tap that launched the app. The listener above does not replay it.
      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response || launchSequence !== tapSequence.current) return;
          route(
            response.notification.request.identifier,
            response.notification.request.content.data,
          );
        })
        .catch(() => {
          // Expo Go / web: the method is missing. Push stays off.
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
    } catch {
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!signedIn || !protectedReady || !pending.current) return;
    const entry = pending.current;
    const ownerId = user?.id;
    if (entry.ownerId && entry.ownerId !== ownerId) {pending.current=null;return;}
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void (async () => {
        let destination = entry.target;
        if (destination.startsWith("/order/")) {
          try { await getOrder(destination.slice("/order/".length)); }
          catch { destination = "/(tabs)/notifications"; }
        }
        if (cancelled || entry.sequence !== tapSequence.current || ownerId !== useSession.getState().user?.id || !readyRef.current || pending.current !== entry) return;
        router.push(destination as Href);
        pending.current = null;
        void getNotificationsNative()?.clearLastNotificationResponseAsync?.().catch(() => undefined);
      })();
    });
    return () => {cancelled=true;cancelAnimationFrame(frame);};
  }, [signedIn, protectedReady, router, user?.id]);
}
