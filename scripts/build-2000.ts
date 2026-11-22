// D6：2000年（平成12年国勢調査）の市の人口を observations.csv に入れる。
// 実行：pnpm data:2000
//
// - 原本：data/raw/2000/t01_prefNN.xls（e-Stat、第1次基本集計 都道府県結果 表1「人口，人口増減（平成7年～12年），
//   面積及び人口密度－都道府県※，市部※，郡部※，市町村※」を47都道府県分。書き換えない）
// - .xls は scripts/lib/xls.ts で data/work/2000/*.tsv にしてから読む（Windows の Excel を使う）
// - 市と特別区部の行だけを使う。「DIDs」（人口集中地区）の行と、政令市の区の行は使わない
//   表は都道府県ごとに列の位置がずれているので、「3桁の市町村コード → 名前 → 英語名 → 平成12年の人口」の並びで読む
// - 足す行：人口の多い順に上位40の市と、entities.csv の柱のうち2000年にまだ吸収されていないもの
//   rank は全国の市と特別区部（672）の中での順位。status＝一次照合済（機械可読の一次資料の値そのもの）
// - 何度実行しても同じになるよう、先に source_id が S2000_ESTAT の2000年の行を消してから足す
// - 照合表 data/check/2000.md を書く

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS, ROOT, loadEntities } from "./lib/data.ts";
import { xlsToTsv } from "./lib/xls.ts";

const RAW = ROOT + "data/raw/2000/";
const WORK = ROOT + "data/work/2000/";
const REPORT = ROOT + "data/check/2000.md";
const SOURCE_ID = "S2000_ESTAT";
const TOP = 40;
const CHECKED_ON = "2026-11-22";
/** 2000年の市の数（671）＋特別区部。表の読み違いを見つけるために使う */
const EXPECTED_CITIES = 672;

const converted = xlsToTsv(RAW, WORK);
if (converted) console.log(`.xls を TSV にしました：${converted} 件`);

type City = { pref: string; name: string; pop: number; code: string; file: string; rank?: number };
const jp = /[぀-ヿ一-鿿]/;
const cities: City[] = [];
const files = readdirSync(WORK).filter((f) => f.endsWith(".tsv")).sort();
if (files.length !== 47) throw new Error(`TSV が ${files.length} 件（47 のはず）`);
for (const f of files) {
  const lines = readFileSync(WORK + f, "utf8").split(/\r?\n/).map((l) => l.split("\t").map((x) => x.trim()));
  let pref = "";
  for (const c of lines) {
    if (!pref) {
      const p = c.find((x) => /^(北海道|東京都|大阪府|京都府|.+県)$/.test(x));
      if (p) pref = p;
    }
    const j = c.findIndex((x, i) => /^\d{3}$/.test(x) && jp.test(c[i + 1] ?? ""));
    if (j < 0) continue;
    const name = c[j + 1].replace(/[\s　]+/g, "");
    const k = c.findIndex((x, i) => i > j + 1 && /^[A-Za-z]/.test(x));
    if (k < 0 || c[k] === "DIDs") continue;
    const mc = Number(c[j]);
    // 100〜199：政令市（○○市）と特別区部。区の行（○○区）は使わない。201〜299：市
    const isCity = (mc >= 100 && mc <= 199 && /(市|特別区部)$/.test(name)) || (mc >= 201 && mc <= 299);
    if (!isCity) continue;
    const pop = Number(c[k + 1]);
    if (!Number.isInteger(pop) || pop <= 0) throw new Error(`${f} ${name}：人口が読めません（${c[k + 1]}）`);
    cities.push({ pref, name, pop, code: c[j], file: f });
  }
  if (!pref) throw new Error(`${f}：都道府県名が見つかりません`);
}
if (cities.length !== EXPECTED_CITIES) throw new Error(`市と特別区部が ${cities.length} 件（${EXPECTED_CITIES} のはず）`);
cities.sort((a, b) => b.pop - a.pop).forEach((c, i) => (c.rank = i + 1));
const byKey = new Map(cities.map((c) => [`${c.pref}|${c.name}`, c]));

