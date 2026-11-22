// 画面の組み立て。9つの年（frames.ts）ごとに、人口上位30の都市を柱で見せる。
// - 背景地図（Re:Earth Papers）の上に、人口に比例した高さの柱（pillars.ts）。年を送ると柱が伸び縮みする（アニメーションは ON・OFF できる）
// - 上位30の柱には、人口と当時の名前、（今の名前）のラベル（labels.ts）
// - 画面の左に年表（timeline.ts）：年・和暦・出来事の一言・日本の総人口。クリックでその年へ
// - 画面の下に ◀ ▶、今の年と総人口、出典の一行（controls.ts）。左下とⓘにクレジット（credits.ts）
// - 画面の右に、開閉式の一覧（rankList.ts）：今の年の上位30と外れた柱を表で出す
// - 開くとスタート画面（intro.ts）。「はじめる」で遠くから日本へ寄り、柱が0から伸びる。右上の「？」で開き直せる
// - 1925年は、1932年に東京市に入る町を東京の柱に積む（stack.ts）
// - タッチパッドのピンチでページ全体が拡大されないようにする（地図のカメラだけが動く）
//
// 一時的な確認用の URL パラメータ
//   ?year=1886   … 最初に開く年（既定は1886年）
//   ?camera=naha … frames.ts の DEBUG_CAMERAS のカメラで開く
//   例：http://localhost:8080/?year=1886&camera=naha （那覇・首里の重なりを見る）
//   例：http://localhost:8080/?year=1925&camera=tokyo （1925年の東京まわりの町の柱を見る）
//   ?intro=0     … スタート画面を出さずに開く（デモ用）
//   ?ui=0        … スクリーンショット用。年表・下のパネル・左下のクレジット・ⓘ を隠す（柱とラベルは出す）
//   例：http://localhost:8080/?year=2025&ui=0 （Navara のショーケース用に、1000×1000 程度の正方形で撮る）
//   ※ ?ui=0 で撮った画像を載せるときは、地図と柱の位置のクレジット（Re:Earth Papers / © OpenStreetMap contributors、国土地理院）を
//     画像のそばに書くこと（OpenStreetMap の ODbL と国土地理院のコンテンツ利用規約が出典の表示を求めている）
//     README には書かない（スクリーンショット専用のため）

import ThreeView, { Color, type CameraPosition } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";
import { OverlayPlugin, TileJsonPlugin } from "@navaramap/three-plugins";

import { Tween } from "./animation.ts";
import { DEBUG_CAMERAS, FRAMES, JAPAN_CAMERA } from "./frames.ts";
import { loadCities, loadDummy, valuesForYear } from "./cities.ts";
import {
  ANIMATION_MS,
  BASEMAP_TILEJSON,
  CHANGE_BLOOM_RADIUS,
  CHANGE_BLOOM_STRENGTH,
  CHANGE_GLOW_COLOR,
  CHANGE_GLOW_INTENSITY,
  CHANGE_IN_PILLAR_COLOR,
  CHANGE_OUT_OPACITY,
  CHANGE_OUT_PILLAR_COLOR,
  CITIES_URL,
  DUMMY_URL,
  HEIGHT_PER_PERSON,
  INTRO_FAR_DISTANCE,
  INTRO_MS,
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
  SELECT_DISTANCE_PER_HEIGHT,
  SELECT_MIN_DISTANCE,
  SELECT_OUTLINE_COLOR,
  SELECT_OUTLINE_THICKNESS,
  SELECT_PITCH,
  TOP_N,
  AMBIENT_INTENSITY,
  SUN_DATE,
  SUN_INTENSITY,
} from "./constants.ts";
import { topChanges } from "./changes.ts";
import { Controls, loadAnimationSetting } from "./controls.ts";
import { addCredits } from "./credits.ts";
import { formatNationalPopulation, nowNameForLabel } from "./format.ts";
import { Intro, introHidden } from "./intro.ts";
import { formatPopulation, PillarLabels, type LabelItem } from "./labels.ts";
import { RankList, type OutRow, type RankChange, type RankRow } from "./rankList.ts";
import { layoutPillars } from "./layout.ts";
import { lerpStates, Pillars, targetStates, type HighlightStyle, type PillarState } from "./pillars.ts";
import { checkTopRanks, stackTowns } from "./stack.ts";
import { Timeline } from "./timeline.ts";

