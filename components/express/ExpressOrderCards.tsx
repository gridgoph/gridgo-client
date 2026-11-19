import { useRouter } from "expo-router";
import {
  Check,
  CircleCheck,
  CircleX,
  Copy,
  Hand,
  MessageCircle,
  Navigation,
  Package,
  Printer,
  Send,
  Share2,
  Star,
  Ticket,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, Share, Text, View } from "react-native";

import { DeliveryMap } from "@/components/DeliveryMap";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { copyText } from "@/lib/copyText";
import { userFacingError } from "@/lib/copy";
import {
  directionsUrl,
  formatPickupCode,
  RAIL_LABELS,
  ratingBody,
  ratingTags,
  type ExpressPhase,
} from "@/lib/expressOrder";

const RAIL_ICONS: LucideIcon[] = [Send, Printer, Package, Hand];

/** Sent · Printing · Ready · Picked up. Done stops are ink, the current one yellow. */
export function ExpressRail({ index, pickup }: { index: number; pickup: boolean }) {
  const colors = useThemeColors();
  const labels = RAIL_LABELS(pickup);
  return (
    <View className="flex-row items-start" accessible accessibilityLabel={`Step ${index + 1} of 4: ${labels[index]}`}>
      {labels.map((label, stop) => {
        const Icon = RAIL_ICONS[stop];
        const done = stop < index;
        const current = stop === index;
        return (
          <View key={label} className="flex-1 items-center gap-1">
            <View className="w-full flex-row items-center">
              <View className={stop === 0 ? "h-0.5 flex-1" : stop <= index ? "h-0.5 flex-1 bg-accent" : "h-0.5 flex-1 bg-outline"} />
              <View
                className={
                  current
                    ? "h-10 w-10 items-center justify-center rounded-pill bg-action-yellow"
                    : done
                      ? "h-10 w-10 items-center justify-center rounded-pill bg-accent"
                      : "h-10 w-10 items-center justify-center rounded-pill border border-outline bg-surface"
                }
              >
                <Icon
                  size={18}
                  color={current ? colors.actionYellowOn : done ? colors.accentOn : colors.textMuted}
                  strokeWidth={2}
                  aria-hidden
                />
              </View>
              <View className={stop === 3 ? "h-0.5 flex-1" : stop < index ? "h-0.5 flex-1 bg-accent" : "h-0.5 flex-1 bg-outline"} />
            </View>
            <Text className={current ? "text-caption font-bold text-text-primary" : "text-caption text-text-muted"}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const HERO_ICONS: Record<ExpressPhase, LucideIcon> = {
  checking: Send,
  sending: Send,
  moved: Send,
  accepted: CircleCheck,
  printing: Printer,
  ready: CircleCheck,
  on_the_way: Package,
  done: CircleCheck,
  cancelled: CircleX,
};

export function ExpressHero({ phase, title, line, countdown }: { phase: ExpressPhase; title: string; line: string; countdown: string | null }) {
  const colors = useThemeColors();
  const Icon = HERO_ICONS[phase];
  const tone = phase === "cancelled" ? colors.error : ["ready", "done", "accepted"].includes(phase) ? colors.success : colors.textPrimary;
  return (
    <View className="flex-row items-center gap-4" accessibilityRole="header">
      <Icon size={44} color={tone} strokeWidth={1.75} aria-hidden />
      <View className="min-w-0 flex-1">
        <Text className="text-h2 font-bold text-text-primary" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-body text-text-secondary">{line}</Text>
        {countdown ? (
          <Text className="text-caption text-text-muted" accessibilityLiveRegion="polite">
            Shop has {countdown} to accept
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The six digits the shop types to hand the print over. */
export function PickupCodeCard({ code }: { code: string }) {
  const shown = formatPickupCode(code) ?? code;
  return (
    <View className="gg-card items-center gap-1" accessible accessibilityLabel={`Pickup code ${code.split("").join(" ")}`}>
      <Text className="text-body text-text-secondary">Pickup code</Text>
      <Text className="font-bold text-text-primary" style={{ fontSize: 44, lineHeight: 52, letterSpacing: 4 }}>
        {shown}
      </Text>
      <Text className="text-caption text-text-muted">A friend can collect with this code.</Text>
    </View>
  );
}

export function ShopCard({
  name,
  address,
  point,
  orderId,
  showMap,
  canMessage,
}: {
  name: string | null;
  address: string | null;
  point: api.OrderPoint | null;
  orderId: string;
  showMap: boolean;
  canMessage: boolean;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  return (
    <View className="gg-card-flush">
      {showMap && point ? (
        <View style={{ height: 140 }}>
          <DeliveryMap pickup={point} dropoff={null} rider={null} stale={false} route={[]} routed={false} fill hideZoom />
        </View>
      ) : null}
      <View className="gap-3 p-4">
        <View>
          <Text className="text-body-lg font-bold text-text-primary">{name ?? "Your Express shop"}</Text>
          {address || point?.label ? (
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {address || point?.label}
            </Text>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          {point ? (
            <Pressable
              onPress={() => void Linking.openURL(directionsUrl(point))}
              accessibilityRole="link"
              className="gg-btn-secondary flex-1"
            >
              <Navigation size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              <Text className="text-button text-text-primary">Directions</Text>
            </Pressable>
          ) : null}
          {canMessage ? (
            <Pressable
              onPress={() => router.push({ pathname: "/order/shop-chat", params: { orderId } })}
              accessibilityRole="button"
              accessibilityLabel="Message the shop"
              className="gg-btn-secondary flex-1"
            >
              <MessageCircle size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              <Text className="text-button text-text-primary">Message</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Five stars and a few tags; the review route takes it once the order is complete. */
export function RatingCard({ orderId, onRated }: { orderId: string; onRated: () => void }) {
  const colors = useThemeColors();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await api.rateOrder(orderId, ratingBody(stars, tags));
      onRated();
    } catch (failure) {
      if ((failure as { code?: string } | null)?.code === "already_rated") onRated();
      else setError(userFacingError(failure, "Your rating was not sent. Try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="gg-card gap-3">
      <Text className="text-body-lg font-bold text-text-primary">How was it?</Text>
      <View className="flex-row justify-between" accessibilityRole="radiogroup" accessibilityLabel="Stars">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            onPress={() => {
              setStars(value);
              setTags([]);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: stars === value }}
            accessibilityLabel={`${value} ${value === 1 ? "star" : "stars"}`}
            className="gg-touch items-center justify-center"
          >
            <Star
              size={32}
              color={value <= stars ? colors.brand : colors.textMuted}
              fill={value <= stars ? colors.brand : "transparent"}
              strokeWidth={1.75}
              aria-hidden
            />
          </Pressable>
        ))}
      </View>
      {stars ? (
        <View className="flex-row flex-wrap gap-2">
          {ratingTags(stars).map((tag) => {
            const on = tags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => setTags(on ? tags.filter((row) => row !== tag) : [...tags, tag])}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className={on ? "min-h-11 flex-row items-center gap-1 rounded-pill bg-accent px-3" : "min-h-11 flex-row items-center gap-1 rounded-pill border border-outline px-3"}
              >
                {on ? <Check size={14} color={colors.accentOn} strokeWidth={2.5} aria-hidden /> : null}
                <Text className={on ? "text-body text-accent-on" : "text-body text-text-primary"}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {error ? <Text className="text-caption text-error">{error}</Text> : null}
      {stars ? (
        <Pressable onPress={() => void send()} disabled={sending} accessibilityRole="button" className="gg-btn-secondary">
          <Text className="text-button text-text-primary">{sending ? "Sending…" : "Send rating"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Friend Pass: the client's own referral link to GRIDGO's early-access sign-up.
 * Both get 5% off the delivery fee of their next delivery once the friend's
 * first order completes (gridgo-api#405).
 */
export function FriendPassCard() {
  const colors = useThemeColors();
  const [pass, setPass] = useState<api.FriendPass | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getFriendPass(true)
      .then((value) => {
        if (!alive) return;
        setPass(value);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "error") return null;
  const link = pass?.link ?? null;
  return (
    <View className="gg-card gap-3">
      <View className="flex-row items-center gap-3">
        <Ticket size={24} color={colors.textPrimary} strokeWidth={1.75} aria-hidden />
        <View className="min-w-0 flex-1">
          <Text className="text-body-lg font-bold text-text-primary">Friend Pass</Text>
          <Text className="text-caption text-text-secondary">You both get 5% off your next delivery fee.</Text>
        </View>
      </View>
      {state === "loading" ? (
        <Text className="text-caption text-text-muted">Getting your link…</Text>
      ) : link ? (
        <>
          <Text className="rounded-field bg-surface-variant px-3 py-2 text-caption text-text-primary" numberOfLines={1} selectable>
            {link}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="min-w-0 flex-1 text-caption text-text-muted">
              {pass?.signups ?? 0} signed up · {pass?.successful ?? 0} ordered
            </Text>
            <Pressable
              onPress={() => void copyText(link).then((ok) => setCopied(ok))}
              accessibilityRole="button"
              accessibilityLabel="Copy link"
              className="gg-touch items-center justify-center rounded-field border border-outline px-3"
            >
              {copied ? (
                <Check size={18} color={colors.success} strokeWidth={2.5} aria-hidden />
              ) : (
                <Copy size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              )}
            </Pressable>
            <Pressable
              onPress={() => void Share.share({ message: `Print with GRIDGO: ${link}` }).catch(() => undefined)}
              accessibilityRole="button"
              accessibilityLabel="Share link"
              className="gg-touch flex-row items-center justify-center gap-1 rounded-field border border-outline px-3"
            >
              <Share2 size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              <Text className="text-button text-text-primary">Share</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text className="text-caption text-text-muted">Your link opens soon.</Text>
      )}
    </View>
  );
}
