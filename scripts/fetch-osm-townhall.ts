// OpenStreetMap から、日本の役所（amenity=townhall）を取得して data/raw/osm/ に保存する。
// 実行：pnpm data:fetch-osm
//
// - Overpass API に、日本の国の境界（ISO3166-1=JP）の中の amenity=townhall を名前で絞らずに問い合わせる。
//   建物（way・relation）は中心点にする（out center）
// - 応答はそのまま保存する（書き換えない）。取得日時とクエリは data/sources.csv の OSM_TOWNHALL に書く
// - データの利用条件：OpenStreetMap の Open Database License（ODbL）1.0（© OpenStreetMap contributors）
import { writeFileSync } from "node:fs";
import { ROOT } from "./lib/data.ts";

export const OSM_QUERY =
  '[out:json][timeout:180];area["ISO3166-1"="JP"][admin_level=2]->.jp;nwr["amenity"="townhall"](area.jp);out center tags;';
const OUT = ROOT + "data/raw/osm/townhall-japan.json";

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "japan-top30-cities-navara (data fetch)" },
  body: "data=" + encodeURIComponent(OSM_QUERY),
});
const text = await res.text();
if (!res.ok) throw new Error(`Overpass API：${res.status} ${text.slice(0, 200)}`);
const json = JSON.parse(text) as { osm3s?: { timestamp_osm_base?: string }; elements: unknown[]; remark?: string };
if (json.remark) throw new Error(`Overpass API の注意：${json.remark}`);
if (json.elements.length === 0) throw new Error("応答が0件でした（クエリか API の不調）");
writeFileSync(OUT, text, "utf8");
console.log(`${OUT}：${json.elements.length} 件（OSM のデータの日時 ${json.osm3s?.timestamp_osm_base}、取得 ${new Date().toISOString()}）`);
