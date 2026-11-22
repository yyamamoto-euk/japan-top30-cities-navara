// D5：observations.csv の2025年の行を、e-Stat の令和7年国勢調査 人口等基本集計 表1-1 と照合する。
// 実行：pnpm data:check-2025
//
// - 原本：data/raw/2025/b01_01.xlsx（書き換えない）
// - 比べる相手：表1-1 の「市」と「21大都市（政令市と特別区部）」の行（地域識別コード 1・2）。
//   区（0）、町村（3）、2000年の旧市町村（9）、全国・都道府県（a）は使わない
// - 人口（総数）が完全に一致した「二次のみ」の行は、status を「一次照合済」、source_id を S2025_ESTAT に変える
// - 一致しない行は変えずに、data/check/2025-estat.md に差を出す
// - 順位：表1-1 の市と特別区部を人口の多い順に並べた順位と、observations の rank を比べる（rank は変えない）
// - entities.csv の柱のうち、吸収されていないのに2025年の行が無いものは、表1-1 から行を足す
//   （機械可読の一次資料の値そのものなので status＝一次照合済、source_id＝S2025_ESTAT）

import { mkdirSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS, ROOT, loadEntities } from "./lib/data.ts";

const XLSX = ROOT + "data/raw/2025/b01_01.xlsx";
const REPORT = ROOT + "data/check/2025-estat.md";
const FIRST_DATA_ROW = 16;
const CITY_IDS = new Set(["1", "2"]); // 1 = 21大都市（政令市・特別区部）、2 = 市
const CHECKED_ON = "2026-11-22";

type EstatCity = { pref: string; name: string; code: string; pop: number; rank: number };

const cellText = (x: unknown): string => {
  if (x && typeof x === "object" && "result" in (x as object)) return String((x as { result: unknown }).result ?? "");
  return String(x ?? "");
};
/** "13_東京都" → "東京都"、"1213_特別区部" → "特別区部" */
const stripPrefix = (s: string) => s.replace(/^\d+_/, "").trim();

async function loadEstat(): Promise<EstatCity[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.worksheets[0];
  // 見出しが想定どおりかを確かめる（表の形が変わったら止める）
  const header = [5, 6, 7, 8].map((c) => cellText(ws.getRow(15).getCell(c).value).trim());
  const unit = cellText(ws.getRow(12).getCell(8).value).trim();
  if (header[0] !== "2025年_都道府県" || header[1] !== "2025年_地域コード" || header[2] !== "地域名" || unit !== "0_総数") {
    throw new Error(`表1-1 の見出しが想定と違います：${header.join(" / ")} / ${unit}`);
  }
  const out: Omit<EstatCity, "rank">[] = [];
  ws.eachRow((row, r) => {
    if (r < FIRST_DATA_ROW) return;
    const id = cellText(row.getCell(1).value).trim();
    if (!CITY_IDS.has(id)) return;
    const pop = Number(cellText(row.getCell(8).value));
    if (!Number.isInteger(pop) || pop <= 0) throw new Error(`${r}行目：人口が読めません`);
    out.push({
      pref: stripPrefix(cellText(row.getCell(5).value)),
      code: cellText(row.getCell(6).value).trim(),
      name: stripPrefix(cellText(row.getCell(7).value)),
      pop,
    });
  });
  const ranked = [...out].sort((a, b) => b.pop - a.pop);
  return ranked.map((c, i) => ({ ...c, rank: i + 1 }));
}

const estat = await loadEstat();
const byKey = new Map(estat.map((c) => [`${c.pref}|${c.name}`, c]));

const rows = readCsv(PATHS.observations);
const header = Object.keys(rows[0]);

type Result = {
  line: number;
  name: string;
  pref: string;
  statusBefore: string;
  obsPop: number;
  obsRank: string;
  e?: EstatCity;
  outcome: "一致→一次照合済に変更" | "一致（既に一次照合済）" | "人口が不一致" | "e-Statに無い";
};
const results: Result[] = [];

rows.forEach((row, i) => {
  if (row.year !== "2025") return;
  const e = byKey.get(`${row.pref_now}|${row.name_then}`);
  const obsPop = Number(row.pop);
  const base = {
    line: i + 2,
    name: row.name_then,
    pref: row.pref_now,
    statusBefore: row.status,
    obsPop,
    obsRank: row.rank,
    e,
  };
  if (!e) return results.push({ ...base, outcome: "e-Statに無い" });
  if (e.pop !== obsPop) return results.push({ ...base, outcome: "人口が不一致" });
  // 前回までの実行でこのスクリプトが変えた行（S2025_ESTAT）は、変えた行として数える（何度実行しても照合表が同じになるように）
  if (row.status === "一次照合済" && row.source_id === "S2025_ESTAT")
    return results.push({ ...base, outcome: "一致→一次照合済に変更" });
  if (row.status === "一次照合済") return results.push({ ...base, outcome: "一致（既に一次照合済）" });
  if (row.status === "二次のみ") {
    const note = `e-Stat 表1-1と一致（${CHECKED_ON}、照合前は${row.status}・${row.source_id}）`;
    row.status = "一次照合済";
    row.source_id = "S2025_ESTAT";
    row.note = row.note.trim() === "" ? note : `${row.note}。${note}`;
    return results.push({ ...base, outcome: "一致→一次照合済に変更" });
  }
  return results.push({ ...base, outcome: "一致（既に一次照合済）" });
});

