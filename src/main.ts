// 画面の組み立て。9つの年（frames.ts）ごとに、人口上位30の都市を柱で見せる。
// - 背景地図（Re:Earth Papers）の上に、人口に比例した高さの柱（pillars.ts）。年を送ると柱が伸び縮みする（アニメーションは ON・OFF できる）
// - 上位30の柱には、人口と当時の名前、（今の名前）のラベル（labels.ts）
// - 画面の左に年表（timeline.ts）：年・和暦・出来事の一言・日本の総人口。クリックでその年へ
// - 画面の下に ◀ ▶、今の年と総人口、出典の一行（controls.ts）。左下とⓘにクレジット（credits.ts）
// - 1925年は、1932年に東京市に入る町を東京の柱に積む（stack.ts）
// - タッチパッドのピンチでページ全体が拡大されないようにする（地図のカメラだけが動く）
//
// 一時的な確認用の URL パラメータ
//   ?year=1886   … 最初に開く年（既定は1886年）
//   ?camera=naha … frames.ts の DEBUG_CAMERAS のカメラで開く
//   例：http://localhost:8080/?year=1886&camera=naha （那覇・首里の重なりを見る）
//   例：http://localhost:8080/?year=1925&camera=tokyo （1925年の東京まわりの町の柱を見る）

import ThreeView, { type CameraPosition } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";
import { OverlayPlugin, TileJsonPlugin } from "@navaramap/three-plugins";

import { Tween } from "./animation.ts";
import { DEBUG_CAMERAS, FRAMES, JAPAN_CAMERA } from "./frames.ts";
import { loadCities, loadDummy, valuesForYear } from "./cities.ts";
import {
  ANIMATION_MS,
  BASEMAP_TILEJSON,
  CITIES_URL,
  DUMMY_URL,
  HEIGHT_PER_PERSON,
  LABEL_FONT_SIZE,
  LABEL_NAME_SCALE,
  LABEL_NOW_DISPLAY,
  LABEL_NOW_SCALE,
  LABEL_MAX_DISTANCE,
  LABEL_POSITION,
  OUTSIDE_OPACITY,
  PILLAR_COLOR,
  PILLAR_GAP,
  PILLAR_WIDTH,
  TOP_N,
} from "./constants.ts";
import { Controls, loadAnimationSetting } from "./controls.ts";
import { addCredits } from "./credits.ts";
import { formatNationalPopulation, nowNameForLabel } from "./format.ts";
import { formatPopulation, PillarLabels, type LabelItem } from "./labels.ts";
import { layoutPillars } from "./layout.ts";
import { lerpStates, Pillars, targetStates, type PillarState } from "./pillars.ts";
import { stackTowns } from "./stack.ts";
import { Timeline } from "./timeline.ts";

const params = new URLSearchParams(location.search);
const startIndex = Math.max(0, FRAMES.findIndex((f) => String(f.year) === params.get("year")));
const startCamera: CameraPosition = DEBUG_CAMERAS[params.get("camera") ?? ""] ?? JAPAN_CAMERA;

// --- 初期化（プラグインは init の前に全部足す） ---
const container = document.getElementById("main")!;
const view = new ThreeView<DefaultDescriptions>({ container });
view.addPlugin(new DefaultPlugin());
const tilejson = new TileJsonPlugin();
view.addPlugin(tilejson);
const overlay = new OverlayPlugin({ maxDistance: LABEL_MAX_DISTANCE });
view.addPlugin(overlay);
await view.init();
// タッチパッドのピンチでブラウザがページ全体を拡大しないようにする（2026-11-22）。
// ピンチはブラウザに「Ctrl を押しながらのホイール」として届く。既定の動き（ページの拡大）だけを止め、
// イベント自体は Navara に届くので、地図のカメラは今までどおり寄ったり引いたりする。
// Ctrl ＋ マウスホイールでのページの拡大も止まる（Ctrl ＋ ＋／− キーの拡大は効く）
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);
// 開発時だけ、ブラウザのコンソールから view を触れるようにする（確認用）
if (import.meta.env.DEV) Object.assign(window, { view });

// --- カメラ：最初の位置に置く ---
// マウスでの移動・拡大縮小・傾きは効かせたままにする（2026-11-22 yyamaの指示）。
// 操作・体験設計はあとで見直す（SPEC.md の未決）。止めるときは次の1行を戻す：
// view.camera.options = { enableSpin: false, enableZoom: false, enableTilt: false };
view.setCamera(startCamera);

// --- 背景地図 ---
const basemap = await tilejson.addSource({ type: "raster-tile", url: BASEMAP_TILEJSON });
view.addLayer({ type: "raster", source: basemap });

// --- クレジット（左下の1行と ⓘ の中、src/credits.ts） ---
addCredits(view, container);

