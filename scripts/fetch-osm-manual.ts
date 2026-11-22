// 手で位置を決めた柱のうち、住所検索で座標を取っていた4本の代わりに、OpenStreetMap の点を探して保存する。
// 実行：pnpm data:fetch-osm-manual
//
// - Overpass API で、今の座標から 1km 以内にある、目当ての施設や地名の点を探す（amenity=townhall に限らない）
// - 応答はそのまま data/raw/osm/manual-points.json に保存する（クエリと一緒に）。sources.csv の OSM_MANUAL_POINTS
// - データの利用条件：Open Database License（ODbL）1.0（© OpenStreetMap contributors）
// - 2026-11-22：住所検索（地理院地図の住所検索は東京大学 CSIS のシンプルジオコーディング）で取った点を使わないため
import { writeFileSync } from "node:fs";
import { ROOT } from "./lib/data.ts";

/** 柱 → 今の座標（入れ替える前）と、探す名前（正規表現）。place だけを探すものは place を true */
export const TARGETS = [
  { id: "moji", lat: 33.941662, lon: 130.959549, name: "門司区役所", place: false },
  { id: "nishisugamo-machi", lat: 35.732368, lon: 139.715897, name: "豊島公会堂|Hareza|ハレザ|西巣鴨町役場", place: false },
  { id: "takinogawa-machi", lat: 35.741772, lon: 139.746033, name: "^西[ケヶ]原", place: true },
  { id: "hiratsuka-machi", lat: 35.61203, lon: 139.710678, name: "荏原文化センター", place: false },
] as const;
const OUT = ROOT + "data/raw/osm/manual-points.json";

const queryFor = (t: (typeof TARGETS)[number]) =>
  `[out:json][timeout:60];${t.place ? "node" : "nwr"}${t.place ? '["place"]' : ""}["name"~"${t.name}"](around:1000,${t.lat},${t.lon});out center tags;`;

const results = [];
for (const t of TARGETS) {
  const query = queryFor(t);
  // Overpass API が混んでいるときは 429・502・504 が返るので、間を空けてやり直す（最大4回）
  let res: Response | undefined;
  let text = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10_000 * 2 ** (attempt - 1)));
    res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "japan-top30-cities-navara (data fetch)" },
      body: "data=" + encodeURIComponent(query),
    });
    text = await res.text();
    if (res.ok || ![429, 502, 504].includes(res.status)) break;
    console.log(`${t.id}：Overpass API ${res.status}、やり直す`);
  }
  if (!res?.ok) throw new Error(`${t.id}：Overpass API ${res?.status} ${text.slice(0, 200)}`);
  const response = JSON.parse(text) as { elements: { type: string; id: number; tags: Record<string, string> }[] };
  results.push({ id: t.id, query, response });
  console.log(`${t.id}：${response.elements.length} 件　${response.elements.map((e) => `${e.tags.name}（${e.type}/${e.id}）`).join("、")}`);
}
writeFileSync(OUT, JSON.stringify({ fetched_at: new Date().toISOString(), endpoint: "https://overpass-api.de/api/interpreter", results }, null, 2) + "\n", "utf8");
console.log(`保存：${OUT}`);
