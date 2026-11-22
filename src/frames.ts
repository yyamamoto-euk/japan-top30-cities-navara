// コマ（年）の定義。画面下の ◀ ▶ と、画面の左の年表（src/timeline.ts）で年を送る。
// 2026-11-22：問いと章立てをやめ、シンプルな「数字の可視化」にした（yyamaの指示）。

import type { CameraPosition } from "@navaramap/three";

/**
 * 日本全体を斜めから見下ろすカメラ。開いたときの最初の位置。仮置き。
 * 2026-11-22 に「北が上で引く」位置（pitch -80）にしたが、yyamaの指示で元に戻した。
 * lng/lat はカメラの真下ではなく、見る先の点。distance はその点からカメラまでの距離（m）。
 */
export const JAPAN_CAMERA: CameraPosition = {
  lng: 136.0,
  lat: 33.0,
  height: 0,
  distance: 3_200_000,
  heading: 0,
  pitch: -50,
  roll: 0,
};

export type Frame = {
  year: number;
  /** 和暦（年表に小さく出す） */
  era: string;
  /** その年の出来事の一言（年表に出す）。私の下書き（2026-11-22）。yyamaが直す。\n で改行できる（年表の CSS が white-space: pre-line） */
  event: string;
  /**
   * その年の出典（画面に小さく出す）。sources.csv の資料名からの下書き（2026-11-22）。書き直してよい。
   * 上位30の柱が使っている出典を書く（どの柱がどの出典かは pnpm data:spot-check で見られる）
   */
  source: string;
  /**
   * このコマで移るカメラ。省略したら今のカメラのまま（マウスで動かした位置を保つ）。
   * 年ごとに見せる場所を変えたいときだけ指定する（今はどのコマも指定していない）
   */
  camera?: CameraPosition;
  /**
   * このコマで「積む」柱。あとでこの柱に吸収される町の人口を、この柱に足して1本で見せる（src/stack.ts）。
   * 積んだ町は、この柱の位置で高さ 0 になる
   */
  stackInto?: readonly string[];
};

/** コマの並び。約25年おき（2026-11-22 に 1908年・2000年を足した） */
export const FRAMES: Frame[] = [
  { year: 1886, era: "明治19年", event: "市制の施行（1889年）の3年前", source: "出典：第7回 日本帝国統計年鑑 第24表（明治19年末の現住人員）" },
  { year: 1908, era: "明治41年", event: "日露戦争の3年後", source: "出典：第31回・第33回 日本帝国統計年鑑（明治41年末の現住人口）" },
  // 1932年に東京市に入る町（今のデータでは渋谷町・西巣鴨町・滝野川町・平塚町）を東京の柱に積む（2026-11-22）
  { year: 1925, era: "大正14年", event: "関東大震災の2年後", source: "出典：第47回 日本帝国統計年鑑 表13・表14（大正14年 国勢調査）", stackInto: ["tokyo"] },
  { year: 1940, era: "昭和15年", event: "太平洋戦争が始まる前の年", source: "出典：日本統計年鑑（1949年刊）表27（昭和15年 国勢調査）、札幌・呉は各市の統計書" },
  // 1945年の一言の根拠（2026-11-22）
  // - 東京の人口は1940年の半分以下：東京都 7,355千人 → 3,488千人（47.4%。data/prefectures_pop.csv、第75回 日本統計年鑑 表2-3）、
  //   東京の柱 東京市35区 6,778,804 → 区部 2,777,010（41.0%。data/observations.csv、日本統計年鑑 1949年刊 表27。1940年の値は原本の印刷の誤りを直したもの）。
  //   1940年は10月1日の国勢調査、1945年は11月1日の人口調査
  // - 疎開と空襲が減った理由であることの出典：
  //   総務省「東京都における戦災の状況（東京）」 https://www.soumu.go.jp/main_sosiki/daijinkanbou/sensai/situation/state/kanto_11.html （学童疎開・建物疎開、空襲122回）
  //   国立国会図書館「空襲対策緊急強化要綱」（昭和20年1月19日閣議決定） https://ndlsearch.ndl.go.jp/rnavi/db/cabinet/s20/bib00595 （東京から150万人の地方転出を目標）
  { year: 1945, era: "昭和20年", event: "終戦の約2か月半後（11月1日）。\n疎開と空襲で東京の人口は半分以下に",source: "出典：日本統計年鑑（1949年刊）表27（昭和20年11月 人口調査）、札幌・呉は各市の統計書" },
  { year: 1950, era: "昭和25年", event: "朝鮮戦争が始まった年", source: "出典：日本統計年鑑（1951年刊）表10（昭和25年 国勢調査）、札幌・呉は各市の統計書" },
  { year: 1975, era: "昭和50年", event: "第1次石油危機の2年後", source: "出典：昭和50年国勢調査報告 表14" },
  { year: 2000, era: "平成12年", event: "平成の大合併が本格化する前", source: "出典：平成12年国勢調査 都道府県結果 表1（e-Stat）" },
  { year: 2025, era: "令和7年", event: "最新の国勢調査", source: "出典：令和7年国勢調査 人口等基本集計（総務省統計局）" },
];

/** 一時的なカメラ。開発サーバーの URL に ?camera=（名前） を付けて開く */
export const DEBUG_CAMERAS: Record<string, CameraPosition> = {
  /**
   * 那覇・首里付近の拡大（docs/coordinates.md「T2 で確認すること」）。
   * 使い方：?year=1886&camera=naha
   */
  naha: {
    lng: 127.7,
    lat: 26.215,
    height: 0,
    distance: 60_000,
    heading: 0,
    pitch: -35,
    roll: 0,
  },
  /**
   * 東京まわりの拡大（docs/coordinates.md「T3 で確認すること」）。
   * 1925年に東京の柱のまわりに渋谷町・西巣鴨町・滝野川町・平塚町が固まるのを見る。
   * 使い方：?year=1925&camera=tokyo
   */
  tokyo: {
    lng: 139.73,
    lat: 35.7,
    height: 0,
    distance: 150_000,
    heading: 0,
    pitch: -45,
    roll: 0,
  },
};