const params = new URLSearchParams(location.search);
// ?ui=0：UI を隠す（スクリーンショット用）。index.html の .ui-hidden の CSS で消す
if (params.get("ui") === "0") document.body.classList.add("ui-hidden");
const startIndex = Math.max(0, FRAMES.findIndex((f) => String(f.year) === params.get("year")));
const startCamera: CameraPosition = DEBUG_CAMERAS[params.get("camera") ?? ""] ?? JAPAN_CAMERA;

// --- 初期化（プラグインは init の前に全部足す） ---
const container = document.getElementById("main")!;
// スタート画面（src/intro.ts）。地図の読み込み中の黒い画面も隠すので、地図より先に出す。
// 毎回出す。「次から表示しない」にチェックした人、?intro=0、?ui=0 のときは出さない
const showIntro = params.get("ui") !== "0" && params.get("intro") !== "0" && !introHidden();
const intro = new Intro(container);
if (showIntro) intro.open(() => startIntro());
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
// スタート画面を出すときは、遠くから始める（「はじめる」で startCamera へ寄る）
view.setCamera(showIntro ? { ...startCamera, distance: INTRO_FAR_DISTANCE } : startCamera);

// --- 光：柱の面ごとに明るさを変える（constants.ts の PILLAR_LIT）。太陽の向きは日時から決まるので固定する ---
// 2026-11-23 に3D地形はやめた（開いてから地図が出るまでが遅くなったため。yyamaの指示）。背景地図は光の影響を受けない
view.atmosphere.date = SUN_DATE;
view.addLight({ sun: { castShadow: false, intensity: SUN_INTENSITY } });
view.addLight({ ambient: { intensity: AMBIENT_INTENSITY } });

// --- 背景地図 ---
const basemap = await tilejson.addSource({ type: "raster-tile", url: BASEMAP_TILEJSON });
view.addLayer({ type: "raster", source: basemap });

// --- 上位30の入れ替わりの見せ方（src/changes.ts）：入った柱はオレンジにして光らせ、外れた柱は赤紫の半透明にする ---
// 光は Navara の SelectiveBloom。柱ごとに box.effectIds でこの id を指定した柱だけにかかる
const highlightStyle: HighlightStyle = {
  glowEffectId: "change-glow",
  glowColor: CHANGE_GLOW_COLOR,
  glowIntensity: CHANGE_GLOW_INTENSITY,
  inColor: CHANGE_IN_PILLAR_COLOR,
  outColor: CHANGE_OUT_PILLAR_COLOR,
  outOpacity: CHANGE_OUT_OPACITY,
  selectEffectId: "select-outline",
};
view.addEffect({ id: highlightStyle.glowEffectId, selectiveBloom: { strength: CHANGE_BLOOM_STRENGTH, radius: CHANGE_BLOOM_RADIUS, threshold: 0 } });
// 一覧で選んだ柱の紺の輪郭（Navara の SelectiveOutline）。柱に寄ったときだけ付ける（constants.ts の SELECT_OUTLINE_*）
view.addEffect({ id: highlightStyle.selectEffectId, selectiveOutline: { color: new Color().setStyle(SELECT_OUTLINE_COLOR), thickness: SELECT_OUTLINE_THICKNESS } });

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

// 町を積んだ年は、画面用に順位を付け直している（src/stack.ts の rerank）。1〜30位がちょうど1つずつあるかを確かめ、崩れていたら知らせる
// （cities.json に入っている都市の範囲が足りないと崩れる）
FRAMES.forEach((f, i) => {
  if (!f.stackInto?.length) return;
  const problem = checkTopRanks(stackedFor(i).values, TOP_N);
  if (problem) console.warn(`[japan-top30-cities-navara] ${f.year}年：町を積んだあとの順位が崩れている（${problem}）`);
});

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
// 画面の右の一覧：今の年の上位30を表で出す（src/rankList.ts）。最初は閉じている
const rankList = new RankList(container, { onSelect: (id) => selectPillar(id), onHome: () => goHome() });

