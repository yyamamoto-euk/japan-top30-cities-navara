// T4：寄り道の章で塗る都道府県の面 public/data/prefectures.geojson を作る。
// 実行：pnpm data:prefectures-geo
//
// - 形：国土数値情報 行政区域 N03（2025年1月1日）の全国データ。data/raw/N03/ に置く（約600MB、git に入れない）
//   zip を展開した Shapefile を mapshaper で都道府県ごとにまとめ（dissolve）、簡略化する
// - 値：data/prefectures_pop.csv（D3、単位は千人）を都道府県名で結合する
//   属性：pref_code, pref_name, pop1940, pop1945, pop1950（千人）, rate1945, rate1950（1940年比の増減率、%）
//   値の無いところ（沖縄県の1945年）は null
// - 境界は今の都道府県。1940〜1950年当時の境界ではない

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import mapshaper from "mapshaper";
import { readCsv } from "./lib/csv.ts";
import { ROOT } from "./lib/data.ts";

const RAW_DIR = ROOT + "data/raw/N03/";
const ZIP = RAW_DIR + "N03-20250101_GML.zip";
const WORK = RAW_DIR + "work/";
const DISSOLVED = WORK + "prefectures_dissolved.json";
const POP_CSV = ROOT + "data/prefectures_pop.csv";
const OUT = ROOT + "public/data/prefectures.geojson";

/** 簡略化の度合い（残す頂点の割合）。ファイルの大きさと形の粗さの兼ね合い */
const SIMPLIFY = "0.2%";
/** これより小さい島は消す（km²）。全国を見る画面では見えず、ファイルを重くするだけなので */
const MIN_ISLAND_KM2 = 2;
/** 座標の桁（度）。0.0001度 ≒ 10m */
const PRECISION = 0.0001;

// --- 1. zip を展開して Shapefile を探す ---
if (!existsSync(ZIP)) throw new Error(`${ZIP} がありません。data/sources.csv の N03_KSJ から取得して置いてください`);
mkdirSync(WORK, { recursive: true });
const findShp = () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => (statSync(d + n).isDirectory() ? walk(d + n + "/") : [d + n]));
  return walk(WORK).find((p) => /N03-\d+\.shp$/i.test(p));
};
let shp = findShp();
if (!shp) {
  console.log("zip を展開しています…");
  // Windows 標準の tar.exe（bsdtar）は zip を展開できる。Git Bash の tar（GNU）は zip を読めないので、場所を指定する
  const tar = process.platform === "win32" ? `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\tar.exe` : "unzip";
  const args = process.platform === "win32" ? ["-xf", ZIP, "-C", WORK] : ["-q", ZIP, "-d", WORK];
  execFileSync(tar, args, { stdio: "inherit" });
  shp = findShp();
  if (!shp) throw new Error("展開した中に N03-*.shp がありません");
}
console.log(`形：${shp.replace(ROOT, "")}`);

// --- 2. mapshaper で都道府県ごとにまとめて簡略化 ---
// encoding：N03 の Shapefile の属性は Shift_JIS ではなく UTF-8（.cpg に書いてある）。mapshaper は .cpg を読む
await mapshaper.runCommands(
  [
    `-i "${shp}" snap`,
    `-filter "N03_001 != null && N03_001 !== ''"`,
    `-simplify ${SIMPLIFY} weighted keep-shapes`,
    `-dissolve N03_001`,
    `-filter-islands min-area=${MIN_ISLAND_KM2}km2`,
    `-filter-slivers`,
    `-o "${DISSOLVED}" format=geojson precision=${PRECISION}`,
  ].join(" "),
);

// --- 3. 人口を結合 ---
type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: unknown };
const fc = JSON.parse(readFileSync(DISSOLVED, "utf8")) as { type: string; features: Feature[] };
const pops = new Map(readCsv(POP_CSV).map((r) => [r.pref_name, r]));
const num = (s: string | undefined) => (s === undefined || s === "" ? null : Number(s));
const rate = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round(((b - a) / a) * 1000) / 10);

const seen = new Set<string>();
const features = fc.features.map((f) => {
  const name = String(f.properties.N03_001);
  const p = pops.get(name);
  if (!p) throw new Error(`prefectures_pop.csv に「${name}」がありません`);
  if (seen.has(name)) throw new Error(`「${name}」が2つあります（dissolve の結果を確かめる）`);
  seen.add(name);
  const [p40, p45, p50] = [num(p.pop1940), num(p.pop1945), num(p.pop1950)];
  return {
    type: "Feature" as const,
    properties: {
      pref_code: p.pref_code,
      pref_name: name,
      pop1940: p40,
      pop1945: p45,
      pop1950: p50,
      rate1945: rate(p40, p45),
      rate1950: rate(p40, p50),
    },
    geometry: f.geometry,
  };
});
const missing = [...pops.keys()].filter((n) => !seen.has(n));
if (missing.length) throw new Error(`形が無い都道府県：${missing.join("・")}`);
features.sort((a, b) => a.properties.pref_code.localeCompare(b.properties.pref_code));

const out = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync(OUT, out, "utf8");
console.log(`public/data/prefectures.geojson：${features.length} 都道府県、${(Buffer.byteLength(out) / 1024).toFixed(0)} KB（簡略化 ${SIMPLIFY}）`);
