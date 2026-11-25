// 1990年と2010年の市の人口を observations.csv に入れる（2026-11-26 yyamaの指示で年を足す）。
// 実行：pnpm data:1990-2010
//
// - 原本：e-Stat 国勢調査 時系列データ 第6表「年齢（3区分），男女別人口及び年齢別割合 － 都道府県，市区町村（昭和55年～令和2年）」
//   を47都道府県分（data/raw/timeseries/t06_<statInfId>.xlsx。書き換えない）
//   年ごとにシートが分かれていて、市区町村はその年の境域のまま（たとえば1990年は浦和市・大宮市、2010年はさいたま市）
//   「不詳補完」のシートは使わない。列は 2＝「1990年」など、4＝5桁の地域コード、5＝名前、6＝人口の総数
// - 市と特別区部の行だけを使う（名前が「市」で終わるか「特別区部」。政令市の区の行は「区」で終わるので入らない）
// - 足す行：年ごとに、人口の多い順に上位40の市と、entities.csv の柱のうちその年にまだ吸収されていないもの（scripts/build-2000.ts と同じ）
//   rank は全国の市と特別区部の中での順位。status＝一次照合済（機械可読の一次資料の値そのもの）
// - 読み違いがないかを、2つの別の原本で確かめる。合わなければ止める
//   - 同じ表の2000年のシートが、observations.csv の2000年の行（平成12年 表1、S2000_ESTAT）と、市の数・人口・順位まで一致する
//   - 同じ表の2010年のシートが、平成22年 第1表（data/raw/2010/2010_t1_pop_municipalities.csv）の市と特別区部と全件一致する
// - 何度実行しても同じになるよう、先に source_id が S_CENSUS_TS_T06 の行を消してから足す
// - 照合表 data/check/1990-2010.md を書く

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseCsv, readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS, ROOT, loadEntities } from "./lib/data.ts";

const RAW = ROOT + "data/raw/timeseries/";
const CSV_2010 = ROOT + "data/raw/2010/2010_t1_pop_municipalities.csv";
const REPORT = ROOT + "data/check/1990-2010.md";
const SOURCE_ID = "S_CENSUS_TS_T06";
const YEARS_TO_ADD = [1990, 2010];
const TOP = 40;
const CHECKED_ON = "2026-11-26";

/** 地域コードの上2桁 → 都道府県 */
const PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split(" ");

type City = { year: number; pref: string; name: string; pop: number; code: string; file: string; rank?: number };

const cellText = (v: unknown): string => {
  if (v && typeof v === "object" && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  if (v && typeof v === "object" && "result" in v) return String((v as { result: unknown }).result);
  return String(v ?? "");
};

// --- 時系列 第6表を読む ---
const files = readdirSync(RAW).filter((f) => /^t06_\d+\.xlsx$/.test(f)).sort();
if (files.length !== 47) throw new Error(`時系列 第6表が ${files.length} 件（47 のはず）`);
const byYear = new Map<number, City[]>();
const prefsSeen = new Set<string>();
for (const f of files) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(RAW + f);
  for (const ws of wb.worksheets) {
    if (ws.name.includes("不詳補完")) continue;
    ws.eachRow((row) => {
      const v = row.values as unknown[];
      const year = Number(cellText(v[1]).match(/^(\d{4})年$/)?.[1]);
      const code = cellText(v[3]).trim();
      const name = cellText(v[4]).replace(/[\s　]+/g, "");
      if (!year || !/^\d{5}$/.test(code)) return;
      if (!(/市$/.test(name) || name === "特別区部")) return;
      const pop = Number(cellText(v[5]));
      if (!Number.isInteger(pop) || pop <= 0) throw new Error(`${f} ${ws.name} ${name}：人口が読めません（${cellText(v[5])}）`);
      const pref = PREFS[Number(code.slice(0, 2)) - 1];
      if (!pref) throw new Error(`${f} ${name}：地域コード ${code} の都道府県が分かりません`);
      prefsSeen.add(pref);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push({ year, pref, name, pop, code, file: f });
    });
  }
}
if (prefsSeen.size !== 47) throw new Error(`都道府県が ${prefsSeen.size} 件（47 のはず）`);
for (const [year, list] of byYear) {
  const codes = new Set(list.map((c) => c.code));
  if (codes.size !== list.length) throw new Error(`${year}年：同じ地域コードが2回出てくる`);
  list.sort((a, b) => b.pop - a.pop).forEach((c, i) => (c.rank = i + 1));
}
const yearList = (y: number) => {
  const l = byYear.get(y);
  if (!l) throw new Error(`時系列 第6表に ${y} 年のシートがありません`);
  return l;
};

