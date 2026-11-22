// entities.csv の柱の座標（lon/lat）を、今の市役所の位置で埋める。
// 実行：pnpm data:fill-coords（先に pnpm data:fetch-osm と pnpm data:build）
//
// - 1つ目：OpenStreetMap の市役所の点（data/raw/osm/townhall-japan.json、ODbL 1.0）。
//   国土数値情報 P02 から取り込まれた点は使わない。探し方と判定は scripts/lib/townhall.ts
//   使うのは「一致」と、yyama が照合表（data/check/coords-osm.md）で OK した「要確認」（ACCEPTED）
// - 2つ目：OSM に無い市は、地理院地図の地名検索で取った点（data/raw/gsi/townhall-search.json）。名前が完全一致するもの。
//   電子国土基本図（地名情報）の公共施設とみられる。出典は「電子国土基本図（地名情報）（国土地理院）をもとに作成」
// - どちらも無い柱は変えずに一覧に出す。手で決めた柱（townhall.ts の MANUAL）は触らない
// - coord_basis に、どこから取ったか（OSM は種類と ID まで）を書く
// - 2026-11-22 まで使っていた国土数値情報 P34（非商用）からは取らない

import { readCsv, writeCsv } from "./lib/csv.ts";
import { PATHS } from "./lib/data.ts";
import { distM, loadGsi, matchOsm, osmPos } from "./lib/townhall.ts";

/** 照合表で「要確認」だったが、OSM の点を使うと yyama が決めた柱（2026-11-22） */
const ACCEPTED = new Set(["yokohama", "tottori", "omiya", "akita", "kanazawa"]);

/** 今の市役所ではない施設の位置に立てる柱の、coord_basis に足す説明 */
const SUFFIX: Record<string, string> = {
  omiya: "。今のさいたま市大宮区役所の位置（仮）",
  kokura: "。旧小倉市域にある今の北九州市役所の位置。旧小倉市役所の位置は未確認",
  fuse: "。今の東大阪市役所の位置。旧布施市役所の位置は未確認",
};

const { matches } = matchOsm();
const gsi = loadGsi();
const rows = readCsv(PATHS.entities);
const header = Object.keys(rows[0]);
const byId = new Map(rows.map((r) => [r.entity_id, r]));
const done: { id: string; how: string; moved: number }[] = [];
const left: string[] = [];

for (const m of matches) {
  const row = byId.get(m.id)!;
  let lon: number, lat: number, basis: string;
  if (m.el && (m.judge === "一致" || ACCEPTED.has(m.id))) {
    [lon, lat] = osmPos(m.el);
    basis = `OpenStreetMap ${m.elName}（${m.el.type}/${m.el.id}）`;
  } else {
    const hit = gsi.find(m.target, m.cur);
    if (!hit) {
      left.push(`${m.id}（${m.name}）：${m.judge}。${m.why}。地理院地図の地名検索にも無い`);
      continue;
    }
    ({ lon, lat } = hit);
    basis = `電子国土基本図（地名情報）（国土地理院）をもとに作成。地理院地図の地名検索で取得（${hit.title}）`;
  }
  basis += SUFFIX[m.id] ?? "";
  const moved = distM(m.cur, [lon, lat]);
  row.lon = lon.toFixed(6);
  row.lat = lat.toFixed(6);
  row.coord_basis = basis;
  done.push({ id: m.id, how: basis, moved });
}

writeCsv(PATHS.entities, header, rows);
const osmCount = done.filter((d) => d.how.startsWith("OpenStreetMap")).length;
console.log(`入れた柱 ${done.length}（OpenStreetMap ${osmCount}、電子国土基本図（地名情報）（地理院地図の地名検索） ${done.length - osmCount}）、残した柱 ${left.length}`);
for (const s of left) console.log(`  残した：${s}`);
console.log("前の座標からのずれ（大きい順に10本）：");
for (const d of [...done].sort((a, b) => b.moved - a.moved).slice(0, 10)) console.log(`  ${d.id}　${Math.round(d.moved)}m　${d.how}`);
