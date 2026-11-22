// D8：寄り道の章（1940・1945・1950）の市の人口を observations.csv に入れる。
// 実行：pnpm data:1940-1950
//
// 原本（どちらも一橋大学経済研究所の「日本統計年鑑・帝国統計年鑑」データベースの、統計表の画像と、それを起こしたテキスト）
// - 1940・1945年：日本統計年鑑（1949年刊）表27「人口10万以上の都市別人口（昭和5年10年15年20年―22年）」
//   data/raw/1940-1950/yb1949_t027.xlsx（テキスト）・yb1949_038.jpg（画像）
//   1947年に10万人以上だった52市だけの表。1945年は人口調査（11月1日）、1940年は国勢調査（10月1日）
// - 1950年：日本統計年鑑（1951年刊）表10「市別人口」（昭和25年国勢調査、全国の市）
//   data/raw/1940-1950/yb1951_t010.xlsx（テキスト）・yb1951_024.jpg（画像）
//
// 読み方
// - 列ごとに、市の値の合計が表の「総数」と一致することを確かめる。合わなければ止める
// - 1940年の東京都は、原本の印刷が 677,804。この1件を 6,778,804 にすると列の合計が総数と一致する
//   （差がちょうど 6,101,000）。印刷の誤りとみなし、6,778,804 を入れて note に理由を書く
// - 東京は、1940年＝東京市、1945年・1950年＝東京都区部（23区の区域）として入れる。1950年の表の23区の行は使わない
// - 名前の読み取り違い（テキストの「字部市」＝画像では「宇部市」）は直す
// - 足す行：各年の上位40と、entities.csv の柱に当たる市。status＝一次照合済（画像から起こしたテキスト。列の合計が総数と一致し、2026-11-22 yyamaが照合表で確認して確定）
// - rank：1940・1945年は表27の52市の中での順位（全国の市の順位とは、下のほうで違うことがある）。1950年は全国の市の中での順位
// - 何度実行しても同じになるよう、先に同じ source_id の行を消してから足す

import ExcelJS from "exceljs";
import { readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS, ROOT, loadEntities } from "./lib/data.ts";

const DIR = ROOT + "data/raw/1940-1950/";
const SRC49 = "S_YB1949_T27";
const SRC51 = "S_YB1951_T10";
const TOP = 40;
const TOKYO_1940_PRINTED = 677804;
const TOKYO_1940_FIXED = 6778804;
const NAME_FIX: Record<string, string> = { 字部市: "宇部市" };

type Row = { pref: string; name: string; pop: number; note: string };
const jp = (v: unknown) => String(v ?? "").split("!!!")[0].trim();
const num = (v: unknown) => (typeof v === "number" ? v : v && typeof v === "object" && "result" in v ? Number((v as { result: unknown }).result) : NaN);

async function sheet(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DIR + file);
  const ws = wb.getWorksheet("Data");
  if (!ws) throw new Error(`${file}：Data シートがありません`);
  return ws;
}

// --- 1940・1945（表27） ---
const t27 = await sheet("yb1949_t027.xlsx");
const COL = { 1945: 5, 1940: 6 } as const;
const head = [5, 6].map((c) => jp(t27.getRow(1).getCell(c).value));
if (head[0] !== "昭和20.11.1" || head[1] !== "昭和15.10.1") throw new Error(`表27の見出しが想定と違います：${head.join(" / ")}`);
const by49: Record<1940 | 1945, Row[]> = { 1940: [], 1945: [] };
let pref = "";
for (let r = 4; r <= t27.rowCount; r++) {
  const row = t27.getRow(r);
  if (jp(row.getCell(1).value)) pref = jp(row.getCell(1).value);
  const raw = jp(row.getCell(2).value);
  if (!raw) continue;
  for (const y of [1940, 1945] as const) {
    let pop = num(row.getCell(COL[y]).value);
    if (!Number.isFinite(pop)) continue;
    const isTokyo = raw === "東京都";
    const name = isTokyo ? (y === 1940 ? "東京市" : "東京都区部") : NAME_FIX[raw] ?? raw;
    const notes = [`日本統計年鑑（1949年刊）表27 人口10万以上の都市別人口（yb1949_t027.xlsx・yb1949_038.jpg 右ページ）`];
    notes.push(y === 1945 ? "1945年11月1日 人口調査" : "1940年10月1日 国勢調査");
    if (isTokyo) notes.push(y === 1940 ? "原本は「東京都」。1940年は東京市（35区）" : "原本は「東京都」。区部の値（都全体ではない）");
    if (NAME_FIX[raw]) notes.push(`テキストは「${raw}」、画像は「${name}」`);
    if (isTokyo && y === 1940) {
      if (pop !== TOKYO_1940_PRINTED) throw new Error(`1940年の東京都が想定と違います：${pop}`);
      pop = TOKYO_1940_FIXED;
      notes.push(`原本の印刷は ${TOKYO_1940_PRINTED.toLocaleString("en-US")}。この1件を ${TOKYO_1940_FIXED.toLocaleString("en-US")} にすると、52市の合計が表の総数 21,784,655 と一致する（差がちょうど 6,101,000）ので印刷の誤りとみなした`);
    }
    by49[y].push({ pref, name, pop, note: notes.join("。") });
  }
}
for (const y of [1940, 1945] as const) {
  const total = num(t27.getRow(3).getCell(COL[y]).value);
  const sum = by49[y].reduce((a, x) => a + x.pop, 0);
  if (sum !== total) throw new Error(`表27 ${y}年：市の合計 ${sum} が総数 ${total} と合いません`);
}

