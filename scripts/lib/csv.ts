// CSV の読み書き（RFC 4180 の範囲）。
// 引用符で囲んだ値（カンマ・改行・"" を含む）、CRLF、先頭の BOM に対応する。

import { readFileSync, writeFileSync } from "node:fs";

export type Row = Record<string, string>;

/** CSV 文字列を、1行目を見出しとしたオブジェクトの配列にする。 */
export function parseCsv(text: string): Row[] {
  const records = parseRecords(text.replace(/^﻿/, ""));
  if (records.length === 0) return [];
  const header = records[0].map((h) => h.trim());
  const rows: Row[] = [];
  for (const rec of records.slice(1)) {
    // 空行は飛ばす
    if (rec.length === 1 && rec[0] === "") continue;
    const row: Row = {};
    header.forEach((h, i) => {
      row[h] = rec[i] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new Error("CSV: 閉じていない引用符があります");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function readCsv(path: string): Row[] {
  return parseCsv(readFileSync(path, "utf8"));
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * 見出しの順で CSV を書く。
 * 先頭の BOM（Excel 用の目印）は、もとのファイルに合わせる：既にあるファイルなら有無を保ち、無ければ付ける。
 */
export function writeCsv(path: string, header: string[], rows: Row[]): void {
  let bom = true;
  try {
    bom = readFileSync(path, "utf8").startsWith("﻿");
  } catch {
    // 新しいファイル
  }
  const lines = [header.map(quote).join(",")];
  for (const row of rows) lines.push(header.map((h) => quote(row[h] ?? "")).join(","));
  writeFileSync(path, (bom ? "﻿" : "") + lines.join("\n") + "\n", "utf8");
}
