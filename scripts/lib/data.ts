// observations.csv・entities.csv・sources.csv を読み、柱ごとの採用行を決める。
// build-data.ts と validate-data.ts が共通で使う。

import { fileURLToPath } from "node:url";
import { readCsv, type Row } from "./csv.ts";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const PATHS = {
  observations: ROOT + "data/observations.csv",
  entities: ROOT + "data/entities.csv",
  sources: ROOT + "data/sources.csv",
  nationalPop: ROOT + "data/national_pop.csv",
  citiesJson: ROOT + "public/data/cities.json",
};

/** SPEC.md の年次 */
export const YEARS = [1886, 1908, 1925, 1940, 1945, 1950, 1975, 1990, 2000, 2010, 2025] as const;

/** 上位何位までを見せるか */
export const TOP_N = 30;

/** CLAUDE.md の採用順。数字が小さいほど優先。「矛盾あり」は採用しない */
export const STATUS_PRIORITY: Record<string, number> = {
  一次照合済: 0,
  二次のみ: 1,
  要照合: 2,
};
export const STATUS_REJECTED = "矛盾あり";

export type Observation = {
  line: number; // CSV 上の行番号（見出しが1行目）
  year: number;
  rank: number | null;
  name_then: string;
  pref_now: string;
  pop: number | null;
  popRaw: string;
  source_id: string;
  status: string;
  note: string;
};

export type Entity = {
  entity_id: string;
  pref_now: string;
  names: string[];
  merged_into: string | null;
  merged_year: number | null;
  lon: number | null;
  lat: number | null;
  coord_basis: string;
  note: string;
};

function toInt(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  return /^-?\d+$/.test(t) ? Number(t) : NaN;
}

function toFloat(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function loadObservations(): Observation[] {
  return readCsv(PATHS.observations).map((r: Row, i) => ({
    line: i + 2,
    year: Number(r.year),
    rank: toInt(r.rank ?? ""),
    name_then: (r.name_then ?? "").trim(),
    pref_now: (r.pref_now ?? "").trim(),
    pop: toInt(r.pop ?? ""),
    popRaw: r.pop ?? "",
    source_id: (r.source_id ?? "").trim(),
    status: (r.status ?? "").trim(),
    note: r.note ?? "",
  }));
}

export function loadEntities(): Entity[] {
  return readCsv(PATHS.entities).map((r: Row) => ({
    entity_id: r.entity_id.trim(),
    pref_now: (r.pref_now ?? "").trim(),
    names: (r.names ?? "").split("|").map((s) => s.trim()).filter(Boolean),
    merged_into: (r.merged_into ?? "").trim() || null,
    merged_year: toInt(r.merged_year ?? ""),
    lon: toFloat(r.lon ?? ""),
    lat: toFloat(r.lat ?? ""),
    coord_basis: (r.coord_basis ?? "").trim(),
    note: r.note ?? "",
  }));
}

export function loadSourceIds(): Set<string> {
  return new Set(readCsv(PATHS.sources).map((r) => r.source_id.trim()));
}

/** (pref_now, name_then) → entity_id の引き表。重なりがあれば duplicates に入れる */
export function buildEntityIndex(entities: Entity[]) {
  const index = new Map<string, string>();
  const duplicates: string[] = [];
  for (const e of entities) {
    for (const name of e.names) {
      const key = `${e.pref_now}|${name}`;
      const prev = index.get(key);
      if (prev && prev !== e.entity_id) duplicates.push(`${key}（${prev} と ${e.entity_id}）`);
      index.set(key, e.entity_id);
    }
  }
  return { index, duplicates };
}

export function entityKey(o: Observation): string {
  return `${o.pref_now}|${o.name_then}`;
}

export type Adoption = {
  /** entity_id → year → 採用した行 */
  adopted: Map<string, Map<number, Observation>>;
  /** 同じ優先度の行が複数あり、先に出た行を採った組 */
  ties: { entity_id: string; year: number; lines: number[] }[];
  /** 柱に当たらなかった行 */
  unmatched: Observation[];
};

/** 同じ年・同じ柱の行から、CLAUDE.md の採用順で1行を選ぶ */
export function adopt(observations: Observation[], index: Map<string, string>): Adoption {
  const candidates = new Map<string, Observation[]>();
  const unmatched: Observation[] = [];
  for (const o of observations) {
    const id = index.get(entityKey(o));
    if (!id) {
      unmatched.push(o);
      continue;
    }
    if (o.status === STATUS_REJECTED) continue;
    const k = `${id}|${o.year}`;
    if (!candidates.has(k)) candidates.set(k, []);
    candidates.get(k)!.push(o);
  }

  const adopted = new Map<string, Map<number, Observation>>();
  const ties: Adoption["ties"] = [];
  for (const [k, rows] of candidates) {
    const [id, yearStr] = k.split("|");
    const year = Number(yearStr);
    const ranked = rows
      .filter((o) => o.status in STATUS_PRIORITY)
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.line - b.line);
    if (ranked.length === 0) continue;
    let best = ranked[0];
    const sameLevel = ranked.filter((o) => o.status === best.status);
    if (sameLevel.length > 1) ties.push({ entity_id: id, year, lines: sameLevel.map((o) => o.line) });
    // 採用した行に rank が無い（出典に順位が無い）ときは、同じ年・同じ柱で人口が一致する別の行の rank を借りる
    if (best.rank === null && best.pop !== null) {
      const withRank = ranked.find((o) => o !== best && o.rank !== null && o.pop === best.pop);
      if (withRank) best = { ...best, rank: withRank.rank };
    }
    if (!adopted.has(id)) adopted.set(id, new Map());
    adopted.get(id)!.set(year, best);
  }
  return { adopted, ties, unmatched };
}

/**
 * データを集め終えた年。observations に TOP_N 位以下の順位まで行がある年とする。
 * それ以外の年は「未収集」として rank のそろいを調べない。
 */
export function collectedYears(observations: Observation[]): Set<number> {
  const s = new Set<number>();
  for (const o of observations) if (o.rank !== null && o.rank >= TOP_N) s.add(o.year);
  return s;
}

/** 和集合：どこかの年で採用行の rank が TOP_N 以内に入った柱 */
export function unionEntities(adopted: Adoption["adopted"]): Set<string> {
  const s = new Set<string>();
  for (const [id, byYear] of adopted)
    for (const o of byYear.values()) if (o.rank !== null && o.rank <= TOP_N) s.add(id);
  return s;
}