// --- データ ---
const data = await loadCities(CITIES_URL);
const dummy = await loadDummy(DUMMY_URL);

/** i 番目のコマで画面に出す値。stackInto のあるコマは、町を積んだあとの値（src/stack.ts） */
function stackedFor(i: number) {
  const f = FRAMES[i];
  return stackTowns(data.cities, valuesForYear(data, dummy, f.year), f.year, f.stackInto ?? []);
}

// 描く位置：重ならないように全年の柱をまとめてずらした位置（データの座標は変えない）。
// 積んだ町はその年に別の柱として立たないので、その年の値を外してから計算する
const layoutCities = data.cities.map((c) => {
  const pop = { ...c.pop };
  FRAMES.forEach((f, i) => {
    if (stackedFor(i).stacked.has(c.id)) delete pop[String(f.year)];
  });
  return { ...c, pop };
});
const placed = layoutPillars(layoutCities, PILLAR_WIDTH, PILLAR_GAP);
const style = {
  heightPerPerson: HEIGHT_PER_PERSON,
  width: PILLAR_WIDTH,
  topN: TOP_N,
  outsideOpacity: OUTSIDE_OPACITY,
};

// --- 柱・ラベル・ボタン ---
const pillars = new Pillars(view, placed.keys(), PILLAR_WIDTH, PILLAR_COLOR);
const labels = new PillarLabels(view, overlay, container, LABEL_POSITION, LABEL_FONT_SIZE, LABEL_NAME_SCALE, LABEL_NOW_SCALE);
const cityById = new Map(data.cities.map((c) => [c.id, c]));
const tween = new Tween();
let animationOn = loadAnimationSetting();
const controls = new Controls(
  container,
  {
    onPrev: () => go(index - 1),
    onNext: () => go(index + 1),
    onAnimationChange: (on) => {
      animationOn = on;
    },
  },
  animationOn,
);
// 画面の左の年表。年をクリックするとその年へ（src/timeline.ts）
/** 年 → 日本の総人口の表示（cities.json の national）。無い年は null */
function totalFor(year: number): string | null {
  const n = data.national?.[String(year)];
  return n ? formatNationalPopulation(n.pop) : null;
}
const timeline = new Timeline(container, FRAMES, totalFor, (i) => go(i));

function frameValues(i: number) {
  return stackedFor(i).values;
}

function statesFor(i: number): Map<string, PillarState> {
  const { values, stacked } = stackedFor(i);
  return targetStates(data.cities, placed, values, FRAMES[i].year, style, stacked);
}

/** TOP_N 位以内で、柱が立っているものだけにラベルを付ける */
function labelItemsFor(i: number, states: Map<string, PillarState>): LabelItem[] {
  const items: LabelItem[] = [];
  for (const [id, v] of frameValues(i)) {
    const s = states.get(id);
    if (!s || s.height <= 0 || v.rank == null || v.rank > TOP_N) continue;
    const city = cityById.get(id);
    const nameThen = city?.name[String(FRAMES[i].year)] ?? "";
    items.push({
      id,
      lon: s.lon,
      lat: s.lat,
      alt: LABEL_POSITION === "top" ? s.height : 0,
      text: formatPopulation(v.pop),
      name: nameThen,
      nameNow: nowNameForLabel(nameThen, city?.name_now ?? null, LABEL_NOW_DISPLAY),
      priority: v.pop, // 重なったら人口の小さい方を隠す
    });
  }
  return items;
}

function showControls(i: number): void {
  const usesDummy = [...frameValues(i).values()].some((v) => v.dummy);
  controls.show(FRAMES, i, usesDummy, totalFor(FRAMES[i].year));
  timeline.show(i);
}

// --- 最初のコマ ---
let index = startIndex;
let current = statesFor(index);
pillars.apply(current);
labels.set(labelItemsFor(index, current));
showControls(index);

/** i 番目のコマへ送る。動いている途中なら、先に最後の状態にしてから送る */
function go(i: number): void {
  tween.finish();
  if (i < 0 || i >= FRAMES.length || i === index) return;
  const from = current;
  const to = statesFor(i);
  index = i;
  showControls(i);
  labels.set([]); // 動いている間はラベルを消す

  const duration = animationOn ? ANIMATION_MS : 0;
  const camera = FRAMES[i].camera;
  if (camera) {
    if (duration > 0) void view.flyTo(camera as Parameters<typeof view.flyTo>[0], { duration });
    else view.setCamera(camera);
  }

  tween.start(
    duration,
    (t) => pillars.apply(t >= 1 ? to : lerpStates(from, to, t), t >= 1),
    () => {
      current = to;
      labels.set(labelItemsFor(i, to));
    },
  );
}

console.info(`[jinko-bunpu] 柱 ${placed.size} 本、コマ ${FRAMES.length}、最初は ${FRAMES[index].year} 年`);
