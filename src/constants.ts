// 見た目に関わる定数。値はyyamaがスクショを見て決める（T2 の時点では仮置き）。

import type { AttributionItem } from "@navaramap/three";

/**
 * 柱の高さの係数（メートル／人）。高さ = 人口 × HEIGHT_PER_PERSON。全年次で共通。
 *
 * 初期値の決め方（TASKS.md T2）：特別区部の柱が「日本列島の長さ」の4分の1くらいになる値。
 * 「日本列島の長さ」は、柱の座標のうちいちばん離れた2点（札幌–那覇、約2,246km）の距離とした。
 * 2,246,000 m ÷ 4 ÷ 9,944,109 人（2025年の特別区部）≒ 0.0565 m/人。特別区部の柱は約560km。
 */
export const HEIGHT_PER_PERSON = 0.0565;

/** 柱の幅（メートル）。全柱で共通。仮置き。2026-11-22 に 20km から半分にした（yyamaの指示） */
export const PILLAR_WIDTH = 10_000;

/**
 * 近い柱どうしのすき間（メートル）。仮置き。
 * 中心どうしが PILLAR_WIDTH + PILLAR_GAP より近い柱は、描く位置を自動でずらす（src/layout.ts）
 */
export const PILLAR_GAP = 1_500; // 2026-11-22 に柱の幅と一緒に半分にした（3km → 1.5km）

/** 柱の色。仮置き */
export const PILLAR_COLOR = "#2f6fd6";

/**
 * 柱に光を当てるか。true なら太陽の光で面ごとに明るさが変わり、細い柱でも箱の形と隣の柱との境目が見える（2026-11-22 yyamaの指示で試す）。
 * 光は main.ts の太陽の光と全体を明るくする光（SUN_INTENSITY・AMBIENT_INTENSITY）。false に戻すと、どの面も同じ色になる
 */
export const PILLAR_LIT = true;

/** 圏外（TOP_N 位より下）の柱の不透明度。0 = 見えない、1 = 不透明。仮置き */
export const OUTSIDE_OPACITY = 0.35;

/**
 * 上位30の入れ替わりの見せ方（src/changes.ts、2026-11-22）。どれも仮置き（yyama が見て決める）。
 * 入った柱：柱の色はそのままで、暖かい黄色の光をまとわせる（Navara の SelectiveBloom）
 * 外れた柱：その年は赤紫の不透明で描く（CHANGE_OUT_PILLAR_COLOR）
 */
export const CHANGE_GLOW_COLOR = "#ffa000";
/**
 * 入った柱の色。null なら柱の色（青）のまま光だけを足す。
 * 光は柱の色に足し合わされるので、青のまま強く光らせると白っぽくなり、弱いと明るい地図の上で見えにくい。
 * そのため、入った柱は色そのものを変え、光は軽く添える（2026-11-22 の試作）
 */
export const CHANGE_IN_PILLAR_COLOR: string | null = "#f08a00";
/** 柱が出す光の強さ（emissiveIntensity） */
export const CHANGE_GLOW_INTENSITY = 0.25;
/** 光のにじみ（SelectiveBloom の strength・radius） */
export const CHANGE_BLOOM_STRENGTH = 1.5;
export const CHANGE_BLOOM_RADIUS = 0.7;
/**
 * 外れた柱の色（不透明で描く）。2026-11-22 yyamaの指示で、紺の輪郭（SelectiveOutline）から変えた。輪郭の太さは画面上で固定なので、
 * 引くと細い柱が輪郭に覆われて潰れたため。灰色は分かりにくかった。
 * 赤紫は、柱の青（PILLAR_COLOR）とも入った柱のオレンジとも、色覚の違いがあっても見分けやすい（dataviz の検証スクリプトで確かめた。
 * 背景は海の色に近い #cfe6e3。いちばん近い組み合わせは青と ΔE 15.5（1型色覚）。赤 #c62828 はオレンジと近く、紫 #7b3fb5 は青と近かった）
 */
export const CHANGE_OUT_PILLAR_COLOR = "#c2307a";

/** 年を送ったときのアニメーションの長さ（ミリ秒）。ON のとき使う */
export const ANIMATION_MS = 1500;

/**
 * 背景地図（Re:Earth Papers の TileJSON）。TASKS.md の指定は protomaps-light。
 * papers-light に変えるなら …/styles/papers-light/tilejson.json
 */
export const BASEMAP_TILEJSON = "https://papers.reearth.land/styles/protomaps-light/tilejson.json";

/**
 * 3D地形（Re:Earth Terrain の quantized-mesh）。2026-11-22 yyamaの指示でON。
 * 利用条件と出典の書き方は https://terrain.reearth.land/
 */
export const TERRAIN_URL = "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain";

/**
 * 地形の高さの強調（倍）。1 は実物どおり。
 * 2026-11-22 にいったん10倍にしたが、yyamaの指示で実物どおりに戻した（日本全体を見るカメラでは起伏はほぼ見えず、寄ると見える）。
 * 1 でないときは、画面のクレジット（CREDIT_LINE・CREDIT_ITEMS）に「高さは○倍に強調」と出る
 */
export const TERRAIN_EXAGGERATION = 1;

/** クレジットに足す、高さを強調していることの断り。実物どおり（1倍）なら無し */
const TERRAIN_EXAGGERATION_NOTE = TERRAIN_EXAGGERATION === 1 ? null : `高さは${TERRAIN_EXAGGERATION}倍に強調`;

