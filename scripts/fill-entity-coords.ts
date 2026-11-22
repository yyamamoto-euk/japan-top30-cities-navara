// entities.csv の座標（lon/lat）と自治体コード（current_code）を、
// 国土数値情報「市町村役場等及び公的集会施設」P34（2014年、非商用）の本庁の位置で埋める。
// 実行：pnpm data:fill-coords
//
// - 入力：data/raw/P34/gml/P34-14_NN.xml（data/raw/P34/zip/ の zip から取り出したもの）
// - coord_basis が「要手入力」の柱だけを埋める。手で入れた値は上書きしない
// - 今の市の名前 +「役所」（例：横浜市役所）に一致する本庁（施設分類 1）を探す。
//   見つからない、または複数見つかった柱は「要手入力」のまま残し、一覧に出す
// - current_code は P34 の行政区域コード（5桁、検査数字なし）

import { readdirSync, readFileSync } from "node:fs";
import { readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS, ROOT } from "./lib/data.ts";

const GML_DIR = ROOT + "data/raw/P34/gml/";
const MANUAL = "要手入力";

/**
 * 柱 → 今の市の名前。names の最後が「〇〇市」ならそれを使うので、ここには例外だけを書く。
 * null は、今の市の役所を柱の位置にしないもの（理由は SKIP_REASON）。
 */
const CURRENT_CITY: Record<string, string | null> = {
  tokyo: null,
  yahata: null,
  shuri: null,
  hirosaki: "弘前市",
  yamagata: "山形市",
  saga: "佐賀市",
  joetsu: "上越市",
  gifu: "岐阜市",
  otsu: "大津市",
  nara: "奈良市",
  ise: "伊勢市",
  sakata: "酒田市",
  kurume: "久留米市",
  tsuruoka: "鶴岡市",
  mito: "水戸市",
  aomori: "青森市",
  choshi: "銚子市",
};
const SKIP_REASON: Record<string, string> = {
  tokyo: "特別区部は1つの役所を持たない（都庁は P34 に無い）",
  yahata: "北九州市に吸収された柱。今の役所は北九州市のもので、八幡の位置ではない",
  shuri: "那覇市に吸収された柱。今の役所は那覇市のもので、首里の位置ではない",
};

type Office = { file: string; code: string; cls: string; name: string; address: string; lat: number; lon: number };

function loadOffices(): Office[] {
  const offices: Office[] = [];
  for (const file of readdirSync(GML_DIR).filter((f) => /^P34-14_\d\d\.xml$/.test(f))) {
    const xml = readFileSync(GML_DIR + file, "utf8");
    const points = new Map<string, [number, number]>();
    for (const m of xml.matchAll(/<gml:Point gml:id="([^"]+)">\s*<gml:pos>([\d.]+) ([\d.]+)<\/gml:pos>/g))
      points.set(m[1], [Number(m[2]), Number(m[3])]); // 緯度 経度 の順
    for (const m of xml.matchAll(
      /<ksj:LocalGovernmentOfficeAndPublicMeetingFacility[\s\S]*?<\/ksj:LocalGovernmentOfficeAndPublicMeetingFacility>/g,
    )) {
      const rec = m[0];
      const get = (tag: string) => rec.match(new RegExp(`<ksj:${tag}[^>]*>([^<]*)<`))?.[1]?.trim() ?? "";
      const ref = rec.match(/xlink:href="#([^"]+)"/)?.[1] ?? "";
      const p = points.get(ref);
      if (!p) throw new Error(`${file}: 位置 ${ref} が見つからない`);
      offices.push({
        file,
        code: get("administrativeAreaCode"),
        cls: get("publicOfficeClassification"),
        name: get("publicOfficeName"),
        address: get("address"),
        lat: p[0],
        lon: p[1],
      });
    }
  }
  return offices;
}

const offices = loadOffices();
if (offices.length === 0) throw new Error(`${GML_DIR} に P34 の GML がありません`);
const headOffices = offices.filter((o) => o.cls === "1");

const rows = readCsv(PATHS.entities);
const header = Object.keys(rows[0]);
const filled: string[] = [];
const skipped: string[] = [];

for (const row of rows) {
  const id = row.entity_id;
  if (row.coord_basis !== MANUAL) continue; // 手で入れた値は触らない

  const names = row.names.split("|");
  const last = names[names.length - 1];
  const city = id in CURRENT_CITY ? CURRENT_CITY[id] : last.endsWith("市") ? last : undefined;
  if (city === null) {
    skipped.push(`${id}: ${SKIP_REASON[id] ?? "対象外"}`);
    continue;
  }
  if (city === undefined) {
    skipped.push(`${id}: 今の市の名前が分からない（names: ${row.names}）`);
    continue;
  }

  // 名前で探し、同じ名前が複数あるときだけ住所で絞る。
  // （P34 の住所には誤記がある。例：名古屋市役所の住所が「名古屋中区…」）
  let hits = headOffices.filter((o) => o.name === `${city}役所`);
  if (hits.length > 1) hits = hits.filter((o) => o.address.startsWith(city));
  if (hits.length !== 1) {
    skipped.push(`${id}: 「${city}役所」の本庁が ${hits.length} 件`);
    continue;
  }
  const o = hits[0];
  row.lon = o.lon.toFixed(6);
  row.lat = o.lat.toFixed(6);
  row.current_code = o.code;
  row.coord_basis = `P34-14 本庁（${o.name}、${o.address}）`;
  filled.push(`${id}: ${o.name} ${o.code} (${row.lat}, ${row.lon})`);
}

writeCsv(PATHS.entities, header, rows);
console.log(`P34 の本庁 ${headOffices.length} 件を読みました。`);
console.log(`\n## 埋めた柱（${filled.length}）`);
for (const s of filled) console.log(`- ${s}`);
console.log(`\n## 要手入力のまま（${skipped.length}）`);
for (const s of skipped) console.log(`- ${s}`);
