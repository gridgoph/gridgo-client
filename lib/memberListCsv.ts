/**
 * Reading a member list on the phone, so the officer can fix a row without
 * going back to the file. The grammar is gridgo-api's own
 * (`src/member-list.js`): RFC 4180, three columns in any order, blank rows
 * skipped. GRIDGO still decides whether a name, contact or date is good.
 */

import type { MemberListRow } from "@/lib/organizationMembersApi";
import { MONTH_NAMES } from "@/lib/organizationMembers";

/** Rows one check or save may carry. */
export const LIST_ROW_LIMIT = 500;
/** GRIDGO's own ceiling on the file. */
export const LIST_FILE_LIMIT = 512 * 1024;

export const LIST_COLUMNS = ["Name", "Email or mobile", "Member since"] as const;

export const LIST_HEADER_PROBLEM =
  "The first row must be the three columns: Name, Email or mobile, Member since. Check the file and choose it again.";
export const LIST_FILE_PROBLEM = "GRIDGO could not read that file. Save it as CSV and choose it again.";

export type ParsedList = { ok: true; rows: MemberListRow[] } | { ok: false; problem: string };

const HEADERS: Record<string, keyof MemberListRow> = {
  name: "name",
  "email or mobile": "contact",
  email: "contact",
  mobile: "contact",
  contact: "contact",
  "member since": "memberSince",
  membersince: "memberSince",
};

/** Cells by row, or null where the quoting is broken. */
function cells(source: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i <= source.length; i++) {
    const ch = source[i] ?? "\n";
    if (quoted && i < source.length) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && !cell && !closed) {
      quoted = true;
      continue;
    }
    if (closed && ![",", "\r", "\n"].includes(ch)) return null;
    if (ch === "," || ch === "\n") {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (ch === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (ch !== "\r") cell += ch;
  }
  return quoted ? null : rows;
}

/**
 * A table program rewrites "Aug 2024" as "Aug-24". Both are read as the month
 * they name, and a slashed date as month, day, year; anything else goes to GRIDGO as typed and comes back to be fixed.
 */
export function listDate(value: string, now: Date = new Date()): string {
  const text = value.trim();
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  // GRIDGO reads month first; a day-first date comes back to be fixed.
  if (slashed && Number(slashed[1]) <= 12) return `${slashed[3]}-${slashed[1]!.padStart(2, "0")}-${slashed[2]!.padStart(2, "0")}`;
  const match = /^([A-Za-z]{3,9})\.?[\s-]+(\d{4}|\d{2})$/.exec(text);
  if (!match) return text;
  const name = match[1]!.toLowerCase();
  const month = MONTH_NAMES.findIndex((entry) => entry.toLowerCase() === name || entry.slice(0, 3).toLowerCase() === name
    || (name === "sept" && entry === "September"));
  if (month < 0) return text;
  let year = match[2]!;
  if (year.length === 2) {
    const full = 2000 + Number(year);
    year = String(full > now.getUTCFullYear() ? full - 100 : full);
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** A table program drops the leading zero of a mobile number. */
export function listContact(value: string): string {
  const text = value.trim();
  return /^9\d{9}$/.test(text) ? `0${text}` : text;
}

export function parseMemberList(text: string, now: Date = new Date()): ParsedList {
  if (text.length > LIST_FILE_LIMIT) return { ok: false, problem: "That file is too large. Split it and send each part." };
  const rows = cells(text.replace(/^﻿/, ""));
  if (!rows) return { ok: false, problem: LIST_FILE_PROBLEM };
  const names = [...(rows.shift() ?? [])];
  // A table program may keep empty columns after the last one.
  while (names.length > 3 && !names.at(-1)) names.pop();
  const header = names.map((value) => HEADERS[value.toLowerCase()] ?? null);
  if (header.length !== 3 || header.some((field) => !field) || new Set(header).size !== 3) {
    return { ok: false, problem: LIST_HEADER_PROBLEM };
  }
  if (!rows.length) return { ok: false, problem: "That file has the columns but nobody on it yet." };
  if (rows.length > LIST_ROW_LIMIT) {
    return { ok: false, problem: `That list has ${rows.length.toLocaleString("en-PH")} people. Send up to ${LIST_ROW_LIMIT} at a time.` };
  }
  return {
    ok: true,
    rows: rows.map((values) => {
      const row: MemberListRow = { name: "", contact: "", memberSince: "" };
      header.forEach((field, index) => {
        if (field) row[field] = values[index] ?? "";
      });
      return { name: row.name, contact: listContact(row.contact), memberSince: listDate(row.memberSince, now) };
    }),
  };
}