function frameValues(i: number) {
  return stackedFor(i).values;
}

function statesFor(i: number): Map<string, PillarState> {
  const { values, stacked } = stackedFor(i);
  return targetStates(data.cities, placed, values, FRAMES[i].year, style, stacked);
}

/** TOP_N 位以内で、柱が立っているものだけにラベルを付ける。一覧で選んだ柱は、上位30の外でも付ける */
function labelItemsFor(i: number, states: Map<string, PillarState>): LabelItem[] {
  const items: LabelItem[] = [];
  for (const [id, v] of frameValues(i)) {
    const s = states.get(id);
    const isSelected = id === selectedId;
    if (!s || s.height <= 0 || ((v.rank == null || v.rank > TOP_N) && !isSelected)) continue;
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
      priority: isSelected ? Infinity : v.pop, // 重なったら人口の小さい方を隠す。選んだ柱は隠さない
      selected: isSelected,
    });
  }
  return items;
}

/** i 番目のコマの、1つ前の年からの入れ替わり（1886年は無し） */
function changesFor(i: number) {
  return topChanges(data.cities, i > 0 ? frameValues(i - 1) : null, frameValues(i), FRAMES[i].year, TOP_N);
}

/** 一覧に出す名前：ラベルと同じ書き方。町を積んだ柱は「東京市（4町を含む）」 */
function listNames(i: number, id: string, stacked: Map<string, string>) {
  const city = cityById.get(id);
  const nameThen = city?.name[String(FRAMES[i].year)] ?? id;
  const towns = [...stacked.values()].filter((into) => into === id).length;
  return {
    name: towns > 0 ? `${nameThen}（${towns}町を含む）` : nameThen,
    nameNow: nowNameForLabel(nameThen, city?.name_now ?? null, LABEL_NOW_DISPLAY),
  };
}

/**
 * 一覧の行（src/rankList.ts）。順位と人口は画面と同じ値（積んで順位を付け直したあと）。
 * 前の年からの変化：前の年も上位30なら順位の上下、それ以外（31位より下・値が無い）は「新」。31位より下は年をまたいで比べられないため
 */
function rankRowsFor(i: number): { rows: RankRow[]; outRows: OutRow[] } {
  const { values, stacked } = stackedFor(i);
  const prev = i > 0 ? frameValues(i - 1) : null;
  const rows: RankRow[] = [];
  for (const [id, v] of values) {
    if (v.rank == null || v.rank > TOP_N) continue;
    let change: RankChange = null;
    if (prev) {
      const p = prev.get(id)?.rank;
      if (p != null && p <= TOP_N) change = p === v.rank ? { kind: "same", by: 0 } : { kind: p > v.rank ? "up" : "down", by: Math.abs(p - v.rank) };
      else change = { kind: "new" };
    }
    rows.push({ id, rank: v.rank, pop: v.pop, change, ...listNames(i, id, stacked) });
  }
  rows.sort((a, b) => a.rank - b.rank);
  const outRows: OutRow[] = [...changesFor(i)]
    .filter(([, c]) => c === "out")
    .map(([id]) => ({ id, rank: values.get(id)?.rank ?? null, pop: values.get(id)!.pop, ...listNames(i, id, stacked) }))
    .sort((a, b) => b.pop - a.pop);
  return { rows, outRows };
}

function showControls(i: number): void {
  const usesDummy = [...frameValues(i).values()].some((v) => v.dummy);
  const changes = changesFor(i);
  const count = (k: "in" | "out") => [...changes.values()].filter((c) => c === k).length;
  controls.show(FRAMES, i, usesDummy, totalFor(FRAMES[i].year), i > 0 ? { in: count("in"), out: count("out"), prevYear: FRAMES[i - 1].year } : null);
  timeline.show(i);
  rankList.show({ year: FRAMES[i].year, prevYear: i > 0 ? FRAMES[i - 1].year : null, source: FRAMES[i].source, ...rankRowsFor(i) });
}

