// T5：spot-check。コマ（年）ごとに、画面でラベルの付く柱（上位30）からランダムに5本選び、
// 画面に出る値（cities.json）と、もとの observations.csv の行（出典・status・ページの入った note）を並べる。
// 実行：pnpm data:spot-check            （毎回ちがう5本）
//       pnpm data:spot-check --seed 42  （同じ seed なら同じ5本）
// 出力：コンソールと data/check/spot-check.md
//
// - 画面の値は、アプリと同じ処理で作る（src/cities.ts の valuesForYear と src/stack.ts の stackTowns、表示の形は src/format.ts）。
//   1925年の東京のように町を積んだ柱は、積んだ町の行も並べる
// - ★ は cities.json が採用した行（CLAUDE.md の採用順で選ばれた行）
// - 先に pnpm data:build で cities.json を作っておく

import { readFileSync, writeFileSync } from "node:fs";
import { FRAMES } from "../src/frames.ts";
import type { CitiesData } from "../src/cities.ts";
import { valuesForYear } from "../src/cities.ts";
import { formatPopulation } from "../src/format.ts";
import { stackTowns } from "../src/stack.ts";
import { readCsv } from "./lib/csv.ts";
import { PATHS, ROOT, TOP_N, buildEntityIndex, entityKey, loadEntities, loadObservations } from "./lib/data.ts";

const PER_FRAME = 5;
const REPORT = ROOT + "data/check/spot-check.md";

// --- seed（指定が無ければ時刻から） ---
const seedArg = process.argv.indexOf("--seed");
const seed = seedArg >= 0 ? Number(process.argv[seedArg + 1]) : Date.now() % 1_000_000;
if (!Number.isInteger(seed)) throw new Error("--seed には整数を指定してください");
/** 再現できる乱数（mulberry32） */
let state = seed >>> 0;
const random = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function pick<T>(list: T[], n: number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// --- データ ---
const data = JSON.parse(readFileSync(PATHS.citiesJson, "utf8")) as CitiesData;
const byId = new Map(data.cities.map((c) => [c.id, c]));
const { index } = buildEntityIndex(loadEntities());
const observations = loadObservations();
const sources = new Map(readCsv(PATHS.sources).map((s) => [s.source_id, s.title]));
const rowsFor = (id: string, year: number) => observations.filter((o) => o.year === year && index.get(entityKey(o)) === id);

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const cell = (s: string) => s.replace(/\|/g, "／").replace(/\r?\n/g, " ");

const md: string[] = [
  "# spot-check（T5）",
  "",
  `作成：${new Date().toISOString().slice(0, 10)}　スクリプト：\`scripts/spot-check.ts\`（\`pnpm data:spot-check --seed ${seed}\` で同じ5本を出せる）`,
  "",
  `- コマごとに、画面でラベルの付く柱（上位${TOP_N}）からランダムに${PER_FRAME}本`,
  "- 「画面」は柱のラベルに出る値。★ は cities.json が採用した行",
  "",
];
const out: string[] = [`spot-check（seed ${seed}）`];

for (const f of FRAMES) {
  const { values, stacked } = stackTowns(data.cities, valuesForYear(data, null, f.year), f.year, f.stackInto ?? []);
  const shown = [...values].filter(([, v]) => v.rank !== null && v.rank <= TOP_N).sort((a, b) => a[1].rank! - b[1].rank!);
  const chosen = pick(shown, PER_FRAME).sort((a, b) => a[1].rank! - b[1].rank!);
  const y = String(f.year);
  md.push(`## ${f.year}年（${f.era}）`, "", "| 柱 | 画面 | 人口 | rank | 行 | 出典 | status | 行の人口 | note |", "|---|---|---|---|---|---|---|---|---|");
  out.push("", `■ ${f.year}年（${f.era}）`);
  for (const [id, v] of chosen) {
    const c = byId.get(id)!;
    const towns = [...stacked].filter(([, into]) => into === id).map(([town]) => town);
    const label = formatPopulation(v.pop);
    const head = `${c.name[y]}（${id}）`;
    const lines: string[] = [];
    out.push(`  ${head}　画面 ${label}　人口 ${fmt(v.pop)}　rank ${v.rank}${towns.length ? `　（積んだ町：${towns.map((t) => byId.get(t)!.name[y]).join("・")}）` : ""}`);
    for (const part of [id, ...towns]) {
      const pc = byId.get(part)!;
      for (const o of rowsFor(part, f.year)) {
        const adopted = o.source_id === pc.source[y] && o.pop === pc.pop[y] && o.status === pc.status[y];
        const mark = adopted ? "★" : "　";
        out.push(`    ${mark} ${o.line}行目 ${o.name_then} ${fmt(o.pop)}　${o.source_id}（${sources.get(o.source_id) ?? "sources.csv に無い"}）　${o.status}`);
        out.push(`        note：${o.note || "—"}`);
        lines.push(
          `| ${lines.length === 0 ? head : ""} | ${lines.length === 0 ? label : ""} | ${lines.length === 0 ? fmt(v.pop) : ""} | ${lines.length === 0 ? v.rank : ""} | ${mark}${o.line}（${cell(o.name_then)}） | ${o.source_id}：${cell(sources.get(o.source_id) ?? "sources.csv に無い")} | ${o.status} | ${fmt(o.pop)} | ${cell(o.note || "—")} |`,
        );
      }
    }
    if (lines.length === 0) lines.push(`| ${head} | ${label} | ${fmt(v.pop)} | ${v.rank} | — | observations.csv に行が無い | | | |`);
    md.push(...lines);
  }
  md.push("");
}

writeFileSync(REPORT, md.join("\n") + "\n", "utf8");
console.log(out.join("\n"));
console.log(`\n一覧：data/check/spot-check.md（seed ${seed}）`);
