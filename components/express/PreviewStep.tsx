import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileStack,
  LayoutTemplate,
  MessageSquareText,
  Minus,
  Palette,
  Plus,
  RectangleVertical,
  TriangleAlert,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ChoiceChips, ExpressRow } from "@/components/express/ExpressChrome";
import { PaperSheet } from "@/components/express/PaperSheet";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { TextField } from "@/components/form/TextField";
import { useArtworkImage } from "@/hooks/useArtworkImage";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type StoredFile } from "@/lib/api";
import { pageRangeError } from "@/lib/documentPages";
import {
  canTickLooksRight,
  choicesKey,
  EXPRESS_MAX_COPIES,
  EXPRESS_NOTE_MAX,
  filePageCount,
  filePaperName,
  LAYOUT_OPTIONS,
  looksRightHolds,
  openWarnings,
  PAPER_OPTIONS,
  printedPages,
  printSummary,
  type ExpressLayout,
  type ExpressPrint,
} from "@/lib/express";
import { usesShopPrices } from "@/lib/whoPrints";
import { expressChoices, useExpress } from "@/store/express";

type RowKey = "pages" | "paper" | "printAs" | "layout" | "note";

function fileSizeOf(file: StoredFile) {
  const { widthMilli, heightMilli } = file.detected ?? {};
  return widthMilli && heightMilli ? { widthMilli, heightMilli } : null;
}