// --- 一覧で選んだ柱（src/rankList.ts） ---
// 行を選ぶと、その柱に寄って紺の輪郭とラベルの枠で目立たせる。年を送っても選んだまま、カメラも留まる（2026-11-23 yyamaが案Aを選んだ）。
// 送った先の年に柱が立っていなければ（合併で無くなった、値が無い）選んだ状態を外す。「全国に戻る」で開いたときのカメラに戻る
let selectedId: string | null = null;

/** カメラを動かす。アニメーションが ON なら flyTo、OFF なら setCamera */
function moveCamera(camera: CameraPosition): void {
  if (animationOn) void view.flyTo(camera as Parameters<typeof view.flyTo>[0], { duration: ANIMATION_MS });
  else view.setCamera(camera);
}

function setSelection(id: string | null): void {
  selectedId = id;
  pillars.setSelected(id, highlightStyle);
  rankList.setSelected(id);
  if (!tween.isRunning) labels.set(labelItemsFor(index, current));
}

function selectPillar(id: string): void {
  const s = current.get(id);
  if (!s || s.height <= 0) return;
  setSelection(id);
  // 柱の高さが画面に収まる距離で、柱の中ほどを見る
  moveCamera({ lng: s.lon, lat: s.lat, height: s.height * 0.4, distance: Math.max(SELECT_MIN_DISTANCE, s.height * SELECT_DISTANCE_PER_HEIGHT), heading: 0, pitch: SELECT_PITCH, roll: 0 });
}

function goHome(): void {
  setSelection(null);
  moveCamera(JAPAN_CAMERA);
}

// --- 最初のコマ ---
let index = startIndex;
let current = statesFor(index);
/** 柱の高さを0にした状態（スタート画面のあと、ここから伸ばす） */
const flat = (states: Map<string, PillarState>) => new Map([...states].map(([id, s]) => [id, { ...s, height: 0 }]));
if (showIntro) {
  pillars.apply(flat(current)); // スタート画面の後ろでは柱を立てない
} else {
  pillars.apply(current);
  pillars.setHighlights(changesFor(index), highlightStyle);
  labels.set(labelItemsFor(index, current));
}
showControls(index);

/**
 * スタート画面の「はじめる」のあと：遠くから開いたときのカメラへ寄り、柱を0から伸ばす（案A）。
 * アニメーションが OFF なら、すぐにいつもの画面にする
 */
function startIntro(): void {
  const duration = animationOn ? INTRO_MS : 0;
  if (duration > 0) void view.flyTo(startCamera as Parameters<typeof view.flyTo>[0], { duration });
  else view.setCamera(startCamera);
  const from = flat(current);
  const to = current;
  tween.start(
    duration,
    (t) => pillars.apply(t >= 1 ? to : lerpStates(from, to, t), t >= 1),
    () => {
      pillars.setHighlights(changesFor(index), highlightStyle);
      labels.set(labelItemsFor(index, current));
    },
  );
}

/** i 番目のコマへ送る。動いている途中なら、先に最後の状態にしてから送る */
function go(i: number): void {
  tween.finish();
  if (i < 0 || i >= FRAMES.length || i === index) return;
  const from = current;
  const to = statesFor(i);
  index = i;
  showControls(i);
  labels.set([]); // 動いている間はラベルを消す
  pillars.setHighlights(new Map(), highlightStyle); // 入れ替わりの色と光も、動いている間は消す

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
      // 選んだ柱がこの年に立っていなければ、選んだ状態を外す（カメラはそのまま）
      if (selectedId && !((to.get(selectedId)?.height ?? 0) > 0)) setSelection(null);
      pillars.setHighlights(changesFor(i), highlightStyle);
      labels.set(labelItemsFor(i, to));
    },
  );
}

intro.setReady();
console.info(`[japan-top30-cities-navara] 柱 ${placed.size} 本、コマ ${FRAMES.length}、最初は ${FRAMES[index].year} 年`);
