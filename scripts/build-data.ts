// observations.csv と entities.csv から public/data/cities.json を作る。
// 同じ年・同じ柱に複数行あるときは CLAUDE.md の採用順に従い、「矛盾あり」は入れない。
// 実行：pnpm data:build

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readCsv } from "./lib/csv.ts";
import {
  PATHS,
  YEARS,
  adopt,
  buildEntityIndex,
  loadEntities,
  loadObservations,
} from "./lib/data.ts";

type YearMap<T> = Record<string, T>;

type City = {
  id: string;
  pref: string;
  lon: number | null;
  lat: number | null;
  merged_into: string | null;
  merged_year: number | null;
  name: YearMap<string>;
  /** 今の名前（ラベルの（）に出す）。最後の年（2025）の名前。吸収された柱は吸収先の名前をたどる */
  name_now: string | null;
  pop: YearMap<number | null>;
  rank: YearMap<number | null>;
  status: YearMap<string>;
  source: YearMap<string>;
  note: YearMap<string>;
};

const entities = loadEntities();
const observations = loadObservations();
const { index, duplicates } = buildEntityIndex(entities);
if (duplicates.length > 0) {
  console.error("entities.csv で同じ名前が複数の柱に当たっています:\n  " + duplicates.join("\n  "));
  process.exit(1);
}

const { adopted, unmatched } = adopt(observations, index);
if (unmatched.length > 0) {
  console.error(
    "entities.csv のどの柱にも当たらない行があります（pnpm data:validate で詳細）:\n  " +
      unmatched.map((o) => `${o.line}行目 ${o.year} ${o.pref_now} ${o.name_then}`).join("\n  "),
  );
  process.exit(1);
}

const numOrNull = (n: number | null) => (n === null || Number.isNaN(n) ? null : n);

const cities: City[] = entities.map((e) => {
  const city: City = {
    id: e.entity_id,
    pref: e.pref_now,
    lon: numOrNull(e.lon),
    lat: numOrNull(e.lat),
    merged_into: e.merged_into,
    merged_year: numOrNull(e.merged_year),
    name: {},
    name_now: null,
    pop: {},
    rank: {},
    status: {},
    source: {},
    note: {},
  };
  const byYear = adopted.get(e.entity_id);
  for (const year of YEARS) {
    const o = byYear?.get(year);
    if (!o) continue;
    const y = String(year);
    city.name[y] = o.name_then;
    city.pop[y] = numOrNull(o.pop);
    city.rank[y] = numOrNull(o.rank);
    city.status[y] = o.status;
    city.source[y] = o.source_id;
    if (o.note.trim() !== "") city.note[y] = o.note.trim();
  }
  return city;
});

// 今の名前：最後の年の名前。吸収された柱は吸収先をたどる
const LAST = String(YEARS[YEARS.length - 1]);
const cityById = new Map(cities.map((c) => [c.id, c]));
for (const c of cities) {
  let x: City | undefined = c;
  const seen = new Set<string>();
  while (x && x.merged_into && !seen.has(x.id)) {
    seen.add(x.id);
    x = cityById.get(x.merged_into);
  }
  c.name_now = x?.name[LAST] ?? null;
}
const noNow = cities.filter((c) => c.name_now === null).map((c) => c.id);
if (noNow.length > 0) console.warn(`今の名前（${LAST}年の名前）が無い柱：${noNow.join("、")}`);

// 各年の日本の総人口（data/national_pop.csv、pnpm data:national）。単位を人にそろえる
const UNIT: Record<string, number> = { 人: 1, 千人: 1000 };
const national: Record<string, { pop: number; source: string; note: string }> = {};
for (const r of readCsv(PATHS.nationalPop)) {
  const mult = UNIT[r.unit];
  if (!mult) throw new Error(`national_pop.csv：単位「${r.unit}」が分かりません（${r.year}年）`);
  national[r.year] = { pop: Number(r.pop) * mult, source: r.source_id, note: r.note };
}
const missingNational = YEARS.filter((y) => !(String(y) in national));
if (missingNational.length > 0) console.warn(`総人口が無い年：${missingNational.join("、")}`);

const out = { years: [...YEARS], national, cities };
mkdirSync(dirname(PATHS.citiesJson), { recursive: true });
writeFileSync(PATHS.citiesJson, JSON.stringify(out, null, 2) + "\n", "utf8");

const adoptedRows = [...adopted.values()].reduce((n, m) => n + m.size, 0);
console.log(
  `cities.json を書きました：柱 ${cities.length} 本、採用した行 ${adoptedRows}（observations ${observations.length} 行）`,
);
for (const year of YEARS) {
  const n = cities.filter((c) => c.pop[String(year)] != null).length;
  console.log(`  ${year}: 値のある柱 ${n}`);
}