// --- 2025年の行が無い柱に、表1-1 から足す ---
const has2025 = new Set(rows.filter((r) => r.year === "2025").map((r) => `${r.pref_now}|${r.name_then}`));
const added: string[] = [];
const notFound: string[] = [];
for (const e of loadEntities()) {
  if (e.merged_into) continue; // 吸収された柱は2025年に値が無くて当然
  if (e.names.some((n) => has2025.has(`${e.pref_now}|${n}`))) continue;
  const name = e.names[e.names.length - 1]; // 最後の名前を今の名前とみなす
  const c = byKey.get(`${e.pref_now}|${name}`);
  if (!c) {
    notFound.push(`${e.entity_id}（${e.pref_now} ${name}）`);
    continue;
  }
  const v: Record<string, string> = {
    year: "2025",
    rank: String(c.rank),
    name_then: c.name,
    pref_now: c.pref,
    pop: String(c.pop),
    source_id: "S2025_ESTAT",
    status: "一次照合済",
    note: `e-Stat 表1-1から追加（${CHECKED_ON}）。rankは表1-1の市と特別区部の中での順位`,
  };
  rows.push(Object.fromEntries(header.map((h) => [h, v[h] ?? ""])));
  has2025.add(`${c.pref}|${c.name}`);
  added.push(`${e.entity_id}: ${c.name} ${c.pop}（${c.rank}位）`);
}

writeCsv(PATHS.observations, header, rows);
if (added.length) console.log(`2025年の行が無かった柱に追加 ${added.length}：\n  ${added.join("\n  ")}`);
if (notFound.length) console.log(`表1-1 に見つからない柱 ${notFound.length}：${notFound.join("、")}`);

// --- 照合表 ---
const changed = results.filter((r) => r.outcome === "一致→一次照合済に変更");
const already = results.filter((r) => r.outcome === "一致（既に一次照合済）");
const mismatched = results.filter((r) => r.outcome === "人口が不一致" || r.outcome === "e-Statに無い");
const rankDiff = results.filter((r) => r.e && r.obsRank !== "" && Number(r.obsRank) !== r.e.rank);

const fmt = (n: number) => n.toLocaleString("en-US");
const lines: string[] = [
  "# 2025年 e-Stat 照合表（D5）",
  "",
  `照合日：${CHECKED_ON}　スクリプト：\`scripts/check-estat-2025.ts\`（\`pnpm data:check-2025\`）`,
  "",
  "- 照合先：令和7年国勢調査 人口等基本集計 表1-1（e-Stat、公開日 2026-09-29）",
  "- 原本：`data/raw/2025/b01_01.xlsx`",
  "- 比べた相手：表1-1 の市（地域識別コード 2）と 21大都市（同 1、政令市と特別区部）",
  "- 順位は、表1-1 の市と特別区部（" + estat.length + " 件）を人口の多い順に並べたもの",
  "",
  "## まとめ",
  "",
  `- 2025年の行：${results.length}`,
  `- 一致して「一次照合済」に変えた行：${changed.length}`,
  `- 一致した（もとから一次照合済）：${already.length}`,
  `- 一致しない、または e-Stat に無い：${mismatched.length}`,
  `- 順位が observations と違う：${rankDiff.length}`,
  "",
  "## 一致しない行",
  "",
];
if (mismatched.length === 0) lines.push("なし");
else {
  lines.push("| 行 | 都道府県 | 名前 | observations | e-Stat | 差 | 備考 |", "|---|---|---|---|---|---|---|");
  for (const r of mismatched)
    lines.push(
      `| ${r.line} | ${r.pref} | ${r.name} | ${fmt(r.obsPop)} | ${r.e ? fmt(r.e.pop) : "—"} | ${r.e ? fmt(r.e.pop - r.obsPop) : "—"} | ${r.outcome} |`,
    );
}
lines.push("", "## 順位が違う行", "");
if (rankDiff.length === 0) lines.push("なし");
else {
  lines.push("| 行 | 名前 | observations の rank | e-Stat の順位 |", "|---|---|---|---|");
  for (const r of rankDiff) lines.push(`| ${r.line} | ${r.name} | ${r.obsRank} | ${r.e!.rank} |`);
}
lines.push("", "## 全行", "", "| 行 | 都道府県 | 名前 | 人口 | rank（obs / e-Stat） | 照合前の status | 結果 |", "|---|---|---|---|---|---|---|");
for (const r of results)
  lines.push(
    `| ${r.line} | ${r.pref} | ${r.name} | ${fmt(r.obsPop)} | ${r.obsRank || "—"} / ${r.e?.rank ?? "—"} | ${r.statusBefore} | ${r.outcome} |`,
  );

mkdirSync(ROOT + "data/check", { recursive: true });
writeFileSync(REPORT, lines.join("\n") + "\n", "utf8");

console.log(`表1-1 の市と特別区部：${estat.length} 件`);
console.log(`2025年の行 ${results.length}：一次照合済に変更 ${changed.length}、もとから一次照合済 ${already.length}、不一致 ${mismatched.length}、順位違い ${rankDiff.length}`);
for (const r of mismatched) console.log(`  不一致 ${r.line}行目 ${r.pref} ${r.name}：obs ${r.obsPop} / e-Stat ${r.e?.pop ?? "なし"}`);
for (const r of rankDiff) console.log(`  順位違い ${r.line}行目 ${r.name}：obs ${r.obsRank} / e-Stat ${r.e!.rank}`);
console.log(`照合表：data/check/2025-estat.md`);
