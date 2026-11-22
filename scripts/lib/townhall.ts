// 柱の位置にする市役所の点を、OpenStreetMap と国土地理院の地名検索から探す（check-coords-osm.ts と fill-entity-coords.ts が使う）。
//
// - OpenStreetMap：data/raw/osm/townhall-japan.json（pnpm data:fetch-osm。amenity=townhall、ODbL 1.0）
//   国土数値情報 P02（公共施設）から取り込まれた点は使わない：source に KSJ2、source_ref に KsjTmplt-P02、
//   note に National-Land Numerical Information / 国土数値情報 を含む点
// - 国土地理院の地名検索：data/raw/gsi/townhall-search.json（地理院地図の検索窓と同じ API の応答。OSM で見つからない市の分）
// - 対象：今の市役所（など）の位置に立てる柱。手で決めた柱（MANUAL）は対象外
// - 探す名前：今の市の名前＋「役所」（横浜市 → 横浜市役所）。大宮・小倉・布施は TARGET の施設
//   同じ名前の点が複数あるときは、今の座標にいちばん近い点
// - OSM に完全一致が無いときは、その市の名前を含み「市庁舎・本庁舎・市役所・本庁」などで終わる点を、今の座標から
//   5km 以内で探す（区役所・支所・出張所・分庁舎は選ばない）
// - 判定：名前が完全一致で 500m 以内なら「一致」、それ以外で点があれば「要確認」、無ければ「見つからない」

import { readFileSync } from "node:fs";
import { PATHS, ROOT, loadEntities } from "./data.ts";

export const OSM_RAW = ROOT + "data/raw/osm/townhall-japan.json";
export const GSI_RAW = ROOT + "data/raw/gsi/townhall-search.json";
export const NEAR_KM = 5;
export const SAME_M = 500;

/** 手で座標を決めた柱（市役所の位置ではない。docs/coordinates.md）。ここでは触らない */
export const MANUAL = new Set([
  "tokyo",
  "yahata",
  "shuri",
  "moji",
  "shibuya-machi",
  "nishisugamo-machi",
  "takinogawa-machi",
  "hiratsuka-machi",
]);

/** 今の市役所ではない施設の位置に立てる柱 */
export const TARGET: Record<string, string> = { omiya: "大宮区役所", kokura: "北九州市役所", fuse: "東大阪市役所" };

export type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };
export type Judge = "一致" | "要確認" | "見つからない";
export type Match = {
  id: string;
  /** 今の市の名前 */
  name: string;
  /** 探した名前 */
  target: string;
  /** 今の座標 [lon, lat] */
  cur: [number, number];
  el?: OsmEl;
  elName?: string;
  /** 今の座標からの距離（m） */
  d?: number;
  judge: Judge;
  why: string;
};

export const osmPos = (e: OsmEl): [number, number] => [e.lon ?? e.center!.lon, e.lat ?? e.center!.lat];
const fromP02 = (e: OsmEl) =>
  /KSJ2/i.test(e.tags.source ?? "") ||
  /KsjTmplt-P02/i.test(e.tags.source_ref ?? "") ||
  /National-Land Numerical Information|国土数値情報/.test(`${e.tags.note ?? ""} ${e.tags["note:ja"] ?? ""}`);
const names = (e: OsmEl) => [e.tags.name, e.tags["name:ja"]].filter(Boolean) as string[];
const R = Math.PI / 180;
export const distM = (a: [number, number], b: [number, number]) => {
  const dLat = (b[1] - a[1]) * R,
    dLon = (b[0] - a[0]) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

export function loadOsm() {
  const raw = JSON.parse(readFileSync(OSM_RAW, "utf8")) as { osm3s: { timestamp_osm_base: string }; elements: OsmEl[] };
  return { raw, usable: raw.elements.filter((e) => !fromP02(e)), p02: raw.elements.filter(fromP02) };
}

/** 市役所の位置に立てる柱ごとに、OSM の点を探す */
export function matchOsm(): { matches: Match[]; osm: ReturnType<typeof loadOsm> } {
  const osm = loadOsm();
  const cities = JSON.parse(readFileSync(PATHS.citiesJson, "utf8")).cities as { id: string; name_now: string | null }[];
  const nameNow = new Map(cities.map((c) => [c.id, c.name_now]));
  const matches: Match[] = [];
  for (const e of loadEntities()) {
    if (MANUAL.has(e.entity_id) || e.lon === null || e.lat === null) continue;
    const name = nameNow.get(e.entity_id) ?? e.names[e.names.length - 1];
    const target = TARGET[e.entity_id] ?? `${name}役所`;
    const city = target.replace(/役所$/, "");
    const cur: [number, number] = [e.lon, e.lat];
    const nearest = (list: OsmEl[]) => list.map((x) => ({ x, d: distM(cur, osmPos(x)) })).sort((a, b) => a.d - b.d)[0];

    const exact = nearest(osm.usable.filter((x) => names(x).includes(target)));
    if (exact) {
      const ok = exact.d <= SAME_M;
      matches.push({ id: e.entity_id, name, target, cur, el: exact.x, elName: exact.x.tags.name, d: exact.d, judge: ok ? "一致" : "要確認", why: ok ? "" : `名前は一致、${SAME_M}m を超える` });
      continue;
    }
    // 別の名前（市庁舎・本庁舎など）。政令市の区役所は選ばない
    const wardOffice = (n: string) => target.endsWith("市役所") && /区役所$/.test(n);
    const alt = nearest(
      osm.usable.filter(
        (x) =>
          names(x).some((n) => n.includes(city) && /(市庁舎|本庁舎|本庁|市役所|役所本庁舎)$/.test(n) && !/(支所|出張所|分庁舎|別館)$/.test(n) && !wardOffice(n)) &&
          distM(cur, osmPos(x)) <= NEAR_KM * 1000,
      ),
    );
    const p02Exact = osm.p02.some((x) => names(x).includes(target));
    if (alt) {
      matches.push({ id: e.entity_id, name, target, cur, el: alt.x, elName: alt.x.tags.name, d: alt.d, judge: "要確認", why: `名前が「${target}」と違う${p02Exact ? "。「" + target + "」は P02 由来の点だけ" : ""}` });
    } else {
      matches.push({ id: e.entity_id, name, target, cur, judge: "見つからない", why: p02Exact ? `「${target}」は P02 由来の点だけ` : `「${target}」も、${NEAR_KM}km 以内の別の名前の本庁舎も無い` });
    }
  }
  return { matches, osm };
}

export type GsiHit = { title: string; lon: number; lat: number; addressCode: string };

/** 国土地理院の地名検索の保存した応答から、名前が完全一致する点（今の座標にいちばん近いもの）を返す */
export function loadGsi(): { fetchedAt: string; find: (target: string, cur: [number, number]) => GsiHit | undefined } {
  const raw = JSON.parse(readFileSync(GSI_RAW, "utf8")) as {
    fetched_at: string;
    results: { query: string; response: { geometry: { coordinates: [number, number] }; properties: { title: string; addressCode: string } }[] }[];
  };
  return {
    fetchedAt: raw.fetched_at,
    find(target, cur) {
      const hits = raw.results
        .filter((r) => r.query === target)
        .flatMap((r) => r.response)
        .filter((f) => f.properties.title === target)
        .map((f) => ({ title: f.properties.title, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], addressCode: f.properties.addressCode }));
      return hits.sort((a, b) => distM(cur, [a.lon, a.lat]) - distM(cur, [b.lon, b.lat]))[0];
    },
  };
}
