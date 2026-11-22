// observations.csv・entities.csv・sources.csv を調べて、問題を一覧で出す。
// 実行：pnpm data:validate
//
// エラー（終了コード 1）
//   - entities の名前の重なり、merged_into の参照先が無い
//   - observations の行がどの柱にも当たらない、年が SPEC の年次に無い、status が決まった4つ以外
//   - pop が正の整数でない、pop が空欄なのに note が無い
//   - STRICT_YEARS の年で、採用行の rank 1〜30 がそろっていない
// 警告（終了コードに影響しない）
//   - 上記以外の収集済みの年で rank 1〜30 の欠けや重なり
//   - 和集合の柱で、収集済みの年に値が無い
//   - 同じ優先度の行が複数あり、人口が違う（人口が同じなら情報にとどめる）
//   - source_id が sources.csv に無い
//   - 採用行が1つも無い柱、座標・自治体コードが空欄の柱

import {
  STATUS_PRIORITY,
  STATUS_REJECTED,
  TOP_N,
  YEARS,
  adopt,
  buildEntityIndex,
  collectedYears,
  loadEntities,
  loadObservations,
  loadSourceIds,
  unionEntities,
} from "./lib/data.ts";

/** rank 1〜30 の欠けをエラーにする年。ほかの収集済みの年は警告にとどめる */
const STRICT_YEARS = new Set([2025]);

const errors: string[] = [];
const warnings: string[] = [];
const infos: string[] = [];

const entities = loadEntities();
const observations = loadObservations();
const sourceIds = loadSourceIds();
const entityIds = new Set(entities.map((e) => e.entity_id));

// --- entities.csv ---
const { index, duplicates } = buildEntityIndex(entities);
for (const d of duplicates) errors.push(`entities: 同じ名前が複数の柱に当たる ${d}`);
for (const e of entities) {
  if (e.merged_into && !entityIds.has(e.merged_into))
    errors.push(`entities: ${e.entity_id} の merged_into「${e.merged_into}」が entities に無い`);
  if (e.merged_into && e.merged_year === null)
    warnings.push(`entities: ${e.entity_id} の merged_year が空欄（note: ${e.note || "なし"}）`);
}

// --- observations.csv の各行 ---
const statuses = new Set([...Object.keys(STATUS_PRIORITY), STATUS_REJECTED]);
const yearSet = new Set<number>(YEARS);
for (const o of observations) {
  const where = `observations ${o.line}行目（${o.year} ${o.pref_now} ${o.name_then}）`;
  if (!yearSet.has(o.year)) errors.push(`${where}: 年 ${o.year} が SPEC の年次に無い`);
  if (!statuses.has(o.status)) errors.push(`${where}: status「${o.status}」が決まった値でない`);
  if (o.pop === null) {
    if (o.note.trim() === "") errors.push(`${where}: pop が空欄なのに note に理由が無い`);
  } else if (Number.isNaN(o.pop) || o.pop <= 0) {
    errors.push(`${where}: pop「${o.popRaw}」が正の整数でない`);
  }
  if (o.rank !== null && (Number.isNaN(o.rank) || o.rank <= 0))
    errors.push(`${where}: rank が正の整数でない`);
  if (!sourceIds.has(o.source_id)) warnings.push(`${where}: source_id「${o.source_id}」が sources.csv に無い`);
}

// --- 柱との対応と採用 ---
const { adopted, ties, unmatched } = adopt(observations, index);
for (const o of unmatched)
  errors.push(
    `observations ${o.line}行目: (${o.pref_now}, ${o.name_then}) がどの柱にも当たらない。entities.csv の names に足す`,
  );
// 同じ優先度の行どうしで人口が同じなら、どれを採っても同じなので情報にとどめる
for (const t of ties) {
  const pops = new Set(t.lines.map((l) => observations.find((o) => o.line === l)?.pop ?? null));
  const msg = `${t.year} ${t.entity_id}: 同じ優先度の行が複数（${t.lines.join("・")}行目）。先の行を採用`;
  if (pops.size > 1) warnings.push(`${msg}。人口が違う`);
  else infos.push(`${msg}（人口は同じ）`);
}

