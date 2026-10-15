import { CircleAlert, FileCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { KEYBOARD_CARET_GAP } from "@/components/FormScreen";
import { ArtworkSizeNote } from "@/components/ArtworkSizeNote";
import { ArtworkAttachmentList } from "@/components/ArtworkAttachmentList";
import { PrepareFileGuide } from "@/components/PrepareFileGuide";
import { PrintLayoutChoice } from "@/components/PrintLayoutChoice";
import { PrintLayoutPreview } from "@/components/PrintLayoutPreview";
import { DesignLinkField } from "@/components/DesignLinkField";
import { ErrorScreenState } from "@/components/ErrorState";
import { ProductPreview } from "@/components/ProductPreview";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StepTrailBar } from "@/components/StepTrail";
import { TourTarget } from "@/components/TourTarget";
import type { FormatGuard } from "@/hooks/useArtworkUpload";
import {
  EMPTY_ARTWORK,
  artworkCheckFailure,
  artworkStateFromStoredFile,
  detectedProportions,
  detectedSummary,
  isWordDocument,
  needsManualPageTotal,
} from "@/lib/artworkUpload";
import { formatRefusal, wordFormatNote } from "@/lib/artworkFormats";
import {
  attachmentFileIds,
  attachmentLinks,
  keepsAttachmentList,
  lineAttachments,
  mainFileId,
  slotsLeft,
} from "@/lib/artworkAttachments";
import { artworkSizeNote } from "@/lib/artworkSize";
import { guidanceRule, orderedSizeMilli, prepareFileGuide } from "@/lib/artworkGuidance";
import { measuredSizeLabel, measuredSizeMilli, physicalSizeMilli } from "@/lib/printSize";
import { useThemeColors } from "@/hooks/useTheme";
import { useTourScreen } from "@/hooks/useTourScreen";
import * as api from "@/lib/api";
import { documentPagesSummary, pageRangeError, pageTotalError } from "@/lib/documentPages";
import { userFacingError } from "@/lib/copy";
import { THIN_FILE_NOTE, describeArtworkFile } from "@/lib/requestValidation";
import {
  designLinkFormats,
  designLinkPhrase,
  linkVerdict,
  takesCanvaLinks,
  parseDesignLink,
} from "@/lib/designLink";
import {
  fileFormats,
  fileMatchesFormats,
  formatSentence,
  linkFormats,
  pickerMimeTypes,
} from "@/lib/listing";
import { orderFlowNow } from "@/lib/orderFlow";
import { type OrderStepId } from "@/lib/orderSteps";
import { MOCKUP_LABEL } from "@/lib/productPreview";
import { layoutAdvice, layoutLabel, lineNeedsLayout, offeredLayouts, paperChange, type KnownLayout } from "@/lib/printLayout";
import { ArtworkRightsBox } from "@/components/legal/ArtworkRightsBox";
import { cartRightsScope, useArtworkRights } from "@/store/artworkRights";
import { useArtworkAttachments, type PendingUpload } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";
import { checkKey, currentProblem, useDesignLink } from "@/store/designLink";

/**
 * The artwork for one thing in the basket.
 *
 * Only what this listing takes. A shop that prints flyers from JPEG, PNG and
 * PDF has said so on its board, and the picker is narrowed to exactly that — a
 * client who chooses a Photoshop file finds out here, in the shop's own words,
 * rather than after sending 180 MB over mobile data.
 *
 * An item takes up to ten files and design links together (report C6625C57):
 * a shirt's front and back, a separate high-resolution logo. Each has an
 * optional label and its own status, and their order is the client's — the
 * first file is the main one GRIDGO prices pages from and previews. Any one
 * file or link is enough to go on.
 *
 * A listing that takes a design link (Canva, Drive) gets a field that adds
 * them. A link is checked as it is pasted — can anyone with it open the
 * design — and only one proven public goes onto the item; checkout refuses
 * anything less, so the field says so here, with the fix.
 *
 * An image is shown on the product. A PDF, a Word file or a link is not:
 * nothing on this phone can rasterise a PDF or lay out a Word file, and a
 * drawn rectangle standing in for one would be a picture of a file GRIDGO has
 * not looked at. That case gets the file named
 * instead, which is the honest version of the same reassurance.
 *
 * Resolution and colour mode are GRIDGO's judgement per product type, at the
 * size ordered (gridgo-client#242): a "Prepare your file" guide before upload,
 * then each file's colour mode and resolution, and any warning to accept or
 * answer with a better file. Warnings never block checkout; only a file GRIDGO
 * cannot read does.
 *
 * A size that does not match the sheet is a warning and never a block. A client
 * printing an A5 design on A4 with a border is doing something deliberate, and
 * a shop can trim; the far commoner case is a phone screenshot sent for a
 * flyer, and that is worth one sentence before it is printed rather than after.
 */
