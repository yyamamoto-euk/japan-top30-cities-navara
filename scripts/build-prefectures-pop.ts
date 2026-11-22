// D3：寄り道の章（1940 → 1945 → 1950）の都道府県別人口を data/prefectures_pop.csv に書き出す。
// 実行：pnpm data:prefectures
//
// - 原本：data/raw/1940-1950/y750203000.xlsx（第75回 日本統計年鑑 表2-3「都道府県別人口」。書き換えない）
// - 単位は原本どおり千人（unit 列に書く）。千の位より下は原本に無いので、0 を足して人に直さない
// - 1945年は国勢調査ではなく「人口調査」（11月1日現在）。沖縄県の1945年は原本で「-」→ 空欄にして note に理由
// - 機械可読の一次資料（総務省統計局）の値そのものなので status は「一次照合済」
// - 見出しや並びが想定と違ったら止める。47都道府県の合計と全国の差も出す（千人単位の丸めの差）

import ExcelJS from "exceljs";
import { writeCsv } from "./lib/csv.ts";
import { ROOT } from "./lib/data.ts";

const XLSX = ROOT + "data/raw/1940-1950/y750203000.xlsx";
const OUT = ROOT + "data/prefectures_pop.csv";
const SOURCE_ID = "S1940_1950_YB75_T2_3";
const HEADER = ["pref_code", "pref_name", "pop1940", "pop1945", "pop1950", "unit", "source_id", "status", "note"];

/** 年 → 列（I=9, J=10, K=11）と、5行目の英語の見出し */
const COLUMNS = [
  { year: 1940, col: 9, label: "Population 1940" },
  { year: 1945, col: 10, label: "Population 1945" },
  { year: 1950, col: 11, label: "Population 1950" },
] as const;
const NATIONAL_ROW = 11;
const FIRST_PREF_ROW = 12; // 北海道
const PREF_COUNT = 47;

const text = (v: unknown): string => {
  if (v && typeof v === "object") {
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
  }
  return String(v ?? "");
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.worksheets[0];

// --- 表の形を確かめる ---
const title = text(ws.getCell("A1").value);
if (!title.startsWith("2-3")) throw new Error(`表の題が想定と違います：${title}`);
const unit = text(ws.getCell("A3").value);
if (!unit.includes("1,000人")) throw new Error(`単位が想定と違います：${unit}`);
for (const c of COLUMNS) {
  const h = text(ws.getRow(5).getCell(c.col).value).trim();
  if (h !== c.label) throw new Error(`${c.year}年の列の見出しが想定と違います：${h}`);
}
if (text(ws.getRow(NATIONAL_ROW).getCell(1).value) !== "全国") throw new Error("全国の行が見つかりません");

// --- 都道府県 ---
const rows: Record<string, string>[] = [];
const sums = new Map<number, number>(COLUMNS.map((c) => [c.year, 0]));
for (let i = 0; i < PREF_COUNT; i++) {
  const r = ws.getRow(FIRST_PREF_ROW + i);
  const code = Number(text(r.getCell(1).value));
  const name = text(r.getCell(2).value).trim();
  if (code !== i + 1 || name === "") throw new Error(`${FIRST_PREF_ROW + i}行目：都道府県の番号か名前が想定と違います（${code} ${name}）`);
  const out: Record<string, string> = {
    pref_code: String(code).padStart(2, "0"),
    pref_name: name,
    unit: "千人",
    source_id: SOURCE_ID,
    status: "一次照合済",
  };
  const notes: string[] = [];
  for (const c of COLUMNS) {
    const raw = text(r.getCell(c.col).value).trim();
    if (raw === "-") {
      out[`pop${c.year}`] = "";
      if (name === "沖縄県" && c.year === 1945) notes.push("1945年は人口調査の対象外（原本は「-」）");
      else notes.push(`${c.year}年は原本が「-」`);
      continue;
    }
    const v = Number(raw);
    if (!Number.isInteger(v) || v <= 0) throw new Error(`${name} ${c.year}年：値が読めません（${raw}）`);
    out[`pop${c.year}`] = String(v);
    sums.set(c.year, sums.get(c.year)! + v);
  }
  // 沖縄県の行の注 3)：昭和25年は12月1日現在
  if (text(r.getCell(4).value).trim() === "3)") notes.push("1950年は12月1日現在（原本の注3）");
  out.note = notes.join("。");
  rows.push(out);
}

writeCsv(OUT, HEADER, rows);

// --- 報告 ---
console.log(`data/prefectures_pop.csv：${rows.length} 都道府県（単位 千人）`);
for (const c of COLUMNS) {
  const national = Number(text(ws.getRow(NATIONAL_ROW).getCell(c.col).value));
  const sum = sums.get(c.year)!;
  const blanks = rows.filter((x) => x[`pop${c.year}`] === "").map((x) => x.pref_name);
  console.log(
    `  ${c.year}：都道府県の合計 ${sum}、全国 ${national}、差 ${national - sum}` +
      (blanks.length ? `（空欄：${blanks.join("・")}）` : ""),
  );
}
