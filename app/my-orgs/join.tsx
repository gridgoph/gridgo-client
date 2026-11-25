import { useRouter } from "expo-router";
import { ImageUp, Lock, QrCode } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { FormScreen } from "@/components/FormScreen";
import { TextField } from "@/components/form/TextField";
import { Pressable } from "@/components/Pressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { QrPictureReader } from "@/components/QrPictureReader";
import { useThemeColors } from "@/hooks/useTheme";
import { MEMBER_PRIVACY_LINE, readJoinText } from "@/lib/memberships";
import type { JoinSource } from "@/lib/membershipsApi";
import { pickImage } from "@/lib/pickImage";
import { QR_PICTURE_FAILED, QR_PICTURE_NONE, QR_PICTURE_OFFLINE, type QrPictureMessage } from "@/lib/qrPicture";
import { imageUriToDataUrl } from "@/lib/receiptOcrRecognize";

/**
 * Join an org: scan its QR with the phone's camera, pick a picture of it, or
 * paste the link. All three end on the same invite screen, where the person
 * reads which org it is before asking to join.
 */
export default function JoinOrgScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [text, setText] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  const open = useCallback(
    (value: string, source: JoinSource): string | null => {
      const read = readJoinText(value);
      if (!read.ok) return read.message;
      router.push({ pathname: "/join/[token]", params: { token: read.token, source } });
      return null;
    },
    [router],
  );

  const followLink = () => {
    setPictureError(null);
    setLinkError(open(text, "link"));
  };

  const choosePicture = async () => {
    setPictureError(null);
    setLinkError(null);
    const picked = await pickImage(QR_PICTURE_FAILED);
    if (!picked) return;
    if ("error" in picked) {
      setPictureError(picked.error);
      return;
    }
    try {
      setPicture(await imageUriToDataUrl(picked.asset.uri));
    } catch {
      setPictureError(QR_PICTURE_FAILED);
    }
  };

  const onPicture = useCallback(
    (result: Exclude<QrPictureMessage, { type: "ready" }>) => {
      setPicture(null);
      if (result.type === "offline") setPictureError(QR_PICTURE_OFFLINE);
      else if (result.type === "error") setPictureError(QR_PICTURE_FAILED);
      else if (!result.text) setPictureError(QR_PICTURE_NONE);
      else if (open(result.text, "qr")) setPictureError("That QR is not a member QR. Ask your officer for the one in Members.");
    },
    [open],
  );

  return (
    <FormScreen
      contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 32 }}
      overlay={picture ? <QrPictureReader dataUrl={picture} onResult={onPicture} /> : null}
    >
      <View className="gg-card items-center gap-3 py-6">
        <View className="h-20 w-20 items-center justify-center rounded-card bg-surface-variant">
          <QrCode size={44} color={colors.textPrimary} strokeWidth={1.75} aria-hidden />
        </View>
        <View className="items-center gap-1">
          <Text className="text-center text-h3 text-text-primary" accessibilityRole="header">
            Scan your org’s QR
          </Text>
          <Text className="text-center text-body text-text-secondary">
            Open your phone’s camera, point it at the QR, and tap the link. It opens here.
          </Text>
        </View>
        <Pressable
          onPress={() => void choosePicture()}
          disabled={picture !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: picture !== null }}
          className={picture ? "gg-btn-secondary gg-disabled w-full" : "gg-btn-secondary w-full"}
        >
          <ImageUp size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          <Text className="text-button text-text-primary">{picture ? "Reading the QR…" : "Choose a picture of the QR"}</Text>
        </Pressable>
        {pictureError ? (
          <Text className="text-center text-caption text-error" accessibilityRole="alert">
            {pictureError}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-3" aria-hidden>
        <View className="gg-divider flex-1" />
        <Text className="text-caption text-text-muted">or</Text>
        <View className="gg-divider flex-1" />
      </View>

      <View className="gap-3">
        <View className="gap-2">
          <Text className="text-body font-medium text-text-primary">Invite link</Text>
          <TextField
            value={text}
            onChangeText={(value) => {
              setText(value);
              setLinkError(null);
            }}
            placeholder="Paste the link from your officer"
            accessibilityLabel="Invite link"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            invalid={linkError !== null}
            onSubmitEditing={followLink}
          />
          {linkError ? (
            <Text className="text-caption text-error" accessibilityRole="alert">
              {linkError}
            </Text>
          ) : null}
        </View>
        <PrimaryButton label="Continue" onPress={followLink} />
        <View className="flex-row items-start gap-2 px-1">
          <Lock size={14} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-muted">{MEMBER_PRIVACY_LINE}</Text>
        </View>
      </View>
    </FormScreen>
  );
}
