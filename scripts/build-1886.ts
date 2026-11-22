// D4：1886年の値を原表（第7回日本帝国統計年鑑 第24表、明治19年12月31日調）で入れ直す。
// 実行：pnpm data:1886
//
// - 原表の読み取りは scripts/lib/table-1886.ts（117件、合計が表の総計と一致）。照合表は data/check/1886.md
// - 消す行：1886年の S1886_SORAN（国勢総覧の転記）と S1886_UUB（uub.jp）の行すべて。どちらも原表と比べ終えた二次資料で、
//   違いは照合表に残してある。札幌市統計書（S_SAPPORO_STAT）の行は残す
// - 足す行：原表の上位40と、entities.csv の柱に当たる市街。status＝一次照合済（画像から読んだ値。117件の合計が総計と一致し、2026-11-22 yyamaが照合表で確認して確定）
//   rank は原表の117件の中での人口順
// - entities.csv：柱の names に1886年の名前（「甲府」など、町・市の付かない名前）が無いときは先頭に足す
// - 何度実行しても同じになるよう、先に同じ source_id の行を消してから足す

import { readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS } from "./lib/data.ts";
import { FOOTNOTE, SOURCE_ID_1886, rows1886 } from "./lib/table-1886.ts";

const TOP = 40;
const OLD_SOURCES = new Set(["S1886_SORAN", "S1886_UUB", SOURCE_ID_1886]);
const IMAGE: Record<number, string> = { 45: "yb07_043.jpg", 46: "yb07_044.jpg", 47: "yb07_044.jpg" };
/** 前の行から引き継ぐ注記と、資料の間の違い */
const EXTRA: Record<string, string> = {
  東京: "戸籍ベースの年末人口。国勢調査とは定義が違う",
  高松: "当時は愛媛県",
  奈良: "当時は大阪府",
  赤間関: "今の下関",
  高田: "今の上越",
  宇治山田: "今の伊勢",
  新潟: "国勢総覧の転記（S1886_SORAN）は 40,776",
  首里: "国勢総覧の転記（S1886_SORAN）は 25,581",
  前橋: "国勢総覧の転記（S1886_SORAN）の 32,531 は誤り",
  松山: "国勢総覧の転記（S1886_SORAN）では、この値が八幡になっていた",
  高知: "国勢総覧の転記（S1886_SORAN）に無かった",
  那覇: "国勢総覧の転記（S1886_SORAN）に無かった",
  銚子: "国勢総覧の転記（S1886_SORAN）に無かった",
};

// --- entities.csv：1886年の名前を足す ---
const entRows = readCsv(PATHS.entities);
const entHeader = Object.keys(entRows[0]);
const addedNames: string[] = [];
const entityOf = (pref: string, name: string) => {
  const names = (e: Record<string, string>) => e.names.split("|");
  const exact = entRows.find((e) => e.pref_now === pref && names(e).includes(name));
  if (exact) return exact.entity_id;
  const variant = entRows.find((e) => e.pref_now === pref && names(e).some((n) => [`${name}町`, `${name}区`, `${name}市`, `${name}村`].includes(n)));
  if (!variant) return undefined;
  variant.names = [name, ...names(variant)].join("|");
  addedNames.push(`${variant.entity_id}（${name}）`);
  return variant.entity_id;
};

// --- observations.csv ---
const rows = readCsv(PATHS.observations);
const header = Object.keys(rows[0]);
const kept = rows.filter((r) => !(r.year === "1886" && OLD_SOURCES.has(r.source_id)));
const removed = rows.length - kept.length;
let added = 0;
for (const r of [...rows1886].sort((a, b) => a.rank - b.rank)) {
  const entity = entityOf(r.pref, r.name);
  if (r.rank > TOP && !entity) continue;
  if (!entity) throw new Error(`${r.rank}位 ${r.pref} ${r.name} が entities.csv の柱に当たりません`);
  const notes = [
    `第7回日本帝国統計年鑑 第24表（${IMAGE[r.page]} ${r.page}ページ）。明治19年12月31日調の現住人員`,
    `表は「${r.label}」`,
    `rankは表の1万人以上の市街117件の中での人口順`,
  ];
  if (FOOTNOTE.has(r.name)) notes.push("欄外に「平均ノ疑ハシキモノアレドモ姑ク原書ノ儘ヲ記ス」（1戸あたりの人数が疑わしい）");
  if (EXTRA[r.name]) notes.push(EXTRA[r.name]);
  const v: Record<string, string> = {
    year: "1886",
    rank: String(r.rank),
    name_then: r.name,
    pref_now: r.pref,
    pop: String(r.pop),
    source_id: SOURCE_ID_1886,
    status: "一次照合済",
    note: [...notes, "2026-11-22 yyamaが照合表（data/check/1886.md）で確認し、一次照合済に変更"].join("。"),
  };
  kept.push(Object.fromEntries(header.map((h) => [h, v[h] ?? ""])));
  added++;
}
writeCsv(PATHS.observations, header, kept);
if (addedNames.length) writeCsv(PATHS.entities, entHeader, entRows);

console.log(`1886年：前の行 ${removed} 行を消し、原表の ${added} 行を足しました（上位${TOP}と柱）`);
if (addedNames.length) console.log(`entities.csv に1886年の名前を足しました：${addedNames.join("、")}`);
