// 上位30の入れ替わり：年表の1つ前の年と比べて、上位30に「入った」柱と「外れた」柱を決める（2026-11-22）。
// 画面では、入った柱を光らせ、外れた柱に輪郭を付ける（src/pillars.ts の setHighlights）。
//
// 決まり
// - 比べるのは、画面に出す値（1925年は東京に町を積んだあと。src/stack.ts）の順位
// - 入った：その年に上位30で、1つ前の年は上位30の外か値が無かった柱。合併でできた市（1975年の北九州市など）も含む
// - 外れた：1つ前の年に上位30で、その年は上位30の外の柱。合併で無くなった柱と、その年の値が無い柱（データの欠け）は数えない

import type { City, YearValue } from "./cities.ts";

export type Change = "in" | "out";

const inTop = (values: Map<string, YearValue>, id: string, topN: number) => {
  const v = values.get(id);
  return v !== undefined && v.rank !== null && v.rank <= topN;
};

/**
 * @param prev 1つ前の年の画面の値（積んだあと）。1つ前が無いときは null（何も光らせない）
 * @param cur その年の画面の値（積んだあと）
 */
export function topChanges(
  cities: City[],
  prev: Map<string, YearValue> | null,
  cur: Map<string, YearValue>,
  year: number,
  topN: number,
): Map<string, Change> {
  const out = new Map<string, Change>();
  if (!prev) return out;
  for (const c of cities) {
    if (c.merged_into !== null && c.merged_year !== null && c.merged_year <= year) continue; // 合併で無くなった
    const now = inTop(cur, c.id, topN);
    const before = inTop(prev, c.id, topN);
    if (now && !before) out.set(c.id, "in");
    else if (!now && before && cur.has(c.id)) out.set(c.id, "out");
  }
  return out;
}
