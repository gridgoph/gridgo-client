import { Image } from "expo-image";
import { View } from "react-native";

import { artworkBox, paperAspect, type ExpressColour, type ExpressLayout, type ExpressPaper, type ExpressSides } from "@/lib/express";

type Props = {
  paper: ExpressPaper;
  layout: ExpressLayout;
  colour: ExpressColour;
  sides: ExpressSides;
  /** GRIDGO's picture of the first page; lines stand in while there is none. */
  uri: string | null;
  /** The file's own page, in thousandths of a millimetre, when GRIDGO read it. */
  fileSize: { widthMilli: number; heightMilli: number } | null;
  height: number;
};

/**
 * The sheet that comes out of the printer, drawn to scale: the paper's own
 * proportions, the first page placed the way the layout places it, grey for
 * B&W, and a second sheet behind it when both sides print. It answers "what
 * will I get" before the words under it do.
 */
export function PaperSheet({ paper, layout, colour, sides, uri, fileSize, height }: Props) {
  const width = Math.round(height * paperAspect(paper));
  const box = artworkBox(paper, layout, fileSize);
  const art = {
    left: box.left * width,
    top: box.top * height,
    width: box.width * width,
    height: box.height * height,
  };
  const label = `${sides === "two" ? "Two-sided" : "One-sided"} ${colour === "bw" ? "black and white" : "colour"} print preview`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: width + (sides === "two" ? 6 : 0), height: height + (sides === "two" ? 6 : 0) }}
    >
      {sides === "two" ? (
        <View
          className="absolute rounded-sm border border-slip-rule bg-slip-paper"
          style={{ left: 6, top: 6, width, height }}
        />
      ) : null}
      <View
        className="absolute left-0 top-0 overflow-hidden rounded-sm border border-slip-rule bg-slip-paper"
        style={{ width, height }}
      >
        <View style={{ position: "absolute", ...art, overflow: "hidden" }}>
          {uri ? (
            <Image
              source={{ uri }}
              contentFit="fill"
              style={{ width: "100%", height: "100%", ...(colour === "bw" ? { filter: [{ grayscale: 1 }] } : {}) }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="flex-1 gap-1 p-1">
              {[0.9, 0.7, 0.85, 0.6, 0.8, 0.5].map((share, index) => (
                <View
                  key={index}
                  className={colour === "bw" || index % 3 ? "h-0.5 bg-slip-ink-muted" : "h-0.5 bg-info"}
                  style={{ width: `${share * 100}%`, opacity: 0.6 }}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
