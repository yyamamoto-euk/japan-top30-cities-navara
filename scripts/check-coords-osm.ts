// 柱の座標を OpenStreetMap の市役所の点に入れ替えるための照合表 data/check/coords-osm.md を作る。entities.csv は書き換えない。
// 実行：pnpm data:check-osm（先に pnpm data:fetch-osm と pnpm data:build）
// 探し方と判定は scripts/lib/townhall.ts。「今の座標」は、照合した時点の entities.csv の座標
// （2026-11-22 に入れ替える前は国土数値情報 P34 の点。入れ替えたあとに実行すると、入れ替えた点との一致を確かめる表になる）

import { writeFileSync } from "node:fs";
import { ROOT } from "./lib/data.ts";
import { NEAR_KM, SAME_M, matchOsm, osmPos, type Match } from "./lib/townhall.ts";

const REPORT = ROOT + "data/check/coords-osm.md";
const { matches: rows, osm } = matchOsm();
const raw = osm.raw;
const p02 = osm.p02;
type Row = Match;

/** 地理院地図で今の座標を中心に開くリンク（ズーム17） */
const gsi = (r: Row) => `[開く](https://maps.gsi.go.jp/#17/${r.cur[1].toFixed(6)}/${r.cur[0].toFixed(6)}/)`;
const count = (j: Row["judge"]) => rows.filter((r) => r.judge === j).length;
const fmt = (n: number) => n.toFixed(6);
const md: string[] = [
  "# 柱の座標：OpenStreetMap の市役所の点との照合表",
  "",
  `作成：${new Date().toISOString().slice(0, 10)}　スクリプト：\`scripts/check-coords-osm.ts\`（\`pnpm data:check-osm\`）　entities.csv はまだ書き換えていない`,
  "",
  `- OSM のデータ：\`data/raw/osm/townhall-japan.json\`（Overpass API、OSM のデータの日時 ${raw.osm3s.timestamp_osm_base}、amenity=townhall ${raw.elements.length} 件）。© OpenStreetMap contributors、ODbL 1.0`,
  `- 国土数値情報 P02（公共施設）から取り込まれた点 ${p02.length} 件は使わない（source に KSJ2、source_ref に KsjTmplt-P02、note に National-Land Numerical Information を含む点）`,
  `- 対象：coord_basis が「P34」で始まる柱と、大宮・小倉・布施（${rows.length} 本）。今の座標は P34（2014年）の点`,
  `- 探す名前：今の市の名前＋「役所」。大宮は「大宮区役所」、小倉は「北九州市役所」、布施は「東大阪市役所」（今の座標を取った施設）。同じ名前が複数あれば今の座標にいちばん近い点。完全一致が無いときは、市の名前を含む「市庁舎・本庁舎・市役所」などの点を ${NEAR_KM}km 以内で探す（区役所・支所は選ばない）`,
  `- 判定：名前が完全一致で ${SAME_M}m 以内なら「一致」、それ以外で点があれば「要確認」、無ければ「見つからない」`,
  "",
  `## まとめ`,
  "",
  `- 一致：${count("一致")} 本`,
  `- 要確認：${count("要確認")} 本`,
  `- 見つからない：${count("見つからない")} 本`,
  "",
  "## 要確認と見つからない",
  "",
  "地理院地図のリンクは、今の座標（P34）を中心に開く（ズーム17）。「見つからない」の柱は、地理院地図で市役所の記号の位置を読む",
  "",
  "| entity_id | 今の名前 | 探した名前 | 判定 | 理由 | OSM の点 | OSM の ID | ずれ（m） | 地理院地図 |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows
    .filter((r) => r.judge !== "一致")
    .map((r) => `| ${r.id} | ${r.name} | ${r.target} | ${r.judge} | ${r.why} | ${r.elName ?? "—"} | ${r.el ? `${r.el.type}/${r.el.id}` : "—"} | ${r.d !== undefined ? Math.round(r.d) : "—"} | ${gsi(r)} |`),
  "",
  "## 全行",
  "",
  "| entity_id | 今の名前 | 今の座標（P34）lat, lon | OSM の点 | OSM の ID | OSM の座標 lat, lon | source タグ | ずれ（m） | 判定 |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => {
    const p = r.el ? osmPos(r.el) : null;
    return `| ${r.id} | ${r.name} | ${fmt(r.cur[1])}, ${fmt(r.cur[0])} | ${r.elName ?? "—"} | ${r.el ? `${r.el.type}/${r.el.id}` : "—"} | ${p ? `${fmt(p[1])}, ${fmt(p[0])}` : "—"} | ${r.el?.tags.source ?? "—"} | ${r.d !== undefined ? Math.round(r.d) : "—"} | ${r.judge} |`;
  }),
];
writeFileSync(REPORT, md.join("\n") + "\n", "utf8");
console.log(`対象 ${rows.length} 本：一致 ${count("一致")}、要確認 ${count("要確認")}、見つからない ${count("見つからない")}（P02 由来で外した点 ${p02.length} 件）`);
for (const r of rows.filter((x) => x.judge !== "一致")) console.log(`  ${r.judge}　${r.name}（${r.id}）：${r.why}${r.elName ? `　→ ${r.elName} ${r.el!.type}/${r.el!.id} ${Math.round(r.d!)}m` : ""}`);
console.log("照合表：data/check/coords-osm.md");
