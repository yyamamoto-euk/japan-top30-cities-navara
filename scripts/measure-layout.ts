// 柱を描く位置が、本当の位置（entities.csv の座標）からどれだけずれるかを測る。
// 実行：pnpm data:layout-shift（先に pnpm data:build）
//
// - 画面と同じ計算をする：src/main.ts と同じく、1925年に東京の柱に積む町はその年の値を外してから
//   src/layout.ts の layoutPillars（柱の幅 PILLAR_WIDTH、すき間 PILLAR_GAP）で描く位置を決める
// - 1925年に東京の柱に積む町（渋谷町・西巣鴨町・滝野川町・平塚町）は、ずれの一覧から除く
// - 結果を Markdown の表で出す（docs/coordinates.md の「描く位置のずれ」に貼る）。表に出すのは、柱の幅の半分以上ずれる柱
//   （2026-11-22 に柱の幅を 20km → 10km にしたとき、10km 以上の柱が無くなったので、幅に合わせて決めるようにした）

import { readFileSync } from "node:fs";
import type { CitiesData } from "../src/cities.ts";
import { valuesForYear } from "../src/cities.ts";
import { PILLAR_GAP, PILLAR_WIDTH } from "../src/constants.ts";
import { FRAMES } from "../src/frames.ts";
import { layoutPillars } from "../src/layout.ts";
import { stackTowns } from "../src/stack.ts";
import { PATHS } from "./lib/data.ts";

const data = JSON.parse(readFileSync(PATHS.citiesJson, "utf8")) as CitiesData;
const stackedTowns = new Set<string>();
const layoutCities = data.cities.map((c) => {
  const pop = { ...c.pop };
  for (const f of FRAMES) {
    const { stacked } = stackTowns(data.cities, valuesForYear(data, null, f.year), f.year, f.stackInto ?? []);
    if (stacked.has(c.id)) {
      delete pop[String(f.year)];
      stackedTowns.add(c.id);
    }
  }
  return { ...c, pop };
});
const placed = layoutPillars(layoutCities, PILLAR_WIDTH, PILLAR_GAP);

/** 柱の名前：値のある最後の年の名前（吸収された柱は吸収される前の名前） */
const name = new Map(data.cities.map((c) => [c.id, Object.keys(c.name).sort().map((y) => c.name[y]).pop() ?? c.id]));
const rows = [...placed]
  .filter(([id]) => !stackedTowns.has(id))
  .map(([id, p]) => ({ id, name: name.get(id)!, km: p.shift / 1000 }))
  .sort((a, b) => b.km - a.km);
/** 表に出す、ずれの下限（km）。柱の幅の半分 */
const LIST_KM = PILLAR_WIDTH / 2 / 1000;
const listed = rows.filter((r) => r.km >= LIST_KM);
const moved = rows.filter((r) => r.km >= 0.05);

console.log(`柱 ${rows.length} 本（1925年に積む町 ${stackedTowns.size} 本を除く）。柱の幅 ${PILLAR_WIDTH / 1000}km、すき間 ${PILLAR_GAP / 1000}km`);
console.log(`ずらした柱 ${moved.length} 本、${LIST_KM}km 以上 ${listed.length} 本、最大 ${rows[0].name} ${rows[0].km.toFixed(1)}km`);
console.log("");
console.log("| 柱 | 名前 | 描く位置のずれ（km） |");
console.log("|---|---|---|");
for (const r of listed) console.log(`| ${r.id} | ${r.name} | ${r.km.toFixed(1)} |`);