/**
 * 地形の陰影を付ける太陽の日時。Navara は太陽の向きを日時から決めるので、開く時刻で日本が夜にならないよう固定する。
 * 2025年10月1日 午前10時（日本時間）。南東から光が当たる。仮置き
 */
export const SUN_DATE = new Date("2025-10-01T01:00:00Z");

/** 太陽の光と、全体を明るくする光の強さ。背景地図の色が暗くなりすぎないように合わせる。仮置き */
export const SUN_INTENSITY = 1;
export const AMBIENT_INTENSITY = 1;

/** 人口ラベルを柱のどこに付けるか。"top" = 柱の頭、"bottom" = 根元 */
export const LABEL_POSITION: "top" | "bottom" = "top";

/** 人口ラベルの文字の大きさ（px）。仮置き */
export const LABEL_FONT_SIZE = 14;

/** ラベルの当時の名前の大きさ（人口の文字に対する倍率）。仮置き */
export const LABEL_NAME_SCALE = 0.8;

/** ラベルの2行目（今の名前）の大きさ（人口の文字に対する倍率）。仮置き */
export const LABEL_NOW_SCALE = 0.7;

/**
 * ラベルの（）に出す今の名前の置き換え（表示だけ。データの名前は変えない）。
 * 東京は「東京23区」（2026-11-22 yyamaの指示。データは「特別区部」）
 */
export const LABEL_NOW_DISPLAY: Record<string, string> = { 特別区部: "東京23区" };

/**
 * ラベルを出すカメラからの距離の上限（m）。OverlayPlugin の既定は 100km で、
 * 日本全体を見るカメラ（数千km）では何も出ないため広げる
 */
export const LABEL_MAX_DISTANCE = 20_000_000;

/** 柱のデータ（scripts/build-data.ts の出力）。GitHub Pages のサブパスでも読めるよう相対パスにする */
export const CITIES_URL = "data/cities.json";

/** テスト用の仮データ（scripts/build-dummy.ts の出力）。未収集の年を埋める */
export const DUMMY_URL = "data/dummy-cities.json";

/** 上位何位までを出すか */
export const TOP_N = 30;

/** 画面の左下に常に出すクレジット。1つの配列が「｜」で区切る1まとまり。リンクは { text, url } */
export const CREDIT_LINE: (string | { text: string; url: string })[][] = [
  [
    "地図：",
    { text: "Re:Earth Papers", url: "https://papers.reearth.land/attribution" },
    " / © ",
    { text: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
    " contributors",
  ],
  // 地形：Re:Earth Terrain の示す最低限の出典（https://terrain.reearth.land/ の Attribution。海の波の表現 water mask を使わないので Protomaps・OSM は要らない）。
  // 高さを強調するときは、そのことも書く（Mapterhorn は CC BY 4.0。描き方を変えたことが分かるように）
  [
    "地形：",
    { text: "Re:Earth Terrain", url: "https://terrain.reearth.land/" },
    " · ",
    { text: "Mapterhorn", url: "https://mapterhorn.com/" },
    TERRAIN_EXAGGERATION_NOTE ? `（CC BY 4.0）。${TERRAIN_EXAGGERATION_NOTE}` : "（CC BY 4.0）",
  ],
  // 柱の位置：OpenStreetMap の市役所の点（ODbL）と、OSM に無い市は電子国土基本図（地名情報）（国土地理院。地理院地図の地名検索で取得）。
  // 国土地理院コンテンツ利用規約に従い、加工したこと（をもとに作成）を書く
  ["柱の位置：© ", { text: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" }, " contributors（ODbL）、", { text: "電子国土基本図（地名情報）（国土地理院）", url: "https://www.gsi.go.jp/kibanjoho/kibanjoho40025.html" }, "をもとに作成"],
  ["人口：日本帝国統計年鑑・日本統計年鑑・国勢調査ほか（各年の出典）"],
];

/** Navara の ⓘ ボタンの中に足すクレジット（背景地図のクレジットは TileJsonPlugin が自動で入れる。地形のクレジットは自動では入らないので、ここで足す） */
export const CREDIT_ITEMS: AttributionItem[] = [
  {
    attribution: "地形",
    children: [
      { attribution: "<a href=\"https://terrain.reearth.land/\">Re:Earth Terrain</a> · <a href=\"https://mapterhorn.com/\">Mapterhorn</a>（CC BY 4.0）" },
      ...(TERRAIN_EXAGGERATION_NOTE ? [{ attribution: `${TERRAIN_EXAGGERATION_NOTE}して描いている` }] : []),
    ],
  },
  {
    attribution: "柱の位置",
    children: [
      { attribution: "OpenStreetMap の市役所の点：<a href=\"https://www.openstreetmap.org/copyright\">© OpenStreetMap contributors</a>（Open Database License 1.0）" },
      { attribution: "OpenStreetMap に無い市：<a href=\"https://www.gsi.go.jp/kibanjoho/kibanjoho40025.html\">電子国土基本図（地名情報）（国土地理院）</a>をもとに作成（地理院地図の地名検索で取得）" },
    ],
  },
  {
    attribution: "人口の統計",
    children: [
      { attribution: "日本帝国統計年鑑 第7回・第31回・第33回・第47回（内閣統計局）" },
      { attribution: "日本統計年鑑 1949年刊・1951年刊（総理庁統計局・総理府統計局）" },
      { attribution: "国勢調査 昭和50年・平成12年・令和7年（総務省統計局、e-Stat）" },
      { attribution: "札幌市統計書、呉市統計書" },
      { attribution: "統計年鑑の画像とテキスト：一橋大学経済研究所「日本統計年鑑・帝国統計年鑑」データベース" },
    ],
  },
];
