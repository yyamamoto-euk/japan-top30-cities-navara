// 柱の座標を OpenStreetMap の市役所の点に入れ替えるための照合表 data/check/coords-osm.md を作る。
// entities.csv は書き換えない。
// 実行：pnpm data:check-osm（先に pnpm data:fetch-osm と pnpm data:build）
//
// - 入力：data/raw/osm/townhall-japan.json（Overpass API の応答。amenity=townhall）
// - 対象：coord_basis が「P34」で始まる柱と、P34 の点を使っている大宮・小倉・布施
// - 国土数値情報 P02（公共施設）から取り込まれた点は使わない：source に KSJ2 を含む、
//   source_ref に KsjTmplt-P02 を含む、note に National-Land Numerical Information / 国土数値情報 を含む
// - 探す名前：今の市の名前＋「役所」（横浜市 → 横浜市役所）。大宮・小倉・布施は今の座標を取った施設の名前
//   同じ名前の点が複数あるときは、今の座標にいちばん近い点
// - 完全一致が無いときは、その市の名前を含み「市庁舎・本庁舎・市役所・本庁」などで終わる点を、今の座標から
//   5km 以内で探す（区役所・支所・出張所・分庁舎は選ばない）
// - 判定：名前が完全一致で 500m 以内なら「一致」、それ以外で点があれば「要確認」、無ければ「見つからない」

import { readFileSync, writeFileSync } from "node:fs";
import { PATHS, ROOT, loadEntities } from "./lib/data.ts";

const RAW = ROOT + "data/raw/osm/townhall-japan.json";
const REPORT = ROOT + "data/check/coords-osm.md";
const NEAR_KM = 5;
const SAME_M = 500;

/** 今の座標を、今の市役所ではない施設から取っている柱（P34 の点） */
const TARGET: Record<string, string> = { omiya: "大宮区役所", kokura: "北九州市役所", fuse: "東大阪市役所" };

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };
const raw = JSON.parse(readFileSync(RAW, "utf8")) as { osm3s: { timestamp_osm_base: string }; elements: El[] };
const pos = (e: El): [number, number] => [e.lon ?? e.center!.lon, e.lat ?? e.center!.lat];
const fromP02 = (e: El) =>
  /KSJ2/i.test(e.tags.source ?? "") ||
  /KsjTmplt-P02/i.test(e.tags.source_ref ?? "") ||
  /National-Land Numerical Information|国土数値情報/.test(`${e.tags.note ?? ""} ${e.tags["note:ja"] ?? ""}`);
const names = (e: El) => [e.tags.name, e.tags["name:ja"]].filter(Boolean) as string[];
const R = Math.PI / 180;
const distM = (a: [number, number], b: [number, number]) => {
  const dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
const usable = raw.elements.filter((e) => !fromP02(e));
const p02 = raw.elements.filter(fromP02);

const cities = JSON.parse(readFileSync(PATHS.citiesJson, "utf8")).cities as { id: string; name_now: string | null }[];
const nameNow = new Map(cities.map((c) => [c.id, c.name_now]));

type Row = {
  id: string; name: string; target: string; cur: [number, number];
  el?: El; elName?: string; d?: number; judge: "一致" | "要確認" | "見つからない"; why: string;
};
const rows: Row[] = [];
for (const e of loadEntities()) {
  if (!(e.coord_basis.startsWith("P34") || e.entity_id in TARGET)) continue;
  if (e.lon === null || e.lat === null) continue;
  const name = nameNow.get(e.entity_id) ?? e.names[e.names.length - 1];
  const target = TARGET[e.entity_id] ?? `${name}役所`;
  const city = target.replace(/役所$/, "");
  const cur: [number, number] = [e.lon, e.lat];
  const nearest = (list: El[]) => list.map((x) => ({ x, d: distM(cur, pos(x)) })).sort((a, b) => a.d - b.d)[0];

  const exact = nearest(usable.filter((x) => names(x).includes(target)));
  if (exact) {
    const ok = exact.d <= SAME_M;
    rows.push({ id: e.entity_id, name, target, cur, el: exact.x, elName: exact.x.tags.name, d: exact.d, judge: ok ? "一致" : "要確認", why: ok ? "" : `名前は一致、${SAME_M}m を超える` });
    continue;
  }
  // 別の名前（市庁舎・本庁舎など）
  const isDesignatedWardOffice = (n: string) => /区役所$/.test(n) && !/^.+区役所$/.test(target.replace(/区役所$/, "")) && target.endsWith("市役所");
  const alt = nearest(
    usable.filter((x) =>
      names(x).some(
        (n) =>
          n.includes(city) &&
          /(市庁舎|本庁舎|本庁|市役所|役所本庁舎)$/.test(n) &&
          !/(支所|出張所|分庁舎|別館)$/.test(n) &&
          !isDesignatedWardOffice(n),
      ) && distM(cur, pos(x)) <= NEAR_KM * 1000,
    ),
  );
  const p02Exact = p02.some((x) => names(x).includes(target));
  if (alt) {
    rows.push({ id: e.entity_id, name, target, cur, el: alt.x, elName: alt.x.tags.name, d: alt.d, judge: "要確認", why: `名前が「${target}」と違う${p02Exact ? "。「" + target + "」は P02 由来の点だけ" : ""}` });
  } else {
    rows.push({ id: e.entity_id, name, target, cur, judge: "見つからない", why: p02Exact ? `「${target}」は P02 由来の点だけ` : `「${target}」も、${NEAR_KM}km 以内の別の名前の本庁舎も無い` });
  }
}

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
  "| entity_id | 今の名前 | 探した名前 | 判定 | 理由 | OSM の点 | OSM の ID | ずれ（m） |",
  "|---|---|---|---|---|---|---|---|",
  ...rows
    .filter((r) => r.judge !== "一致")
    .map((r) => `| ${r.id} | ${r.name} | ${r.target} | ${r.judge} | ${r.why} | ${r.elName ?? "—"} | ${r.el ? `${r.el.type}/${r.el.id}` : "—"} | ${r.d !== undefined ? Math.round(r.d) : "—"} |`),
  "",
  "## 全行",
  "",
  "| entity_id | 今の名前 | 今の座標（P34）lat, lon | OSM の点 | OSM の ID | OSM の座標 lat, lon | source タグ | ずれ（m） | 判定 |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => {
    const p = r.el ? pos(r.el) : null;
    return `| ${r.id} | ${r.name} | ${fmt(r.cur[1])}, ${fmt(r.cur[0])} | ${r.elName ?? "—"} | ${r.el ? `${r.el.type}/${r.el.id}` : "—"} | ${p ? `${fmt(p[1])}, ${fmt(p[0])}` : "—"} | ${r.el?.tags.source ?? "—"} | ${r.d !== undefined ? Math.round(r.d) : "—"} | ${r.judge} |`;
  }),
];
writeFileSync(REPORT, md.join("\n") + "\n", "utf8");
console.log(`対象 ${rows.length} 本：一致 ${count("一致")}、要確認 ${count("要確認")}、見つからない ${count("見つからない")}（P02 由来で外した点 ${p02.length} 件）`);
for (const r of rows.filter((x) => x.judge !== "一致")) console.log(`  ${r.judge}　${r.name}（${r.id}）：${r.why}${r.elName ? `　→ ${r.elName} ${r.el!.type}/${r.el!.id} ${Math.round(r.d!)}m` : ""}`);
console.log("照合表：data/check/coords-osm.md");