// --- 年ごとの rank 1〜30 ---
const collected = collectedYears(observations);
const rankSummary: string[] = [];
for (const year of YEARS) {
  if (!collected.has(year)) {
    const n = observations.filter((o) => o.year === year).length;
    rankSummary.push(`${year}: 未収集（行 ${n}）。rank のそろいは調べない`);
    continue;
  }
  const byRank = new Map<number, string[]>();
  for (const [id, byYear] of adopted) {
    const o = byYear.get(year);
    if (o && o.rank !== null && o.rank >= 1 && o.rank <= TOP_N) {
      if (!byRank.has(o.rank)) byRank.set(o.rank, []);
      byRank.get(o.rank)!.push(`${id}(${o.source_id})`);
    }
  }
  const missing: number[] = [];
  const dup: string[] = [];
  for (let r = 1; r <= TOP_N; r++) {
    const ids = byRank.get(r);
    if (!ids) missing.push(r);
    else if (ids.length > 1) dup.push(`${r}位: ${ids.join("、")}`);
  }
  const ok = missing.length === 0 && dup.length === 0;
  const list = STRICT_YEARS.has(year) ? errors : warnings;
  if (missing.length > 0) list.push(`${year}: 採用行に ${missing.join("・")} 位が無い`);
  if (dup.length > 0) list.push(`${year}: 同じ順位に複数の柱 ${dup.join(" ／ ")}`);
  rankSummary.push(
    ok
      ? `${year}: 上位${TOP_N}がそろっています`
      : `${year}: 上位${TOP_N}がそろっていない（欠け ${missing.length}、重なり ${dup.length}）`,
  );
}

// --- 和集合の各柱に、収集済みの年の値があるか ---
const union = unionEntities(adopted);
const unionGaps = new Map<number, string[]>();
for (const id of [...union].sort()) {
  const byYear = adopted.get(id);
  const ent = entities.find((e) => e.entity_id === id);
  for (const year of YEARS) {
    if (!collected.has(year)) continue;
    // 吸収された年以降は値が無くて当然なので調べない
    if (ent?.merged_into && ent.merged_year !== null && year >= ent.merged_year) continue;
    const o = byYear?.get(year);
    const hasRow = observations.some((x) => x.year === year && index.get(`${x.pref_now}|${x.name_then}`) === id);
    if (o && (o.pop !== null || o.note.trim() !== "")) continue;
    const reason = !hasRow ? "行が無い" : o ? "pop 空欄で note も無い" : "矛盾ありの行しか無い";
    if (!unionGaps.has(year)) unionGaps.set(year, []);
    unionGaps.get(year)!.push(`${id}（${reason}）`);
  }
}
for (const [year, ids] of unionGaps)
  warnings.push(`和集合の柱で ${year} 年の値が無い ${ids.length} 本: ${ids.join("、")}`);

// --- 情報 ---
const noAdopted = entities.filter((e) => !adopted.has(e.entity_id)).map((e) => e.entity_id);
if (noAdopted.length > 0) infos.push(`採用行が1つも無い柱: ${noAdopted.join("、")}`);
const noCoord = entities.filter((e) => e.lon === null || e.lat === null).length;
const noCode = entities.filter((e) => e.current_code === "").length;
infos.push(`座標が空欄の柱 ${noCoord} / ${entities.length}、自治体コードが空欄の柱 ${noCode} / ${entities.length}`);
infos.push(`和集合 ${union.size} 本（どこかの年で採用行が ${TOP_N} 位以内）`);

// --- 出力 ---
const section = (title: string, items: string[]) => {
  console.log(`\n## ${title}（${items.length}）`);
  for (const s of items) console.log(`- ${s}`);
};
console.log(`observations ${observations.length} 行、entities ${entities.length} 本、sources ${sourceIds.size} 件`);
section("年ごとの上位30", rankSummary);
section("エラー", errors);
section("警告", warnings);
section("情報", infos);

if (errors.length > 0) {
  console.log(`\nエラーが ${errors.length} 件あります。`);
  process.exit(1);
}
console.log("\nエラーはありません。");
