// テスト用の仮データ public/data/dummy-cities.json を作る（TASKS.md T3）。
// 実データではない。画面で章送りやアニメーションを試すためだけに使う。
// 実行：pnpm data:dummy（先に pnpm data:build で cities.json を作っておく）
//
// 作り方
// - 「未収集」の年（observations に TOP_N 位以下の行が無い年）だけを埋める
// - 1886年と2025年の両方に実データがある柱だけ、2点のあいだを年に応じて比率で伸ばす
//     pop(y) = pop1886 × (pop2025 / pop1886) ^ ((y − 1886) / (2025 − 1886))
// - 実データがある柱と年は、実データをそのまま使う（仮の値で上書きしない）
// - 順位は、その年の実データと仮の値を合わせて人口の多い順に付け直す

import { readFileSync, writeFileSync } from "node:fs";
import { PATHS, ROOT, TOP_N, YEARS, collectedYears, loadObservations } from "./lib/data.ts";

type City = {
  id: string;
  pop: Record<string, number | null>;
};

const FIRST = 1886;
const LAST = 2025;
const OUT = ROOT + "public/data/dummy-cities.json";

const real = JSON.parse(readFileSync(PATHS.citiesJson, "utf8")) as { cities: City[] };
const collected = collectedYears(loadObservations());
const dummyYears = YEARS.filter((y) => !collected.has(y));

type DummyCity = { id: string; pop: Record<string, number>; rank: Record<string, number>; dummy: Record<string, true> };
const out = new Map<string, DummyCity>();
const get = (id: string) => {
  if (!out.has(id)) out.set(id, { id, pop: {}, rank: {}, dummy: {} });
  return out.get(id)!;
};

for (const year of dummyYears) {
  const y = String(year);
  const t = (year - FIRST) / (LAST - FIRST);
  const values: { id: string; pop: number }[] = [];
  for (const c of real.cities) {
    const actual = c.pop[y];
    if (actual != null && actual > 0) {
      values.push({ id: c.id, pop: actual }); // 実データを優先
      continue;
    }
    const a = c.pop[String(FIRST)];
    const b = c.pop[String(LAST)];
    if (a == null || b == null || a <= 0 || b <= 0) continue;
    const pop = Math.round(a * Math.pow(b / a, t));
    values.push({ id: c.id, pop });
    get(c.id).dummy[y] = true;
  }
  values.sort((p, q) => q.pop - p.pop);
  values.forEach((v, i) => {
    const d = get(v.id);
    d.pop[y] = v.pop;
    d.rank[y] = i + 1;
  });
}

const json = {
  note: "テスト用の仮データ。実データではない。scripts/build-dummy.ts が cities.json から作る",
  years: dummyYears,
  cities: [...out.values()],
};
writeFileSync(OUT, JSON.stringify(json, null, 2) + "\n", "utf8");

console.log(`dummy-cities.json を書きました：仮データの年 ${dummyYears.join("・")}`);
for (const year of dummyYears) {
  const y = String(year);
  const rows = [...out.values()].filter((d) => d.pop[y] != null);
  const fake = rows.filter((d) => d.dummy[y]).length;
  const top = rows.filter((d) => d.rank[y] <= TOP_N).length;
  console.log(`  ${year}: 値のある柱 ${rows.length}（うち仮の値 ${fake}）、${TOP_N}位以内 ${top}`);
}
