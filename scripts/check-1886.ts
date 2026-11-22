// D4：1886年の照合表 data/check/1886.md を作る。observations.csv は書き換えない。
// 実行：pnpm data:check-1886
//
// 原表の読み取りは scripts/lib/table-1886.ts。
// 比べる相手は、原表で入れ直す前の observations.csv（コミット 985e8e2 の版を git から読む）。何度実行しても同じ照合表になる

import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseCsv } from "./lib/csv.ts";
import { ROOT, loadEntities } from "./lib/data.ts";
import { FOOTNOTE, TOTAL, byName1886 as byName, rows1886 as rows, sumH, sumP, type Row1886 as Row } from "./lib/table-1886.ts";

const REPORT = ROOT + "data/check/1886.md";
/** TASKS.md D4 の候補と、ほかに資料の間で値が違っていたもの */
const CANDIDATES = ["前橋", "八幡", "松山", "高知", "那覇", "銚子", "盛岡", "秋田", "米沢", "鳥取", "青森", "新潟", "首里"];


// --- 入れ直す前の observations.csv の1886年 ---
const BEFORE = "985e8e2";
let before: string;
try {
  before = execFileSync("git", ["show", `${BEFORE}:data/observations.csv`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  // 公開用リポジトリは履歴を引き継いでいないので、入れ直す前の版が無い。照合表 data/check/1886.md は作成済み
  throw new Error(`コミット ${BEFORE}（入れ直す前の observations.csv）がこのリポジトリにありません。照合表 data/check/1886.md は作成済みなので、作り直す必要はありません`);
}
const obs = parseCsv(before).filter((o) => o.year === "1886");
const entities = loadEntities();
const entityOf = (pref: string, name: string) =>
  entities.find((e) => e.pref_now === pref && e.names.some((n) => n === name || n === `${name}町` || n === `${name}区` || n === `${name}市`))?.entity_id;

const soranAgree = obs.filter((o) => o.source_id === "S1886_SORAN" && byName.get(`${o.pref_now}|${o.name_then}`)?.pop === Number(o.pop)).length;
const fmt = (n: number | string) => (n === "" ? "—" : Number(n).toLocaleString("en-US"));
const verdict = (o: Record<string, string>, r: Row | undefined) => {
  if (!r) return "表に無い";
  return Number(o.pop) === r.pop ? "一致" : `不一致（差 ${(Number(o.pop) - r.pop).toLocaleString("en-US")}）`;
};

// --- 照合表 ---
const L: string[] = [
  "# 1886年 照合表（D4）",
  "",
  "作成：2026-11-22　スクリプト：`scripts/check-1886.ts`（`pnpm data:check-1886`）　「今の observations.csv」は原表で入れ直す前（コミット 985e8e2）の値",
  "",
  "## 原本",
  "",
  "- 第7回（明治21年）『日本帝国統計年鑑』第24表「一萬人以上住居スル市街ノ戸數及人口」**明治十九年十二月三十一日調**（source_id：S1886_YB07_T24）",
  "- 画像：`data/raw/1886/yb07_043.jpg`（44〜45ページ）・`yb07_044.jpg`（46〜47ページ）。一橋大学経済研究所「日本統計年鑑・帝国統計年鑑」データベース",
  `- 1万人以上の市街 ${rows.length} 件を、画像を拡大して1件ずつ読んだ。戸数の合計 ${fmt(sumH)}、人口の合計 ${fmt(sumP)} が、表の総計（${fmt(TOTAL.households)}戸・${fmt(TOTAL.pop)}人）と一致する`,
  "- 表は45〜46ページが人口の多い順。47ページの12件（大垣〜渡島福山）だけ順番が外れているので、人口で並べ直して順位を付けた",
  "- 欄外の注記：「表中高知山形新庄ノ如キ平均ノ疑ハシキモノアレドモ姑ク原書ノ儘ヲ記ス」（1戸あたりの人数が疑わしいが、元の資料のまま載せた）。高知は 2.91人、山形は 6.17人、新庄は 6.43人",
  `- 国勢総覧（S1886_SORAN）の転記47件のうち ${soranAgree} 件が、この表と同じ値`,
  "",
  "## 疑義の結論",
  "",
  "| 候補 | 原表 | 今の observations.csv | 結論 |",
  "|---|---|---|---|",
];
const conclusion: Record<string, string> = {
  前橋: "原表は 16,585 で uub.jp と一致。国勢総覧の転記 32,531 は誤り。上位30には入らない",
  八幡: "1万人以上の市街117件の中に八幡は無い。国勢総覧の転記の 29,487 は松山の値",
  松山: "uub.jp と一致。国勢総覧の転記では、この値が八幡になっていた",
  高知: "uub.jp と一致。国勢総覧の転記から抜けていた。1戸あたりの人数に欄外の注記あり（値は原表のまま）",
  那覇: "uub.jp と一致。国勢総覧の転記から抜けていた",
  銚子: "uub.jp と一致。国勢総覧の転記から抜けていた",
  盛岡: "一致",
  秋田: "一致",
  米沢: "一致",
  鳥取: "一致",
  青森: "1万人以上の表に載っている。国勢総覧が「原則2万人以上」の中に入れた理由は不明だが、値は一致",
  新潟: "uub.jp と一致。国勢総覧の転記（40,776）は 2 少ない",
  首里: "uub.jp と一致。国勢総覧の転記（25,581）は 6 少ない",
};
for (const c of CANDIDATES) {
  const r = rows.find((x) => x.name === c);
  const os = obs.filter((o) => o.name_then === c);
  const cur = os.length ? os.map((o) => `${fmt(o.pop)}（${o.source_id}、${o.status}）`).join("<br>") : "—";
  L.push(`| ${c} | ${r ? `${fmt(r.pop)}（${r.rank}位）` : "無い"} | ${cur} | ${conclusion[c] ?? ""} |`);
}

L.push(
  "",
  "## observations.csv の1886年の行と原表",
  "",
  "| rank（今） | 名前 | 人口（今） | source_id | status（今） | 原表の順位 | 原表の人口 | 照合 |",
  "|---|---|---|---|---|---|---|---|",
);
let agree = 0;
for (const o of obs) {
  const r = byName.get(`${o.pref_now}|${o.name_then}`);
  const v = verdict(o, r);
  if (v === "一致") agree++;
  L.push(`| ${o.rank || "—"} | ${o.name_then} | ${fmt(o.pop)} | ${o.source_id} | ${o.status} | ${r ? r.rank : "—"} | ${r ? fmt(r.pop) : "—"} | ${v} |`);
}
L.push("", `${obs.length} 行のうち ${agree} 行が原表と一致。`);

L.push(
  "",
  "## 原表の上位50（順位は原表の人口順）",
  "",
  "原表どおりに並べたときの上位30が、1886年のコマの柱になる案。「柱」は entities.csv で当たる柱（— は柱が無い）。「observations」は今の行の有無",
  "",
  "| 順位 | 表の名前 | 今の都道府県 | 戸数 | 人口 | 柱 | observations | 備考 |",
  "|---|---|---|---|---|---|---|---|",
);
for (const r of [...rows].sort((a, b) => a.rank - b.rank).slice(0, 50)) {
  const os = obs.filter((o) => o.pref_now === r.pref && o.name_then === r.name);
  const has = os.length ? os.map((o) => `${o.source_id} ${o.status}${Number(o.pop) === r.pop ? "（一致）" : `（${fmt(o.pop)}）`}`).join("<br>") : "無い";
  const notes: string[] = [];
  if (FOOTNOTE.has(r.name)) notes.push("欄外の注記（1戸あたりの人数が疑わしい）");
  if (r.page === 47) notes.push("47ページ（順番の外れた12件）");
  L.push(`| ${r.rank} | ${r.label} | ${r.pref} | ${fmt(r.households)} | ${fmt(r.pop)} | ${entityOf(r.pref, r.name) ?? "—"} | ${has} | ${notes.join("。")} |`);
}

L.push(
  "",
  "## 原表の51位以下",
  "",
  [...rows]
    .sort((a, b) => a.rank - b.rank)
    .slice(50)
    .map((r) => `${r.rank} ${r.name} ${fmt(r.pop)}`)
    .join("、"),
  "",
  "## 札幌",
  "",
  `原表は ${fmt(byName.get("北海道|札幌")!.pop)}（${byName.get("北海道|札幌")!.rank}位）。observations.csv の札幌（S_SAPPORO_STAT、札幌市統計書）は ${fmt(obs.find((o) => o.name_then === "札幌")?.pop ?? "")}。札幌市統計書も12月31日現在の公簿調査（同日に中島公園の区域を編入）。差の理由は分からない`,
);
writeFileSync(REPORT, L.join("\n") + "\n", "utf8");
console.log(`原表 ${rows.length} 件：戸数 ${sumH}・人口 ${sumP} が総計と一致`);
console.log(`observations.csv 1886年 ${obs.length} 行のうち ${agree} 行が原表と一致`);
console.log("照合表：data/check/1886.md");