// --- 確かめる1：2000年のシートと observations.csv の2000年の行（平成12年 表1） ---
const obs = readCsv(PATHS.observations);
const obs2000 = obs.filter((r) => r.year === "2000" && r.source_id === "S2000_ESTAT");
const ts2000 = new Map(yearList(2000).map((c) => [`${c.pref}|${c.name}`, c]));
const EXPECTED_2000 = 672; // scripts/build-2000.ts と同じ
if (ts2000.size !== EXPECTED_2000) throw new Error(`2000年：市と特別区部が ${ts2000.size} 件（平成12年 表1 では ${EXPECTED_2000}）`);
for (const r of obs2000) {
  const c = ts2000.get(`${r.pref_now}|${r.name_then}`);
  if (!c) throw new Error(`2000年：${r.pref_now} ${r.name_then} が時系列の表にありません`);
  if (String(c.pop) !== r.pop || String(c.rank) !== r.rank)
    throw new Error(`2000年：${r.name_then} が合いません（時系列 ${c.pop}・${c.rank}位、表1 ${r.pop}・${r.rank}位）`);
}

// --- 確かめる2：2010年のシートと平成22年 第1表（CSV） ---
// 列：0 行番号、2 地域コード、3 地域識別コード（1＝政令市、2＝市、0＝区、3＝町村、9＝2000年の旧市町村 など）、6 名前、7 人口
const csv2010 = parseCsv("no,top,code,kind,b2010,b2000,name,pop\n" + new TextDecoder("shift_jis").decode(readFileSync(CSV_2010)).split(/\r?\n/).slice(10).join("\n"));
const t1 = csv2010.filter((r) => r.kind === "1" || r.kind === "2" || /^(東京都 )?特別区部$/.test(r.name.trim()));
const t1ByCode = new Map(t1.map((r) => [r.code, r]));
const ts2010 = yearList(2010);
if (t1ByCode.size !== ts2010.length) throw new Error(`2010年：時系列 ${ts2010.length} 件、第1表 ${t1ByCode.size} 件`);
for (const c of ts2010) {
  const r = t1ByCode.get(c.code);
  if (!r) throw new Error(`2010年：${c.pref} ${c.name}（${c.code}）が第1表にありません`);
  if (Number(r.pop) !== c.pop) throw new Error(`2010年：${c.name} が合いません（時系列 ${c.pop}、第1表 ${r.pop}）`);
}

// --- 足す行を決める ---
const entities = loadEntities();
type Add = { c: City; why: string; entity?: string };
const adds: Add[] = [];
const noValue: string[] = [];
for (const year of YEARS_TO_ADD) {
  const list = yearList(year);
  const byKey = new Map(list.map((c) => [`${c.pref}|${c.name}`, c]));
  const add = new Map<string, Add>();
  for (const c of list.slice(0, TOP)) add.set(`${c.pref}|${c.name}`, { c, why: `上位${TOP}` });
  for (const e of entities) {
    if (e.merged_into && e.merged_year !== null && e.merged_year <= year) continue;
    const hit = e.names.map((n) => byKey.get(`${e.pref_now}|${n}`)).find(Boolean);
    if (!hit) {
      noValue.push(`${year}年：${e.entity_id}（${e.names.join("・")}）`);
      continue;
    }
    const key = `${hit.pref}|${hit.name}`;
    const cur = add.get(key);
    add.set(key, { c: hit, why: cur ? `${cur.why}・柱` : "柱", entity: e.entity_id });
  }
  adds.push(...[...add.values()].sort((a, b) => a.c.rank! - b.c.rank!));
}

