import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import * as api from "@/lib/api";

type Props = {
  fileId: string;
  label: string;
  /** Signatures sit on white paper in both themes, like the pad they came from. */
  paper?: boolean;
  height?: number;
};

/**
 * A private evidence image — a signature or a sample photo — read through a
 * short-lived signed link. A link that has expired is signed again once
 * before the picture is called missing, and a missing one says so in words.
 */
export function EvidenceImage({ fileId, label, paper = false, height = 120 }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .getFileDownloadUrl(fileId)
      .then((link) => {
        if (alive) setUri(link.url);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [fileId, attempt]);

  const frame = paper
    ? "items-center justify-center overflow-hidden rounded-card border border-slip-rule bg-slip-paper"
    : "items-center justify-center overflow-hidden rounded-card bg-surface-variant";

  return (
    <View className={frame} style={{ height }}>
      {failed ? (
        <Text className={paper ? "px-4 text-center text-caption text-slip-ink-muted" : "px-4 text-center text-caption text-text-muted"}>
          This picture could not be loaded. It stays on GRIDGO&apos;s record.
        </Text>
      ) : uri ? (
        <Image
          source={{ uri }}
          accessibilityLabel={label}
          resizeMode="contain"
          style={{ width: "100%", height: "100%" }}
          onError={() => {
            if (attempt === 0) setAttempt(1);
            else setFailed(true);
          }}
        />
      ) : null}
    </View>
  );
}
