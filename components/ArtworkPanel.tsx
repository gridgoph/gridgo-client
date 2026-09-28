import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink, FileImage, FileText } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { getFile, getFileDownloadUrl as getDownloadUrl, type Order, type StoredFile } from "@/lib/api";
import { describeArtwork, isArtworkImage, readOrderArtwork, orderArtwork, type ArtworkReference } from "@/lib/orderArtwork";

/** All production files, each with independent loading and recovery. */
export function ArtworkPanel({ order }: { order: Order }) {
  const files = orderArtwork(order);
  if (!files.length) {
    return <Text className="text-body text-text-secondary">{order.artworkName
      ? `“${order.artworkName}” is recorded, but no stored file is available. Ask Operations for the production file.`
      : "No artwork or reference picture is attached yet. Ask Operations for the production file."}</Text>;
  }
  // Which item a file belongs to only says something on a job with several.
  const named = new Set(files.map((file) => file.itemName).filter(Boolean)).size > 1;
  return <View>{files.map((file) => (
    <ArtworkFile key={`${order.id}:${file.fileId}`} orderId={order.id} reference={named ? file : { ...file, itemName: undefined }} />
  ))}</View>;
}

type FileState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; file: StoredFile; previewUrl: string | null };

function ArtworkFile({ orderId, reference }: { orderId: string; reference: ArtworkReference }) {
  const colors = useThemeColors();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FileState>({ kind: "loading" });
  const [previewFailed, setPreviewFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const openingRef = useRef(false);
  const mounted = useRef(false);
  const { fileId, kind } = reference;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const loaded = await readOrderArtwork({ fileId, kind }, orderId, { getFile, getDownloadUrl });
        if (current) setState({ kind: "ready", ...loaded });
      } catch {
        if (current) setState({ kind: "error", message: "This attachment could not load. Retry, or ask Operations to check file access." });
      }
    }
    void load();
    return () => { current = false; };
  }, [fileId, orderId, kind, attempt]);

  function retry() {
    setState({ kind: "loading" });
    setPreviewFailed(false);
    setOpenError(null);
    setAttempt((value) => value + 1);
  }

  async function open() {
    if (state.kind !== "ready" || openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setOpenError(null);
    try {
      // Fetch a fresh capability for every open, including PDF/Photoshop files.
      const link = await getDownloadUrl(fileId);
      if (mounted.current) await WebBrowser.openBrowserAsync(link.url);
    } catch {
      if (mounted.current) setOpenError("The file could not open. Check your connection and try Open file again.");
    } finally {
      openingRef.current = false;
      if (mounted.current) setOpening(false);
    }
  }

  const file = state.kind === "ready" ? state.file : null;
  const image = Boolean(file && isArtworkImage(file));
  const kindLabel = kind === "mockup" ? "Reference mockup" : "Artwork";
  const failed = state.kind === "error" || previewFailed;
  const title = file?.originalFilename ?? (state.kind === "error" ? "File could not load" : "Loading attachment…");
  const detail = file ? `${kindLabel} · ${describeArtwork(file)}` : kindLabel;

  /*
    One compact row per file: what it is, its type and size, and a tap that
    opens the original. The preview is a thumbnail, not a poster — the order
    screen folds this list away, and a 176pt plate per file was most of what
    made it read as cluttered (gridgo-client#129).
  */
  return (
    <View className="gap-2 border-b border-outline-subtle py-3">
      {reference.itemName ? <Text className="text-caption text-text-muted">{reference.itemName}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={file ? `Open ${file.originalFilename}, ${detail}` : title}
        accessibilityState={{ disabled: !file || opening, busy: opening || state.kind === "loading" }}
        onPress={() => void open()}
        disabled={!file || opening}
        className="gg-touch flex-row items-center gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-field border border-outline bg-surface-variant">
          {state.kind === "loading" ? <SkeletonBlock /> : state.kind === "ready" && state.previewUrl && !previewFailed ? (
            <Image
              source={{ uri: state.previewUrl }}
              // Third-party Image does not receive NativeWind's RN import transform.
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="none"
              transition={0}
              accessibilityLabel={`${kindLabel}: ${state.file.originalFilename}`}
              onError={() => setPreviewFailed(true)}
            />
          ) : image ? (
            <FileImage size={22} color={colors.textMuted} aria-hidden />
          ) : (
            <FileText size={22} color={colors.textMuted} aria-hidden />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary" numberOfLines={1} ellipsizeMode="middle">{title}</Text>
          <Text className="text-caption text-text-muted" numberOfLines={1}>{opening ? "Opening…" : detail}</Text>
        </View>
        {file ? <ExternalLink size={18} color={colors.textSecondary} aria-hidden /> : null}
      </Pressable>
      {state.kind === "error" ? <Text accessibilityRole="alert" className="text-body text-error">{state.message}</Text> : null}
      {previewFailed && state.kind !== "error" ? <Text className="text-caption text-text-muted">Preview unavailable. Open the file to see it.</Text> : null}
      {openError ? <Text accessibilityRole="alert" className="text-body text-error">{openError}</Text> : null}
      {failed ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry attachment" onPress={retry} className="gg-btn-secondary">
          <Text className="text-button text-text-primary">Retry attachment</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