// --- 足す行を決める ---
const entities = loadEntities();
const add = new Map<string, { c: City; why: string; entity?: string }>();
for (const c of cities.slice(0, TOP)) add.set(`${c.pref}|${c.name}`, { c, why: `上位${TOP}` });
const noValue: string[] = [];
for (const e of entities) {
  if (e.merged_into && e.merged_year !== null && e.merged_year <= 2000) continue;
  const hit = e.names.map((n) => byKey.get(`${e.pref_now}|${n}`)).find(Boolean);
  if (!hit) {
    noValue.push(`${e.entity_id}（${e.names.join("・")}）`);
    continue;
  }
  const key = `${hit.pref}|${hit.name}`;
  const cur = add.get(key);
  add.set(key, { c: hit, why: cur ? `${cur.why}・柱` : "柱", entity: e.entity_id });
}

// --- observations.csv に書く ---
const rows = readCsv(PATHS.observations);
const header = Object.keys(rows[0]);
const kept = rows.filter((r) => !(r.year === "2000" && r.source_id === SOURCE_ID));
const removed = rows.length - kept.length;
const added = [...add.values()].sort((a, b) => a.c.rank! - b.c.rank!);
for (const { c } of added) {
  const v: Record<string, string> = {
    year: "2000",
    rank: String(c.rank),
    name_then: c.name,
    pref_now: c.pref,
    pop: String(c.pop),
    source_id: SOURCE_ID,
    status: "一次照合済",
    note: `e-Stat 平成12年国勢調査 都道府県結果 表1（${c.file.replace(".tsv", ".xls")}、市町村コード ${c.code}）から（${CHECKED_ON}）。rankは全国の市と特別区部（${EXPECTED_CITIES}）の中での順位`,
  };
  kept.push(Object.fromEntries(header.map((h) => [h, v[h] ?? ""])));
}
writeCsv(PATHS.observations, header, kept);

// --- 照合表 ---
const fmt = (n: number) => n.toLocaleString("en-US");
const L = [
  "# 2000年 照合表（D6）",
  "",
  `作成：${CHECKED_ON}　スクリプト：\`scripts/build-2000.ts\`（\`pnpm data:2000\`）`,
  "",
  "- 原本：e-Stat 平成12年国勢調査 第1次基本集計 都道府県結果 表1「人口，人口増減（平成7年～12年），面積及び人口密度」（47都道府県、`data/raw/2000/t01_prefNN.xls`）",
  "- 機械で読める一次資料の値をそのまま入れたので status は「一次照合済」。目での照合は要らない見込み",
  `- 市と特別区部 ${cities.length} 件を人口の多い順に並べて rank を付けた（政令市の区、人口集中地区の行は使わない）`,
  `- 全国の市と特別区部の人口の合計：${fmt(cities.reduce((a, c) => a + c.pop, 0))}`,
  "- 2000年の市町村は合併前。たとえば浦和市・大宮市・与野市は2001年にさいたま市になる前、静岡市と清水市も別",
  "",
  `## 足した行（${added.length} 行）`,
  "",
  "| rank | 都道府県 | 名前 | 人口 | 足した理由 | 柱 |",
  "|---|---|---|---|---|---|",
  ...added.map(({ c, why, entity }) => `| ${c.rank} | ${c.pref} | ${c.name} | ${fmt(c.pop)} | ${why} | ${entity ?? "—"} |`),
  "",
  "## 2000年に値が見つからない柱",
  "",
  noValue.length ? noValue.map((s) => `- ${s}`).join("\n") : "なし",
];
writeFileSync(REPORT, L.join("\n") + "\n", "utf8");

console.log(`2000年：市と特別区部 ${cities.length} 件。observations に ${added.length} 行（前回の ${removed} 行を置き換え）`);
if (noValue.length) console.log(`2000年に値が見つからない柱：${noValue.join("、")}`);
console.log("照合表：data/check/2000.md");