/** One shared empty list, so an item with nothing in flight never re-renders the screen. */
const NO_UPLOADS: PendingUpload[] = [];

export default function ArtworkScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { lineId, focus } = useLocalSearchParams<{
    lineId?: string;
    /** `layout`: checkout sent the client here to choose how the file sits on the paper. */
    focus?: string;
  }>();
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const [layoutY, setLayoutY] = useState<number | null>(null);
  // Once per visit: after that the client scrolls where they like.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focus !== "layout" || focusedRef.current || layoutY == null) return;
    focusedRef.current = true;
    scrollRef.current?.scrollTo?.({ y: Math.max(0, layoutY - 12), animated: true });
  }, [focus, layoutY]);

  const cart = useCart((state) => state.cart);
  const rightsScope = cart ? cartRightsScope(cart.id) : null;
  const rightsAgreed = useArtworkRights((state) =>
    rightsScope ? state.agreed[rightsScope] === true : false,
  );
  const run = useCart((state) => state.run);
  const adopt = useCart((state) => state.adopt);
  const line = cart?.lines.find((entry) => entry.id === lineId) ?? null;
  const item = line?.listing ?? null;

  // The pixels belong to one file; a different file, or a server answer,
  // simply stops them being used rather than needing them cleared.
  const [measuredPixels, setMeasuredPixels] = useState<{
    fileId: string;
    size: { width: number; height: number };
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rangeDraft, setRangeDraft] = useState<{ fileId: string; text: string } | null>(null);
  const [totalDraft, setTotalDraft] = useState<{ fileId: string; text: string } | null>(null);

  /**
   * The picker filter and its refusal, in the shop's words, handed to the
   * picker each time it opens.
   */
  const guard: FormatGuard | undefined = (() => {
    if (!item) return undefined;
    const uploads = fileFormats(item);
    const links = designLinkFormats(item.acceptedFormats);
    if (!uploads.length) return undefined;
    return {
      accept: pickerMimeTypes(item),
      check: (fileName, mimeType) => fileMatchesFormats(item, fileName, mimeType),
      rejection: (fileName, mimeType) =>
        formatRefusal({
          productName: item.name,
          fileName,
          mimeType,
          formats: uploads,
          links: links.length ? designLinkPhrase(links) : null,
        }),
    };
  })();

  // Everything on the item, in order, and what is still on its way to it.
  const entries = lineAttachments(line);
  const fileIds = attachmentFileIds(entries);
  const savedLinks = attachmentLinks(entries);
  const primaryId = mainFileId(entries);
  const uploads = useArtworkAttachments((state) => (line ? state.uploads[line.id] : undefined)) ?? NO_UPLOADS;
  const files = useArtworkAttachments((state) => state.files);
  const accepting = useArtworkAttachments((state) => (line ? state.accepting[line.id] ?? null : null));
  const acceptError = useArtworkAttachments((state) => (line ? state.acceptError[line.id] ?? null : null));
  // The per-product-type targets the guide is drawn from; Super Admin edits them.
  const guidanceSettings = usePlatformSettings((state) => state.settings?.artworkGuidance);
  useEffect(() => {
    void usePlatformSettings.getState().load({ refresh: true }).catch(() => undefined);
  }, []);
  const listSaving = useArtworkAttachments((state) => (line ? state.saving[line.id] === true : false));
  const listError = useArtworkAttachments((state) => (line ? state.saveError[line.id] ?? null : null));
  const notice = useArtworkAttachments((state) => (line ? state.notice[line.id] ?? null : null));
  const attachments = useArtworkAttachments.getState();
  useEffect(() => {
    for (const fileId of fileIds) void useArtworkAttachments.getState().readFile(fileId);
  }, [fileIds.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps

  // The main file, as the size and page checks below read it.
  const primaryFile = primaryId ? files[primaryId] : undefined;
  const primaryBase = primaryId ? { ...EMPTY_ARTWORK, phase: "stored" as const, fileId: primaryId } : EMPTY_ARTWORK;
  const primary = primaryFile ? artworkStateFromStoredFile(primaryFile, primaryBase) : primaryBase;

  // The link field adds links: its text and every check's answer live in the store.
  const linkText = useDesignLink((state) => (line ? state.drafts[line.id] ?? "" : ""));
  const setLinkDraft = useDesignLink((state) => state.setDraft);
  const committedLink = useDesignLink((state) => (line ? state.committed[line.id] : undefined));
  const linkChecks = useDesignLink((state) => state.checks);
  const linkSaving = useDesignLink((state) => (line ? state.saving[line.id] === true : false));
  const linkSaveError = useDesignLink((state) => (line ? state.saveError[line.id] ?? null : null));
  const commitLink = useDesignLink((state) => state.commit);
  const verifyLink = useDesignLink((state) => state.verify);
  const artworkProblems = useDesignLink((state) => state.problems);
  const linkKeys = savedLinks.map(checkKey).join("\n");
  useEffect(() => {
    // A link kept on an earlier visit meets the same check a new paste does,
    // so its answer is on screen before the client heads for checkout.
    for (const link of savedLinks) void verifyLink(link);
  }, [linkKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const stored = primaryId;

  /** Save the selection; GRIDGO returns the normalized range and updated price. */
  const savePageRange = useCallback(
    async (pageRange: string | null) => {
      if (!line || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        adopt(
          await run((cartId) =>
            api.updateCartLine(cartId, line.id, { pageRange }),
          ),
        );
        setRangeDraft(null);
      } catch (error) {
        setSaveError(
          userFacingError(error, "Those pages did not save. Try again in a moment."),
        );
      } finally {
        setSaving(false);
      }
    },
    [line?.id, saving], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * How the file sits on the paper (gridgo-client#245). Saved on the tap, so
   * GRIDGO's check — the cut-off and the preview — answers for it at once.
   * The paper swap is the same: the one option in the size group changes.
   */
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [pendingLayout, setPendingLayout] = useState<KnownLayout | null>(null);
  const saveLayout = async (change: { printLayout?: KnownLayout; optionIds?: string[]; structuredSpec?: Record<string, unknown> }) => {
    if (!line || layoutSaving) return;
    setLayoutSaving(true);
    setLayoutError(null);
    if (change.printLayout) setPendingLayout(change.printLayout);
    try {
      adopt(await run((cartId) => api.updateCartLine(cartId, line.id, change)));
    } catch (error) {
      setLayoutError(userFacingError(error, "That did not save. Try again in a moment."));
      // The shop may have changed what it prints: the basket says what it offers now.
      void useCart.getState().load();
    } finally {
      setPendingLayout(null);
      setLayoutSaving(false);
    }
  };

  /**
   * The page total of a Word file that did not say. GRIDGO prices pages,
   * ranges and copies from it, and keeps any range already chosen.
   */
  const savePageTotal = useCallback(
    async (pages: number) => {
      if (!line || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        adopt(
          await run((cartId) =>
            api.updateCartLine(cartId, line.id, { measurement: { pages } }),
          ),
        );
        setTotalDraft(null);
      } catch (error) {
        setSaveError(
          userFacingError(error, "That page count did not save. Try again in a moment."),
        );
      } finally {
        setSaving(false);
      }
    },
    [line?.id, saving], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * The artwork's own proportions.
   *
   * GRIDGO reads these out of the bytes as they are uploaded, which is both
   * better and cheaper than what this screen used to do: a PDF now answers
   * (nothing on this phone can open one), the answer is the printed size
   * rather than a pixel count, and it costs no round trip.
   *
   * Downloading the file to measure it is kept only for the case the server
   * cannot answer — a raster that declared no density. Its pixels still settle
   * a proportion even though they settle no physical size.
   */
  const detected = primary.detected;
  const measured = detectedProportions(detected);

  const measure = useCallback((fileId: string | null) => {
    if (!fileId) return;
    api
      .getFileDownloadUrl(fileId)
      .then(({ url }) => {
        Image.getSize(
          url,
          (width, height) => setMeasuredPixels({ fileId, size: { width, height } }),
          () => setMeasuredPixels(null),
        );
      })
      .catch(() => setMeasuredPixels(null));
  }, []);

  // A Word file has no shape to measure, and Image cannot open one.
  const wordFile = detected?.kind === "document" || isWordDocument(primary.contentType);
  useEffect(() => {
    if (!measured && !wordFile) measure(stored ?? null);
  }, [stored, measure, measured, wordFile]);

  const pixels = !measured && stored && measuredPixels?.fileId === stored ? measuredPixels.size : null;
  useTourScreen("artwork", line != null);

  /** Back to the shop board, or to the sheet this file belongs to. */
  const goStep = (step: OrderStepId) => {
    if (step === "shop") {
      const flow = orderFlowNow();
      if (!flow) {
        router.navigate("/request/category");
        return;
      }
      router.navigate({
        pathname: "/request/match",
        params: { subcategory: flow.subcategoryCode, category: flow.categoryCode },
      });
      return;
    }
    if (step === "listing" && line) {
      router.navigate({
        pathname: "/request/listing",
        params: { itemId: line.catalogItemId, lineId: line.id },
      });
    }
  };

  if (!line) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorScreenState
          label="That item is no longer in your order"
          body="It was removed, or the order was placed. Go back and pick what you are printing."
          retryLabel="Back"
          onRetry={() => router.replace("/(tabs)/home")}
        />
      </Screen>
    );
  }

  const size = typeof line.structuredSpec.size === "string" ? line.structuredSpec.size : "";
  const summary = detectedSummary(detected);
  // GRIDGO's own check of each file, at the size ordered. Absent on an older API.
  const lineGuidance = line.artworkGuidance ?? null;
  // The byte count is a proxy, said only on an API that does not judge resolution.
  const thinFile = !lineGuidance && describeArtworkFile({
    originalFilename: primary.fileName || null,
    detectedContentType: primary.contentType,
    size: primary.size,
  }).some((fact) => fact.id === "size" && fact.tone === "warn");

  /*
    Two ways a line knows how big it is, and a measured listing has no size
    label at all: a tarpaulin billed by the square foot was typed as 3 by 5
    feet, not picked as "A4". GRIDGO's own reading of the size comes first.
  */
  const orderedSize =
    orderedSizeMilli(lineGuidance) ??
    measuredSizeMilli(line.measurement, item?.measureUnit) ??
    physicalSizeMilli(size, { subcategoryCode: item?.subcategoryCode });
  const rule = guidanceRule(guidanceSettings, item?.subcategoryCode);
  const minimumDpi = lineGuidance ? lineGuidance.minimumDpi : rule?.minimumDpi ?? null;
  const guide = prepareFileGuide(
    lineGuidance ? { minimumDpi: lineGuidance.minimumDpi, acceptsRgb: lineGuidance.acceptsRgb } : rule,
    { milli: orderedSize, label: size || measuredSizeLabel(line.measurement, item?.measureUnit) },
  );
  const layouts = offeredLayouts(item);
  // With a layout choice, how a page of another size prints is the layout's
  // answer, not "scaled to fit": the size note would contradict it.
  const sizeNote = layouts.length ? null : artworkSizeNote({ detected, pixels, sizeMilli: orderedSize, label: size, minimumDpi });
  // A layout the shop has stopped printing is not drawn: the client chooses again.
  const savedLayout = layouts.find((code) => code === line.printLayout) ?? null;
  const shownLayout = pendingLayout ?? savedLayout;
  const layoutCheck = line.printLayoutCheck ?? null;
  const advice = layoutAdvice(layoutCheck, { layout: shownLayout, listing: item });
  const layoutMissing = lineNeedsLayout(line);
  const documentPages = line.documentPages;
  const rangeText = rangeDraft?.fileId === line.artworkFileId ? rangeDraft.text : documentPages?.range ?? "";
  const rangeDirty = rangeText !== (documentPages?.range ?? "");
  const rangeError = documentPages ? pageRangeError(rangeText, documentPages.total) : null;
  const wordNeedsTotal = needsManualPageTotal(detected, primary.contentType, item?.pricingUnit);
  // The count belongs to the main file GRIDGO holds.
  const manualTotal = wordNeedsTotal && Boolean(primaryId);
  const savedTotal = documentPages ? String(documentPages.total) : "";
  const totalText = totalDraft?.fileId === line.artworkFileId ? totalDraft.text : savedTotal;
  const totalDirty = manualTotal && totalText.trim() !== savedTotal;
  const totalError = totalDirty ? pageTotalError(totalText) : null;
  const pagesMissing = item?.pricingUnit === "per_page" && !documentPages;
  // Only about a file GRIDGO holds: before one is picked there is nothing unread.
  const unreadPages = pagesMissing && !wordNeedsTotal && primaryId
    ? "Upload a document with a readable page count. If needed, export it as a PDF and upload it again."
    : null;

  const onLine = fileIds.length > 0;
  const acceptedFormats = item?.acceptedFormats ?? [];
  const parsedLink = committedLink ? parseDesignLink(committedLink, acceptedFormats) : null;
  const linkState = parsedLink?.ok ? linkChecks[checkKey(parsedLink.link)] : undefined;
  const linkChecking = linkState?.phase === "checking";
  const asksPages = item?.pricingUnit === "per_page";
  const links = item ? designLinkFormats(item.acceptedFormats) : [];
  // Link formats the cart cannot keep yet (Drive, Dropbox, WeTransfer filed
  // under their own codes): named, never offered as a field that cannot save.
  const otherLinks = item ? linkFormats(item).filter((format) => !links.includes(format)) : [];
  const uploadFormats = item ? fileFormats(item) : [];
  // A listing that names no formats at all still takes a file; the server judges it.
  const takesFiles = uploadFormats.length > 0 || !links.length;
  const verdict = linkVerdict(linkState, { canUpload: uploadFormats.length > 0 });
  const hasArtwork = entries.length > 0;
  const inFlight = uploads.filter((entry) => entry.phase !== "failed").length;
  const roomLeft = slotsLeft(entries.length + inFlight);
  // Checkout refuses a line if any one of its links fails, even beside a good
  // file, and any file that failed GRIDGO's own check (gridgo-api#122). Both
  // stop here first, on the row they are about.
  const savedLinkChecking = savedLinks.some((link) => linkChecks[checkKey(link)]?.phase === "checking");
  const linkBlocked = savedLinks.some(
    (link) => linkVerdict(linkChecks[checkKey(link)], { canUpload: uploadFormats.length > 0 })?.blocks,
  );
  const fileProblem = fileIds.some((fileId) => artworkCheckFailure(files[fileId]?.artworkCheck));
  const checkoutProblem = currentProblem(artworkProblems, line);
  const canCheckout =
    hasArtwork &&
    rightsAgreed &&
    (!asksPages || (primaryFile !== undefined && !saveError)) &&
    !saving &&
    !listSaving &&
    inFlight === 0 &&
    !linkSaving &&
    !savedLinkChecking &&
    !pagesMissing &&
    !totalDirty &&
    !rangeDirty &&
    !rangeError &&
    !linkBlocked &&
    !fileProblem &&
    !layoutSaving &&
    !layoutMissing;
  const name = item?.name ?? "this item";
  /** Check the link and, once it is proven public, add it to the item. */
  const commitLinkText = (text: string, options?: { recheck?: boolean }) =>
    void commitLink(text, line.id, options);
  const takesCanva = takesCanvaLinks(links);

  return (
    <Screen edges={["bottom"]}>
      <StepTrailBar current="artwork" onStep={goStep} />

      <KeyboardAwareScrollView
        ref={scrollRef}
        className="gg-screen"
        contentContainerClassName="gg-page pb-8 pt-4"
        bottomOffset={KEYBOARD_CARET_GAP}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-h1 text-text-primary">Your artwork</Text>
        {/*
          Why checkout sent the client back here, until the artwork it was
          about is replaced. The server's own words: it names the file or link
          and what to do with it.
        */}
        {checkoutProblem ? (
          <View
            className="mt-4 flex-row items-start gap-3 rounded-field border border-error bg-surface p-3"
            accessible
            accessibilityRole="alert"
          >
            <View className="pt-0.5">
              <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body font-medium text-text-primary">Checkout could not use this artwork</Text>
              <Text className="text-caption text-text-secondary">{checkoutProblem.message}</Text>
            </View>
          </View>
        ) : null}
        <Text className="mt-3 text-body-lg text-text-secondary">
          For {name}
          {size ? ` · ${size}` : ""}.
        </Text>

        <Text className="mt-1 text-body text-text-secondary">
          {takesFiles && links.length
            ? `Upload files, paste ${designLinkPhrase(links)}, or both.`
            : links.length
              ? `Paste ${designLinkPhrase(links)}.`
              : "Upload the files you want printed."}{" "}
          Add a front and a back, or a separate logo, each with its own label.
        </Text>

        {/* Before the files: what this product type wants, from GRIDGO's targets. */}
        {guide && takesFiles ? (
          <View className="mt-6">
            <PrepareFileGuide rows={guide} />
          </View>
        ) : null}

        {takesFiles || links.length ? (
          <TourTarget step="artwork" className="mt-6">
            {/*
              Until there is artwork the list's "Choose files" is the one thing
              on the screen a client can act on, so it carries the screen's
              yellow. Once anything is on the item it goes quiet and the yellow
              moves to "Go to checkout" below.
            */}
            <ArtworkAttachmentList
              entries={entries}
              uploads={uploads}
              files={files}
              linkChecks={linkChecks}
              takesFiles={takesFiles}
              formats={uploadFormats}
              wordNote={uploadFormats.length ? wordFormatNote(name, uploadFormats) : null}
              ordered={keepsAttachmentList(line)}
              saving={listSaving}
              saveError={listError}
              notice={notice}
              onPick={() => void attachments.pick(line.id, guard)}
              onRemove={(key) => void attachments.remove(line.id, key)}
              onMove={(key, by) => void attachments.move(line.id, key, by)}
              onRelabel={(key, label) => void attachments.relabel(line.id, key, label)}
              onRecheck={(link) => void verifyLink(link, { force: true })}
              onRetryUpload={(key) => void attachments.retry(line.id, key)}
              onDismissUpload={(key) => attachments.dismiss(line.id, key)}
              guidance={lineGuidance}
              accepting={accepting}
              acceptError={acceptError}
              onAcceptWarning={(fileId, code, accept) =>
                void attachments.acceptWarning(line.id, fileId, code, accept)
              }
              onReplaceFile={(fileId) => void attachments.replace(line.id, fileId, guard)}
            />
          </TourTarget>
        ) : null}

        {links.length && roomLeft > 0 ? (
          <View className="mt-4">
            <DesignLinkField
              title={hasArtwork ? "Add a design link" : "Design link"}
              value={linkText}
              onChangeText={(text) => setLinkDraft(line.id, text)}
              onCommit={(text) => commitLinkText(text)}
              onClear={() => {
                setLinkDraft(line.id, "");
                commitLinkText("");
              }}
              onRecheck={() => commitLinkText(linkText, { recheck: true })}
              phrase={designLinkPhrase(links)}
              takesCanva={takesCanva}
              checking={linkChecking}
              saving={linkSaving}
              verdict={verdict}
              inputError={parsedLink && !parsedLink.ok ? parsedLink.message : null}
              saveError={linkSaveError}
              savedUnchecked={false}
            />
          </View>
        ) : null}

        {/*
          About the main file's shape against the size chosen. A warning,
          never a block — a file of the wrong size can still be printed
          scaled, and the client decides. Resolution and colour are each
          file's own, in the list above.
        */}
        {primaryId && fileIds.length > 1 && (sizeNote || summary || thinFile) ? (
          <Text className="mt-6 text-overline text-text-muted">MAIN FILE</Text>
        ) : null}
        {sizeNote ? <ArtworkSizeNote note={sizeNote} /> : null}
        {thinFile ? <Text className="mt-3 text-caption text-warning">{THIN_FILE_NOTE}</Text> : null}

        {saveError ? <Text className="mt-3 text-body text-error">{saveError}</Text> : null}

        {/*
          What the file itself says it is. This is a verification line, not a
          decoration: a client who exported the wrong artboard finds out here,
          before paying, rather than when the job comes back the wrong size.
          It is deliberately quiet — it confirms rather than asks — and it is
          absent entirely when the file said nothing, because an empty
          confident sentence is worse than no sentence.
        */}
        {summary ? (
          <View className="mt-3 flex-row items-start gap-2">
            <View className="pt-0.5">
              <FileCheck
                size={14}
                color={colors.textMuted}
                strokeWidth={2}
                aria-hidden
              />
            </View>
            <Text className="min-w-0 flex-1 text-caption text-text-muted">
              We read this as {summary}.
            </Text>
          </View>
        ) : null}

        {asksPages && (manualTotal || documentPages || unreadPages) ? (
          <View className="mt-4 gap-3">
            <Text className="text-overline text-text-muted">DOCUMENT PAGES</Text>
            {/*
              A Word file that did not save its page count. The client says how
              many pages it has; a count GRIDGO read is never typed over.
            */}
            {manualTotal ? (
              <>
                <Text className="text-body-lg text-text-primary">
                  {documentPages ? `${documentPages.total} pages in this file` : "How many pages does your file have?"}
                </Text>
                <Text className="text-caption text-text-secondary">
                  Your Word file did not say how many pages it has. Enter the total and GRIDGO
                  prices your pages from it. Copies are set at checkout.
                </Text>
                <Text className="text-body font-medium text-text-primary">Total pages in this file</Text>
                <TextInput
                  value={totalText}
                  onChangeText={(text) => setTotalDraft({ fileId: line.artworkFileId ?? "", text })}
                  editable={!saving}
                  placeholder="For example 12"
                  accessibilityLabel="Total pages in this file"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="gg-field px-4 text-body-lg text-text-primary"
                />
                {totalError ? <Text accessibilityRole="alert" className="text-body text-error">{totalError}</Text> : null}
                {totalDirty ? (
                  <SecondaryButton label="Save page count" disabled={saving || Boolean(totalError)}
                    onPress={() => void savePageTotal(Number(totalText.trim()))} />
                ) : null}
              </>
            ) : null}
            {documentPages ? (
              <>
                {manualTotal ? null : (
                  <>
                    <Text className="text-body-lg text-text-primary">
                      {documentPages.total} pages in this file
                    </Text>
                    <Text className="text-caption text-text-secondary">
                      Read from your file. Copies are set at checkout.
                    </Text>
                  </>
                )}
                <Text className="text-body font-medium text-text-primary">Pages to print</Text>
                <TextInput
                  value={rangeText}
                  onChangeText={(text) => setRangeDraft({ fileId: line.artworkFileId ?? "", text })}
                  editable={!saving}
                  placeholder="All pages"
                  accessibilityLabel="Pages to print"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={1000}
                  className="gg-field px-4 text-body-lg text-text-primary"
                />
                <Text className="text-caption text-text-secondary">
                  Leave blank for all pages, or enter 1-4, 7. Overlapping pages print once per copy.
                </Text>
                {rangeError ? <Text accessibilityRole="alert" className="text-body text-error">{rangeError}</Text> : null}
                {rangeDirty ? (
                  <SecondaryButton label="Apply pages" disabled={saving || Boolean(rangeError)}
                    onPress={() => void savePageRange(rangeText.trim() || null)} />
                ) : (
                  <Text className="text-body text-text-primary">{documentPagesSummary(documentPages)}</Text>
                )}
              </>
            ) : unreadPages ? <Text className="text-body text-error">{unreadPages}</Text> : null}
          </View>
        ) : null}

        {/*
          How the file sits on the paper, with GRIDGO's check of it: the
          picture to scale, a cut-off with the paper that fixes it, and what
          it could not read. It takes the place of the product mockup, which
          says nothing about scale — the question these products are about.
        */}
        {layouts.length ? (
          <View className="mt-8 gap-4" onLayout={(event) => setLayoutY(event.nativeEvent.layout.y)}>
            <PrintLayoutChoice
              layouts={layouts}
              selected={shownLayout}
              onSelect={(printLayout) => {
                if (printLayout !== line.printLayout) void saveLayout({ printLayout });
              }}
              step={null}
              disabled={layoutSaving}
              scaleNote={advice.scale}
            />
            {layoutError ? (
              <Text accessibilityRole="alert" className="text-body text-error">{layoutError}</Text>
            ) : null}
            {onLine && shownLayout ? (
              <View className="gap-3">
                <Text className="text-overline text-text-muted">ON THE PAPER</Text>
                <PrintLayoutPreview
                  check={layoutCheck}
                  layout={shownLayout}
                  previewFileId={line.artworkPreviewFileId ?? null}
                  advice={advice}
                  switching={layoutSaving}
                  onSwitchPaper={(paper) => {
                    const change = item ? paperChange(item, line, paper.optionId) : null;
                    if (change) void saveLayout(change);
                  }}
                />
              </View>
            ) : onLine ? (
              <Text className="text-caption text-text-muted">
                Choose a layout to see your page on the paper.
              </Text>
            ) : (
              <Text className="text-caption text-text-muted">
                Add your file above to see how it sits on the paper.
              </Text>
            )}
          </View>
        ) : null}

        {onLine && !layouts.length ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">HOW IT WOULD LOOK</Text>
            <ProductPreview
              subcategoryCode={item?.subcategoryCode}
              artworkFileId={line.artworkPreviewFileId ?? primaryId}
              artworkName={primary.fileName || name}
              productName={name}
              size={size || null}
            />
            <Text className="text-caption text-text-muted">{MOCKUP_LABEL}</Text>
          </View>
        ) : null}

        {item && !uploads.length && !links.length && otherLinks.length ? (
          <Text className="mt-3 text-body text-text-secondary">
            GRIDGO takes {formatSentence(otherLinks)} for this rather than an upload. Place the
            order and Operations will ask you for the link.
          </Text>
        ) : null}

        {/*
          Drawn only once there is a file to take to checkout. A disabled yellow
          slab under a card with no way to fill it was the whole of the reported
          problem: the screen's one loud control did nothing, and the control
          that would have done something did not exist.

          Checkout is the only way on. Adding another product is offered there,
          beside the whole basket, never here: a basket can hold several
          products, and "add something else first" read as a step this one
          still owed.
        */}
        {/*
          The per-order rights statement, where the artwork goes in. Checkout
          draws the same box again and records it against every order.
        */}
        {hasArtwork && rightsScope ? (
          <View className="mt-8">
            <ArtworkRightsBox scope={rightsScope} onOpen={(href) => router.push(href)} />
          </View>
        ) : null}

        {hasArtwork ? (
          <Pressable
            onPress={() => router.replace("/checkout")}
            disabled={!canCheckout}
            accessibilityRole="button"
            accessibilityLabel="Go to checkout"
            accessibilityState={{ disabled: !canCheckout }}
            className={!canCheckout ? "gg-btn-primary gg-disabled mt-4" : "gg-btn-primary mt-4"}
            style={({ pressed }) => (pressed && canCheckout ? { opacity: 0.9 } : undefined)}
          >
            <Text className="text-button text-action-yellow-on">
              {saving || listSaving ? "Saving…" : linkChecking || savedLinkChecking ? "Checking your link…" : "Go to checkout"}
            </Text>
          </Pressable>
        ) : null}
        {hasArtwork && (linkBlocked || fileProblem) ? (
          <Text className="mt-2 text-center text-caption text-error">
            {linkBlocked
              ? "Fix the sharing of the link marked above, or remove it."
              : "Remove the file GRIDGO cannot print from, or upload a new export."}
          </Text>
        ) : hasArtwork && layoutMissing ? (
          <Text className="mt-2 text-center text-caption text-warning">
            {line.printLayout
              ? `This shop no longer prints ${layoutLabel(line.printLayout)}. Choose another layout above.`
              : "Choose a layout above to go on."}
          </Text>
        ) : hasArtwork && inFlight > 0 ? (
          <Text className="mt-2 text-center text-caption text-text-muted">
            Checkout opens when every upload has finished.
          </Text>
        ) : null}

        {!hasArtwork ? (
          <Text className="mt-4 text-center text-caption text-text-muted">
            {links.length
              ? uploadFormats.length
                ? "GRIDGO needs at least one file or design link before it can print this."
                : "GRIDGO needs the design link before it can print this."
              : "GRIDGO needs the file before it can print this."}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
