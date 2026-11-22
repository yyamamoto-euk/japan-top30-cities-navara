// 年ごとの上位30と入れ替わりを確かめる。画面と同じ計算（src/stack.ts・src/changes.ts）をそのまま使う。
// 実行：pnpm data:check-frames（先に pnpm data:build）
//
// 年ごとに出すもの：上位30の本数、1位と2位、29〜31位、入った柱と外れた柱（本数と名前）。
// 町を積んだ年（1925年）は、積んだあとで付け直した順位（stack.ts の rerank）。1〜30位がちょうど1つずつでなければ、そのことも出す

import { readFileSync } from "node:fs";
import type { CitiesData, YearValue } from "../src/cities.ts";
import { valuesForYear } from "../src/cities.ts";
import { topChanges } from "../src/changes.ts";
import { TOP_N } from "../src/constants.ts";
import { FRAMES } from "../src/frames.ts";
import { checkTopRanks, stackTowns } from "../src/stack.ts";
import { PATHS } from "./lib/data.ts";

const data = JSON.parse(readFileSync(PATHS.citiesJson, "utf8")) as CitiesData;
const byId = new Map(data.cities.map((c) => [c.id, c]));
/** その年の名前（無ければ id） */
const nameOf = (id: string, year: number) => byId.get(id)?.name[String(year)] ?? id;

let prev: Map<string, YearValue> | null = null;
let problems = 0;
for (const f of FRAMES) {
  const { values, stacked } = stackTowns(data.cities, valuesForYear(data, null, f.year), f.year, f.stackInto ?? []);
  const byRank = new Map<number, string[]>();
  for (const [id, v] of values) if (v.rank != null) byRank.set(v.rank, [...(byRank.get(v.rank) ?? []), id]);
  const at = (r: number) => (byRank.get(r) ?? []).map((id) => `${nameOf(id, f.year)}（${values.get(id)!.pop.toLocaleString("ja-JP")}）`).join("・") || "（無し）";
  const top = [...values.values()].filter((v) => v.rank != null && v.rank <= TOP_N).length;

  const changes = topChanges(data.cities, prev, values, f.year, TOP_N);
  const list = (k: "in" | "out") => [...changes].filter(([, c]) => c === k).map(([id]) => nameOf(id, f.year));
  const ins = list("in");
  const outs = list("out");

  console.log(`■ ${f.year}年${stacked.size > 0 ? `（${[...stacked.keys()].map((id) => nameOf(id, f.year)).join("・")}を積んだあと）` : ""}`);
  console.log(`  上位${TOP_N}：${top}本`);
  console.log(`  1位 ${at(1)}、2位 ${at(2)}`);
  console.log(`  29位 ${at(29)}、30位 ${at(30)}、31位 ${at(31)}`);
  if (prev) console.log(`  入った ${ins.length}本（${ins.join("・")}）、外れた ${outs.length}本（${outs.join("・")}）`);
  else console.log("  入れ替わり：比べる年が無い");
  const problem = checkTopRanks(values, TOP_N);
  if (problem || top !== TOP_N) {
    problems++;
    console.log(`  ！ 順位が崩れている：${problem ?? `上位${TOP_N}が${top}本`}`);
  }
  prev = values;
}
console.log("");
console.log(problems === 0 ? `どの年も、1〜${TOP_N}位がちょうど1つずつある` : `順位が崩れている年が ${problems} 年ある`);
if (problems > 0) process.exitCode = 1;
