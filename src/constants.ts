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

/** 柱の幅（メートル）。全柱で共通。仮置き */
export const PILLAR_WIDTH = 20_000;

/**
 * 近い柱どうしのすき間（メートル）。仮置き。
 * 中心どうしが PILLAR_WIDTH + PILLAR_GAP より近い柱は、描く位置を自動でずらす（src/layout.ts）
 */
export const PILLAR_GAP = 3_000;

/** 柱の色。仮置き */
export const PILLAR_COLOR = "#2f6fd6";

/** 圏外（TOP_N 位より下）の柱の不透明度。0 = 見えない、1 = 不透明。仮置き */
export const OUTSIDE_OPACITY = 0.35;

/** 年を送ったときのアニメーションの長さ（ミリ秒）。ON のとき使う */
export const ANIMATION_MS = 1500;

/**
 * 背景地図（Re:Earth Papers の TileJSON）。TASKS.md の指定は protomaps-light。
 * papers-light に変えるなら …/styles/papers-light/tilejson.json
 */
export const BASEMAP_TILEJSON = "https://papers.reearth.land/styles/protomaps-light/tilejson.json";

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

/** 柱のデータ（scripts/build-data.ts の出力） */
export const CITIES_URL = "/data/cities.json";

/** テスト用の仮データ（scripts/build-dummy.ts の出力）。未収集の年を埋める */
export const DUMMY_URL = "/data/dummy-cities.json";

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
  // 国土数値情報の使用許諾条件（非商用）の書き方に合わせる：「国土数値情報（○○データ）（国土交通省）（ページの URL）をもとに作成」
  [{ text: "国土数値情報（市町村役場等及び公的集会施設データ）", url: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P34.html" }, "（国土交通省）をもとに作成"],
  ["人口：日本帝国統計年鑑・日本統計年鑑・国勢調査ほか（各年の出典）"],
];

/** Navara の ⓘ ボタンの中に足すクレジット（背景地図のクレジットは TileJsonPlugin が自動で入れる） */
export const CREDIT_ITEMS: AttributionItem[] = [
  {
    attribution: "国土数値情報（国土交通省）",
    attributionUrl: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P34.html",
    children: [
      { attribution: "国土数値情報（市町村役場等及び公的集会施設データ）（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P34.html）をもとに作成（柱の位置。2014年版）" },
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
