import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CircleAlert } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { MyFilesUsage } from "@/components/MyFilesUsage";
import { SavedFileRow } from "@/components/SavedFileRow";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { ARTWORK_RETENTION_NOTE } from "@/lib/artworkDeletion";
import { DELETE_SAVED_CONFIRM, reuseRefusal } from "@/lib/myFiles";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { useMyFiles } from "@/store/myFiles";

/**
 * Account → My files (gridgo-client#334): the artwork the client chose to keep.
 *
 * Opened from Account it is the library — how full it is, each file with its
 * picture, and three things to do with one: use it on a new order, open it,
 * delete it. Opened from the Artwork step (`lineId`) it is a chooser: the same
 * list, where the one action puts the file on that item without uploading it
 * again, and a file the item cannot take says why instead.
 *
 * Every row's links are signed for five minutes, so the list is read on every
 * visit and again when a picture's link runs out — never kept on the phone.
 */
export default function MyFilesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { lineId } = useLocalSearchParams<{ lineId?: string }>();
  const files = useMyFiles((state) => state.files);
  const usage = useMyFiles((state) => state.usage);
  const loadingMore = useMyFiles((state) => state.loadingMore);
  const nextOffset = useMyFiles((state) => state.nextOffset);
  const error = useMyFiles((state) => state.error);
  const confirming = useMyFiles((state) => state.confirming);
  const deleting = useMyFiles((state) => state.deleting);
  const deleteError = useMyFiles((state) => state.deleteError);
  const opening = useMyFiles((state) => state.opening);
  const openError = useMyFiles((state) => state.openError);
  const load = useMyFiles((state) => state.load);

  // Choosing for one basket item: its listing says which files it takes.
  const line = useCart((state) => (lineId ? state.cart?.lines.find((entry) => entry.id === lineId) ?? null : null));
  const choosing = Boolean(lineId);
  const adding = useArtworkAttachments((state) => (lineId ? state.saving[lineId] === true : false));
  const addError = useArtworkAttachments((state) => (lineId ? state.saveError[lineId] ?? null : null));

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmFile = files?.find((file) => file.fileId === confirming) ?? null;
  const problem = choosing ? addError : deleteError;

  const chooseFile = async (fileId: string, name: string, contentType: string) => {
    if (lineId) {
      if (adding) return;
      const result = await useArtworkAttachments.getState().attachSaved(lineId, fileId);
      if (result.ok) router.back();
      return;
    }
    useMyFiles.getState().hold({ fileId, name, contentType });
    router.push("/request/category");
  };

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-16 pt-4">
          {choosing ? (
            <Text className="text-body text-text-secondary">
              Choose a file you saved. It goes onto {line?.listing?.name ?? "this item"} as it is — nothing is
              uploaded again.
            </Text>
          ) : null}

          {usage && !choosing ? <MyFilesUsage usage={usage} /> : null}

          {problem ? (
            <View className="flex-row items-start gap-2" accessibilityRole="alert">
              <View className="pt-0.5">
                <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
              </View>
              <Text className="min-w-0 flex-1 text-body text-error">{problem}</Text>
            </View>
          ) : null}

          {error && !files ? (
            <ErrorState label="My files not loaded" body={error} onRetry={() => void load()} />
          ) : !files ? (
            <View className="gg-card-flush" accessibilityRole="progressbar" accessibilityLabel="Loading My files">
              {[0, 1, 2].map((index) => (
                <View
                  key={index}
                  className={index ? "flex-row gap-3 border-t border-outline-subtle px-4 py-4" : "flex-row gap-3 px-4 py-4"}
                >
                  <SkeletonBlock className="h-20 w-20 rounded-sm" />
                  <View className="flex-1 gap-2 pt-1">
                    <SkeletonLine width="w-2/3" />
                    <SkeletonLine width="w-1/3" />
                  </View>
                </View>
              ))}
            </View>
          ) : files.length ? (
            <View className="gap-3">
              <View className="gg-card-flush">
                {files.map((file, index) => (
                  <SavedFileRow
                    key={file.fileId}
                    file={file}
                    divided={index > 0}
                    deletable={!choosing}
                    onStale={() => load()}
                    onDelete={() => useMyFiles.getState().askDelete(file.fileId)}
                    onOpen={() => void useMyFiles.getState().open(file.fileId)}
                    opening={opening[file.fileId] === true}
                    openError={openError[file.fileId] ?? null}
                    use={
                      choosing
                        ? {
                            label: adding ? "Adding…" : "Add to this item",
                            onPress: () => void chooseFile(file.fileId, file.originalFilename, file.detectedContentType),
                            refusal: reuseRefusal(file, line?.listing ?? null),
                          }
                        : {
                            label: "Use on a new order",
                            onPress: () => void chooseFile(file.fileId, file.originalFilename, file.detectedContentType),
                            refusal: reuseRefusal(file, null),
                          }
                    }
                  />
                ))}
              </View>
              {error ? <Text className="text-caption text-error">{error}</Text> : null}
              {nextOffset != null ? (
                <SecondaryButton
                  label={loadingMore ? "Loading…" : "Show more files"}
                  disabled={loadingMore}
                  onPress={() => void useMyFiles.getState().loadMore()}
                />
              ) : null}
            </View>
          ) : (
            <EmptyState
              title="Nothing saved yet"
              body="On the Artwork step, tick “Save to My files” under a file to keep it here for your next order."
              {...(choosing
                ? { actionLabel: "Back to your artwork", onAction: () => router.back() }
                : { actionLabel: "Start a print job", onAction: () => router.push("/request/category") })}
            />
          )}

          <View className="gap-1">
            <Text className="text-body font-medium text-text-primary">How long GRIDGO keeps files</Text>
            <Text className="text-caption text-text-secondary">{ARTWORK_RETENTION_NOTE}</Text>
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmFile != null}
        question={DELETE_SAVED_CONFIRM.question(confirmFile?.originalFilename ?? "this file")}
        body={DELETE_SAVED_CONFIRM.body}
        confirmLabel={deleting ? "Deleting…" : "Delete file"}
        cancelLabel="Keep it"
        tone="destructive"
        busy={deleting}
        onConfirm={() => void useMyFiles.getState().confirmDelete()}
        onCancel={() => useMyFiles.getState().cancelDelete()}
      />
    </Screen>
  );
}