function FileCard({ file, print, index, count }: { file: StoredFile; print: ExpressPrint; index: number; count: number }) {
  const colors = useThemeColors();
  const sample = useExpress((state) => state.sample);
  const image = useArtworkImage(sample ? null : file.fileId);
  const pages = filePageCount(file);
  const paper = filePaperName(file.detected);
  const files = useExpress((state) => state.files);
  const show = (offset: number) => {
    const next = files[(index + offset + count) % count];
    if (next) useExpress.getState().showFile(next.fileId);
  };
  return (
    <View className="gg-card-flush flex-row items-center gap-4 p-3">
      <PaperSheet
        paper={print.paper}
        layout={print.layout}
        colour={print.colour}
        sides={print.sides}
        uri={image.uri}
        fileSize={fileSizeOf(file)}
        height={112}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
          {file.originalFilename}
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {[pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, paper].filter(Boolean).join(" · ")}
        </Text>
        <Pressable
          onPress={() => void image.openFile()}
          accessibilityRole="link"
          accessibilityLabel={`View all pages of ${file.originalFilename}`}
          className="min-h-11 justify-center self-start"
        >
          <Text className="text-body font-medium text-text-primary underline">
            {image.opening ? "Opening…" : "View all pages"}
          </Text>
        </Pressable>
        {count > 1 ? (
          <View className="flex-row items-center gap-1">
            <Pressable onPress={() => show(-1)} accessibilityRole="button" accessibilityLabel="Previous file" className="gg-touch items-center justify-center">
              <ChevronLeft size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </Pressable>
            <Text className="text-caption text-text-secondary">
              File {index + 1} of {count}
            </Text>
            <Pressable onPress={() => show(1)} accessibilityRole="button" accessibilityLabel="Next file" className="gg-touch items-center justify-center">
              <ChevronRight size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Warnings({ file, print }: { file: StoredFile; print: ExpressPrint }) {
  const colors = useThemeColors();
  const warnings = openWarnings(file, print);
  if (!warnings.length) return null;
  return (
    <View className="gap-2">
      {warnings.map((warning) => (
        <View key={warning.code} className="flex-row items-center gap-2 rounded-field border border-outline bg-surface py-1 pl-3 pr-1" accessibilityRole="alert">
          <TriangleAlert size={16} color={colors.warning} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-primary" numberOfLines={2}>
            {warning.message}
          </Text>
          {warning.fix ? (
            <Pressable
              onPress={() => useExpress.getState().changePrint(file.fileId, warning.fix!.change)}
              accessibilityRole="button"
              className="min-h-11 justify-center rounded-field bg-accent px-3"
            >
              <Text className="text-caption font-bold text-accent-on">{warning.fix.label}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => useExpress.getState().acceptWarning(file.fileId, warning.code)}
            accessibilityRole="button"
            accessibilityLabel={`Keep it: ${warning.message}`}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-caption font-medium text-text-secondary">Keep</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function LayoutChoices({ file, print }: { file: StoredFile; print: ExpressPrint }) {
  const sample = useExpress((state) => state.sample);
  const image = useArtworkImage(sample ? null : file.fileId);
  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Layout">
      {LAYOUT_OPTIONS.map((option) => {
        const selected = option.value === print.layout;
        return (
          <Pressable
            key={option.value}
            onPress={() => useExpress.getState().changePrint(file.fileId, { layout: option.value as ExpressLayout })}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            className={
              selected
                ? "flex-1 items-center gap-1.5 rounded-field border-2 border-accent bg-surface-high py-2"
                : "flex-1 items-center gap-1.5 rounded-field border-2 border-outline bg-surface py-2"
            }
          >
            <PaperSheet
              paper={print.paper}
              layout={option.value}
              colour={print.colour}
              sides="one"
              uri={image.uri}
              fileSize={fileSizeOf(file)}
              height={52}
            />
            <Text className="px-1 text-center text-caption text-text-primary" numberOfLines={2}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PagesChoice({ file, print }: { file: StoredFile; print: ExpressPrint }) {
  const total = filePageCount(file) ?? 1;
  const [draft, setDraft] = useState(print.pageRange ?? "");
  const [ranged, setRanged] = useState(print.pageRange != null);
  const error = ranged ? pageRangeError(draft, total) : null;
  return (
    <View className="gap-2">
      <ChoiceChips
        label="Pages"
        options={[
          { value: "all", label: `All ${total}` },
          { value: "range", label: "Choose pages" },
        ]}
        value={ranged ? "range" : "all"}
        onChange={(value) => {
          setRanged(value === "range");
          if (value === "all") useExpress.getState().changePrint(file.fileId, { pageRange: null });
        }}
      />
      {ranged ? (
        <View className="gap-1">
          <TextField
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              const ok = text.trim() && !pageRangeError(text, total);
              useExpress.getState().changePrint(file.fileId, { pageRange: ok ? text.trim() : null });
            }}
            placeholder="e.g. 1-3, 5"
            accessibilityLabel="Pages to print"
            keyboardType="numbers-and-punctuation"
            invalid={Boolean(error)}
          />
          {error ? <Text className="text-caption text-error">{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function CopiesStepper({ fileId, copies }: { fileId: string; copies: number }) {
  const colors = useThemeColors();
  const set = (next: number) =>
    useExpress.getState().changePrint(fileId, { copies: Math.min(EXPRESS_MAX_COPIES, Math.max(1, next)) });
  return (
    <View className="flex-row items-center" accessibilityRole="adjustable" accessibilityLabel={`Copies, ${copies}`}>
      <Pressable
        onPress={() => set(copies - 1)}
        disabled={copies <= 1}
        accessibilityRole="button"
        accessibilityLabel="One copy fewer"
        className={copies <= 1 ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
      >
        <Minus size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      </Pressable>
      <Text className="min-w-8 text-center text-body-lg font-bold text-text-primary">{copies}</Text>
      <Pressable
        onPress={() => set(copies + 1)}
        disabled={copies >= EXPRESS_MAX_COPIES}
        accessibilityRole="button"
        accessibilityLabel="One copy more"
        className="gg-touch items-center justify-center"
      >
        <Plus size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      </Pressable>
    </View>
  );
}

/** Step two: how each file prints. One accordion row open at a time. */
export function PreviewStep() {
  const files = useExpress((state) => state.files);
  const prints = useExpress((state) => state.prints);
  const activeFileId = useExpress((state) => state.activeFileId);
  // A3 is offered only where the client can then choose each shop's price.
  const choosesPrinter = useExpress((state) => state.whoPrints !== "off");
  const [open, setOpen] = useState<RowKey | null>(null);
  const index = Math.max(0, files.findIndex((row) => row.fileId === activeFileId));
  const file = files[index];
  const print = prints.find((row) => row.fileId === file?.fileId);
  if (!file || !print) return null;
  const total = filePageCount(file);
  const summary = printSummary(print, total);
  const toggle = (key: RowKey) => setOpen((current) => (current === key ? null : key));
  const change = (next: Partial<ExpressPrint>) => useExpress.getState().changePrint(file.fileId, next);

  return (
    <View className="gap-3">
      <FileCard file={file} print={print} index={index} count={files.length} />
      <Warnings file={file} print={print} />
      <View className="gg-card-flush">
        <ExpressRow icon={FileStack} title="Pages" value={summary.pages} open={open === "pages"} onToggle={() => toggle("pages")} divided={false}>
          <PagesChoice key={file.fileId} file={file} print={print} />
        </ExpressRow>
        <ExpressRow icon={RectangleVertical} title="Paper" value={summary.paper} open={open === "paper"} onToggle={() => toggle("paper")}>
          <View className="gap-2">
            <ChoiceChips
              label="Paper"
              options={choosesPrinter ? PAPER_OPTIONS : PAPER_OPTIONS.filter((option) => option.value !== "a3")}
              value={print.paper}
              onChange={(paper) => change({ paper })}
            />
            {print.paper === "a3" ? (
              <Text className="text-caption text-text-secondary">
                Each shop sets its own A3 price. You pay once the shop accepts.
              </Text>
            ) : null}
          </View>
        </ExpressRow>
        <ExpressRow icon={Palette} title="Print as" value={summary.printAs} open={open === "printAs"} onToggle={() => toggle("printAs")}>
          <View className="gap-2">
            <ChoiceChips
              label="Colour"
              options={[
                { value: "bw", label: "B&W" },
                { value: "colour", label: "Colour" },
              ]}
              value={print.colour}
              onChange={(colour) => change({ colour })}
            />
            <ChoiceChips
              label="Sides"
              options={[
                { value: "one", label: "One side" },
                { value: "two", label: "Two sides" },
              ]}
              value={print.sides}
              onChange={(sides) => change({ sides })}
            />
          </View>
        </ExpressRow>
        <ExpressRow icon={LayoutTemplate} title="Layout" value={summary.layout} open={open === "layout"} onToggle={() => toggle("layout")}>
          <LayoutChoices file={file} print={print} />
        </ExpressRow>
        <ExpressRow icon={MessageSquareText} title="Note" value={summary.note} open={open === "note"} onToggle={() => toggle("note")}>
          <TextField
            value={print.note}
            onChangeText={(note) => change({ note: note.slice(0, EXPRESS_NOTE_MAX) })}
            placeholder="For the shop, e.g. keep each copy together"
            accessibilityLabel="Note for the shop"
            maxLength={EXPRESS_NOTE_MAX}
          />
        </ExpressRow>
        <ExpressRow
          icon={Copy}
          title="Copies"
          value=""
          trailing={<CopiesStepper fileId={file.fileId} copies={print.copies} />}
        />
      </View>
    </View>
  );
}

/** Printed pages across every file, for the footer while there is no price yet. */
function pagesLine(files: StoredFile[], prints: ExpressPrint[]): string {
  const count = prints.reduce((sum, print) => {
    const file = files.find((row) => row.fileId === print.fileId);
    const total = file ? filePageCount(file) : null;
    return sum + (total ? printedPages(total, print) : 0);
  }, 0);
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

export function PreviewFooter({
  onContinue,
  continueLabel = null,
  priceNote = null,
  busy = false,
  error = null,
}: {
  onContinue: () => void;
  /** A group member saves instead of choosing a printer. */
  continueLabel?: string | null;
  /** Said where the price would be, when nothing is priced on this screen. */
  priceNote?: string | null;
  busy?: boolean;
  error?: string | null;
}) {
  const files = useExpress((state) => state.files);
  const prints = useExpress((state) => state.prints);
  const tickedKey = useExpress((state) => state.tickedKey);
  const supplierId = useExpress((state) => state.supplierId);
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const draft = useExpress((state) => state.draft);
  const fareLimit = useExpress((state) => state.fareLimit);
  const shopsOnly = useExpress((state) => state.shopsOnly);
  const verifiedOnly = useExpress((state) => state.verifiedOnly);
  const choosesPrinter = useExpress((state) => state.whoPrints !== "off");
  const shopPrices = usesShopPrices(prints);
  const key = choicesKey(expressChoices({ prints, supplierId, fulfilment, place, fareLimit, shopsOnly, verifiedOnly }));
  const ticked = looksRightHolds(tickedKey, { prints });
  const tickable = canTickLooksRight(files, prints);
  const price = draft.status === "ready" && draft.key === key && !shopPrices ? draft.draft.quote.clientItemSubtotalMinor : null;
  const pricing = draft.status === "loading" || (draft.status === "ready" && draft.key !== key);
  return (
    <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <CheckboxRow
            checked={ticked}
            onChange={(next) => useExpress.getState().setTicked(next)}
            disabled={!tickable}
            label="Looks right"
            hint={tickable ? undefined : "Fix or keep the warning first"}
          />
        </View>
        <View className="items-end" accessible accessibilityLabel={price != null ? `Printing ${formatPhp(price)}` : pagesLine(files, prints)}>
          <Text className="text-caption text-text-muted">{pagesLine(files, prints)}</Text>
          {price != null || pricing ? (
            <Text className="text-body-lg font-bold text-text-primary">{price != null ? formatPhp(price) : "…"}</Text>
          ) : (
            // No shop or place yet: Pay picks both, and the price follows.
            <Text className="text-caption text-text-secondary">
              {priceNote ? priceNote : shopPrices ? "Each shop prices A3" : choosesPrinter ? "Priced next" : supplierId && place ? "No price yet" : "Priced on Pay"}
            </Text>
          )}
        </View>
      </View>
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={onContinue}
        disabled={!ticked || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ticked || busy }}
        className={ticked && !busy ? "gg-btn-primary" : "gg-btn-primary gg-disabled"}
      >
        <Text className="text-button text-action-yellow-on">
          {continueLabel ?? (choosesPrinter ? "Choose who prints it" : "Continue to pay")}
        </Text>
      </Pressable>
    </View>
  );
}