// --- 1950（表10） ---
const t10 = await sheet("yb1951_t010.xlsx");
const all50: { pref: string; name: string; pop: number; ward: boolean }[] = [];
pref = "";
for (let r = 5; r <= t10.rowCount; r++) {
  const row = t10.getRow(r);
  if (jp(row.getCell(1).value)) pref = jp(row.getCell(1).value);
  const raw = jp(row.getCell(2).value);
  const pop = num(row.getCell(3).value);
  if (!raw || !Number.isFinite(pop)) continue;
  const ward = pref === "東京都" && /区$/.test(raw);
  const name = raw.includes("区の存する区域") ? "東京都区部" : NAME_FIX[raw] ?? raw;
  all50.push({ pref, name, pop, ward });
}
const total50 = num(t10.getRow(4).getCell(3).value);
const cities50 = all50.filter((x) => !x.ward);
const wards50 = all50.filter((x) => x.ward);
const ku = cities50.find((x) => x.name === "東京都区部")!;
if (cities50.reduce((a, x) => a + x.pop, 0) !== total50) throw new Error("表10：市の合計が市部総数と合いません");
if (wards50.reduce((a, x) => a + x.pop, 0) !== ku.pop) throw new Error("表10：23区の合計が区部と合いません");
const by50: Row[] = cities50.map((c) => ({
  pref: c.pref,
  name: c.name,
  pop: c.pop,
  note: ["日本統計年鑑（1951年刊）表10 市別人口（yb1951_t010.xlsx・yb1951_024.jpg）", "1950年10月1日 国勢調査", ...(c.name === "東京都区部" ? ["原本は「（区の存する区域）」"] : [])].join("。"),
}));

// --- 足す行 ---
const idx = new Map<string, string>();
for (const e of loadEntities()) for (const n of e.names) idx.set(`${e.pref_now}|${n}`, e.entity_id);
const rows = readCsv(PATHS.observations);
const header = Object.keys(rows[0]);
const kept = rows.filter((r) => !(r.source_id === SRC49 || r.source_id === SRC51));
const report: string[] = [];
const add = (year: number, list: Row[], src: string, rankNote: string) => {
  const sorted = [...list].sort((a, b) => b.pop - a.pop);
  let n = 0;
  sorted.forEach((x, i) => {
    const rank = i + 1;
    const hit = idx.get(`${x.pref}|${x.name}`);
    if (rank > TOP && !hit) return;
    if (rank <= TOP && !hit) throw new Error(`${year}年 ${rank}位 ${x.pref} ${x.name} が entities.csv の柱に当たりません`);
    const v: Record<string, string> = { year: String(year), rank: String(rank), name_then: x.name, pref_now: x.pref, pop: String(x.pop), source_id: src, status: "一次照合済", note: `${x.note}。${rankNote}。2026-11-22 yyamaが照合表（data/check/1940-1950-cities.md）で確認し、一次照合済に変更` };
    kept.push(Object.fromEntries(header.map((h) => [h, v[h] ?? ""])));
    n++;
  });
  report.push(`${year}年：${n} 行（上位${TOP}と柱）`);
};
add(1940, by49[1940], SRC49, "rankは表27の52市（1947年に10万人以上の市）の中での順位");
add(1945, by49[1945], SRC49, "rankは表27の52市（1947年に10万人以上の市）の中での順位");
add(1950, by50, SRC51, `rankは表10の全国の市（${cities50.length}）の中での順位`);
writeCsv(PATHS.observations, header, kept);
console.log(`表27：52市、1940・1945年の列の合計が総数と一致（1940年は東京都を ${TOKYO_1940_FIXED.toLocaleString("en-US")} にして）`);
console.log(`表10：市 ${cities50.length}（23区を除く）、合計が市部総数と一致、23区の合計が区部と一致`);
for (const s of report) console.log(s);
