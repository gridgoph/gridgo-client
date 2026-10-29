import { readFileSync } from "fs";
import { join } from "path";

import { RECEIPT_SOUND_VOLUME } from "@/lib/receiptPrint";

/**
 * The sound after placing an order is a short, soft ping (#339), not the
 * 1.1 s printer feed it replaced. Read from the shipped file itself, so a
 * longer sound dropped in under the same name fails here.
 */

/** The `mvhd` box's duration, in seconds. Version 0 is all ffmpeg writes. */
function m4aSeconds(file: Buffer): number {
  const at = file.indexOf("mvhd");
  if (at < 0) throw new Error("no mvhd box");
  const version = file.readUInt8(at + 4);
  if (version !== 0) throw new Error(`mvhd version ${version}`);
  const timescale = file.readUInt32BE(at + 16);
  const duration = file.readUInt32BE(at + 20);
  return duration / timescale;
}

describe("the receipt's ping", () => {
  const file = readFileSync(join(__dirname, "..", "assets", "audio", "receipt.m4a"));

  it("is well under a second", () => {
    expect(m4aSeconds(file)).toBeLessThan(0.5);
  });

  it("is a small file", () => {
    expect(file.length).toBeLessThan(8 * 1024);
  });

  it("plays below full volume", () => {
    expect(RECEIPT_SOUND_VOLUME).toBeGreaterThan(0);
    expect(RECEIPT_SOUND_VOLUME).toBeLessThan(1);
  });
});