// --- observations.csv に書く ---
const header = Object.keys(obs[0]);
const kept = obs.filter((r) => r.source_id !== SOURCE_ID);
const removed = obs.length - kept.length;
for (const { c } of adds) {
  const v: Record<string, string> = {
    year: String(c.year),
    rank: String(c.rank),
    name_then: c.name,
    pref_now: c.pref,
    pop: String(c.pop),
    source_id: SOURCE_ID,
    status: "一次照合済",
    note: `e-Stat 国勢調査 時系列データ 第6表（${c.file}、${c.year}年のシート、地域コード ${c.code}）から（${CHECKED_ON}）。rankは全国の市と特別区部（${yearList(c.year).length}）の中での順位`,
  };
  kept.push(Object.fromEntries(header.map((h) => [h, v[h] ?? ""])));
}
writeCsv(PATHS.observations, header, kept);

// --- 照合表 ---
const fmt = (n: number) => n.toLocaleString("en-US");
const L = [
  "# 1990年・2010年 照合表",
  "",
  `作成：${CHECKED_ON}　スクリプト：\`scripts/build-timeseries.ts\`（\`pnpm data:1990-2010\`）`,
  "",
  "- 原本：e-Stat 国勢調査 時系列データ 第6表「年齢（3区分），男女別人口及び年齢別割合 － 都道府県，市区町村（昭和55年～令和2年）」（47都道府県、`data/raw/timeseries/t06_<statInfId>.xlsx`）。市区町村は各年の境域のまま",
  "- 機械で読める一次資料の値をそのまま入れたので status は「一次照合済」",
  "- 読み違いがないことを、次の2つで確かめた（スクリプトが毎回確かめ、合わなければ止まる）",
  `  - 同じ表の2000年のシート：市と特別区部が ${EXPECTED_2000} 件で、observations.csv の2000年の ${obs2000.length} 行（平成12年 表1）と人口・順位が全部一致`,
  `  - 同じ表の2010年のシート：平成22年国勢調査 第1表（\`data/raw/2010/2010_t1_pop_municipalities.csv\`）の市と特別区部 ${t1ByCode.size} 件と、地域コードと人口が全部一致`,
  ...YEARS_TO_ADD.map((y) => `- ${y}年：市と特別区部 ${yearList(y).length} 件。人口の合計 ${fmt(yearList(y).reduce((a, c) => a + c.pop, 0))}`),
  "",
];
for (const year of YEARS_TO_ADD) {
  const rows = adds.filter((a) => a.c.year === year);
  L.push(
    `## ${year}年に足した行（${rows.length} 行）`,
    "",
    "| rank | 都道府県 | 名前 | 人口 | 足した理由 | 柱 |",
    "|---|---|---|---|---|---|",
    ...rows.map(({ c, why, entity }) => `| ${c.rank} | ${c.pref} | ${c.name} | ${fmt(c.pop)} | ${why} | ${entity ?? "—"} |`),
    "",
  );
}
L.push("## 値が見つからない柱（その年に市でなかったもの）", "", noValue.length ? noValue.map((s) => `- ${s}`).join("\n") : "なし");
writeFileSync(REPORT, L.join("\n") + "\n", "utf8");

for (const year of YEARS_TO_ADD)
  console.log(`${year}年：市と特別区部 ${yearList(year).length} 件。observations に ${adds.filter((a) => a.c.year === year).length} 行`);
console.log(`前回の ${removed} 行を置き換え`);
console.log(`確かめたこと：2000年のシートが平成12年 表1 の ${obs2000.length} 行と一致。2010年のシートが平成22年 第1表の ${t1ByCode.size} 件と一致`);
if (noValue.length) console.log(`値が見つからない柱：${noValue.join("、")}`);
console.log("照合表：data/check/1990-2010.md");
