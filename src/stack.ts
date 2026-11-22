// 「積む」コマ：まだ吸収される前の町の人口を、のちの吸収先の柱に足して1本で見せる。
// 例：1925年は、1932年に東京市に入る町（渋谷町など）を東京の柱に積む（2026-11-22 yyamaの指示）。
// データ（observations.csv）は変えない。足し算は画面に出す値だけ。

import type { City, YearValue } from "./cities.ts";

export type Stacked = {
  /** 積んだあとの値。積んだ町は入っていない */
  values: Map<string, YearValue>;
  /** 積んだ町の id → 積んだ先の id */
  stacked: Map<string, string>;
};

/**
 * into に挙げた柱へ、その柱に「あとで吸収される」町の値を足す。
 * 町の条件：merged_into が into のどれかで、その年はまだ吸収されていない（merged_year が空欄か、年より後）、
 * かつその年の値がある。積む先の柱にその年の値が無いときは積まない
 */
export function stackTowns(cities: City[], values: Map<string, YearValue>, year: number, into: readonly string[]): Stacked {
  const out = new Map(values);
  const stacked = new Map<string, string>();
  if (into.length === 0) return { values: out, stacked };
  for (const c of cities) {
    if (c.merged_into === null || !into.includes(c.merged_into)) continue;
    if (c.merged_year !== null && c.merged_year <= year) continue;
    const town = out.get(c.id);
    const target = out.get(c.merged_into);
    if (!town || !target) continue;
    out.set(c.merged_into, { ...target, pop: target.pop + town.pop, dummy: target.dummy || town.dummy });
    out.delete(c.id);
    stacked.set(c.id, c.merged_into);
  }
  return { values: out, stacked };
}
