// 「積む」コマ：まだ吸収される前の町の人口を、のちの吸収先の柱に足して1本で見せる。
// 例：1925年は、1932年に東京市に入る町（渋谷町など）を東京の柱に積む（2026-11-22 yyamaの指示）。
// データ（observations.csv）は変えない。足し算は画面に出す値だけ。
// 積んだ年は、画面に出す値の順位も付け直す（rerank。2026-11-23）。observations.csv と cities.json の順位は変えない。

import type { City, YearValue } from "./cities.ts";

export type Stacked = {
  /** 積んだあとの値。積んだ町は入っていない。町を積んだ年は、順位（rank）も積んだあとで付け直してある */
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
  if (stacked.size > 0) rerank(out, values, stacked);
  return { values: out, stacked };
}

/**
 * 積んだあとの値の順位を付け直す（out を書き換える）。
 * 1. 積んだ町より下の都市（積み先も含む）は、元の順位 − 自分より上にいた積んだ町の数
 * 2. 積み先は、足したあとの人口で入れ直す。追い越した都市（積み先より上で、人口が足したあとの値以下）は1つずつ下がる
 * cities.json に無い都市（表にあって和集合に入っていない都市）は数えられない。
 * そのため付け直しが正しいのは、積み先と繰り上がる都市が cities.json の範囲に収まる場合だけ（1925年は上位40までと和集合が入っているので足りる）。
 * 足りているかは checkTopRanks で確かめる
 */
function rerank(out: Map<string, YearValue>, original: Map<string, YearValue>, stacked: Map<string, string>): void {
  const townRanks = [...stacked.keys()].map((id) => original.get(id)?.rank).filter((r): r is number => r != null);
  // 1. 積んだ町の分だけ繰り上げる
  for (const [id, v] of out) {
    if (v.rank == null) continue;
    const r = v.rank;
    const above = townRanks.filter((t) => t < r).length;
    if (above > 0) out.set(id, { ...v, rank: r - above });
  }
  // 2. 積み先を、足したあとの人口で入れ直す
  for (const target of new Set(stacked.values())) {
    const t = out.get(target);
    if (!t || t.rank == null) continue;
    const tRank = t.rank;
    const overtaken = [...out].filter(([id, v]) => id !== target && v.rank != null && v.rank < tRank && v.pop <= t.pop);
    if (overtaken.length === 0) continue;
    for (const [id, v] of overtaken) out.set(id, { ...v, rank: v.rank! + 1 });
    out.set(target, { ...t, rank: tRank - overtaken.length });
  }
}

/**
 * 1〜topN 位がちょうど1つずつあるかを確かめる。崩れていれば、その説明を返す（無ければ null）。
 * 町を積んだ年の付け直し（rerank）で、cities.json の範囲が足りないと崩れる
 */
export function checkTopRanks(values: Map<string, YearValue>, topN: number): string | null {
  const count = new Map<number, number>();
  for (const v of values.values()) if (v.rank != null && v.rank <= topN) count.set(v.rank, (count.get(v.rank) ?? 0) + 1);
  const missing: number[] = [];
  const dup: number[] = [];
  for (let r = 1; r <= topN; r++) {
    const n = count.get(r) ?? 0;
    if (n === 0) missing.push(r);
    else if (n > 1) dup.push(r);
  }
  if (missing.length === 0 && dup.length === 0) return null;
  return [missing.length ? `無い順位 ${missing.join("・")}` : "", dup.length ? `重なる順位 ${dup.join("・")}` : ""].filter(Boolean).join("、");
}
