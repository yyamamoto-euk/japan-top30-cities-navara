// 柱の作成と更新。座標のある柱を最初に全部作り、年が変わったら高さ・透明度・位置を更新する。

import type ThreeView from "@navaramap/three";
import { Color, type MeshHandle } from "@navaramap/three";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";
import type { BoxMeshDesc } from "@navaramap/three-default-descs";

import type { Change } from "./changes.ts";
import type { City, YearValue } from "./cities.ts";
import { PILLAR_LIT } from "./constants.ts";
import type { PlacedPosition } from "./layout.ts";

/** 1本の柱の見た目 */
export type PillarState = {
  lon: number;
  lat: number;
  height: number; // m
  opacity: number; // 0〜1
};

export type PillarStyle = {
  heightPerPerson: number;
  width: number;
  topN: number;
  outsideOpacity: number;
};

/** 高さがこれ未満の柱は隠す（m） */
const MIN_VISIBLE_HEIGHT = 1;

/**
 * ある年の柱の見た目を決める。
 * - 値の無い柱は高さ 0
 * - TOP_N 位以内は不透明、圏外は outsideOpacity
 * - 吸収された柱（merged_year ≤ 年）は、吸収先の位置で高さ 0。
 *   アニメーションで、吸収先へ縮みながら寄るように見える
 * - 積んだ町（stacked：町の id → 積んだ先の id）も、積んだ先の位置で高さ 0
 */
export function targetStates(
  cities: City[],
  placed: Map<string, PlacedPosition>,
  values: Map<string, YearValue>,
  year: number,
  style: PillarStyle,
  stacked: Map<string, string> = new Map(),
): Map<string, PillarState> {
  const out = new Map<string, PillarState>();
  for (const c of cities) {
    const pos = placed.get(c.id);
    if (!pos) continue;
    const merged = c.merged_into !== null && c.merged_year !== null && c.merged_year <= year;
    const stackedInto = stacked.get(c.id);
    if (merged || stackedInto) {
      const into = placed.get(stackedInto ?? c.merged_into!) ?? pos;
      out.set(c.id, { lon: into.lon, lat: into.lat, height: 0, opacity: 1 });
      continue;
    }
    const v = values.get(c.id);
    const inTop = v?.rank != null && v.rank <= style.topN;
    out.set(c.id, {
      lon: pos.lon,
      lat: pos.lat,
      height: v ? v.pop * style.heightPerPerson : 0,
      opacity: inTop ? 1 : style.outsideOpacity,
    });
  }
  return out;
}

/** 2つの状態の間（t = 0〜1） */
export function lerpStates(
  from: Map<string, PillarState>,
  to: Map<string, PillarState>,
  t: number,
): Map<string, PillarState> {
  const out = new Map<string, PillarState>();
  for (const [id, b] of to) {
    const a = from.get(id) ?? b;
    out.set(id, {
      lon: a.lon + (b.lon - a.lon) * t,
      lat: a.lat + (b.lat - a.lat) * t,
      height: a.height + (b.height - a.height) * t,
      opacity: a.opacity + (b.opacity - a.opacity) * t,
    });
  }
  return out;
}

type Applied = PillarState & { visible: boolean };

/** まだ一度も入れていない柱の控え。どの値とも等しくならないので、立てるときに位置・高さ・透明度を必ず入れる */
const UNSET: Applied = { lon: NaN, lat: NaN, height: NaN, opacity: -1, visible: false };

/** 入れ替わりの見せ方（src/main.ts で Navara の効果を足したときの id と、光の色・強さ、外れた柱の色） */
export type HighlightStyle = {
  /** 入った柱に使う SelectiveBloom の効果の id */
  glowEffectId: string;
  glowColor: string;
  glowIntensity: number;
  /** 入った柱の色。null なら柱の色のまま */
  inColor: string | null;
  /** 外れた柱の色 */
  outColor: string;
  /** 外れた柱の不透明度（圏外の柱の普段の不透明度とは別に決める） */
  outOpacity: number;
  /** 一覧で選んだ柱に付ける SelectiveOutline の効果の id */
  selectEffectId: string;
};

export class Pillars {
  private handles = new Map<string, MeshHandle<BoxMeshDesc>>();
  private applied = new Map<string, Applied>();
  private highlighted = new Map<string, Change>();
  /** 一覧で選んだ柱（輪郭を付ける） */
  private selected: string | null = null;
  private baseColor: Color;

  constructor(
    view: ThreeView<DefaultDescriptions>,
    ids: Iterable<string>,
    private width: number,
    colorStyle: string,
  ) {
    const color = new Color().setStyle(colorStyle);
    this.baseColor = color;
    for (const id of ids) {
      const handle = view.addMesh<BoxMeshDesc>({
        // 1×1×1 の箱を scale で伸ばす（高さの更新を scale だけで済ませるため）
        box: { width: 1, height: 1, depth: 1, color, opacity: 1, transparent: false },
        geodetic: { lng: 0, lat: 0, height: 0 },
        scale: { x: width, y: 1, z: width },
        lit: PILLAR_LIT,
        visible: false,
      });
      this.handles.set(id, handle);
    }
  }

  /**
   * 入れ替わりの見せ方を付け外しする（src/changes.ts）。入った柱はオレンジにして光らせ、外れた柱は赤紫の半透明にする。
   * 前回と変わった柱だけを更新する。空の Map を渡すと全部外す（外れた柱は、apply で決めた透明度に戻す）
   */
  setHighlights(changes: Map<string, Change>, style: HighlightStyle): void {
    const glow = new Color().setStyle(style.glowColor);
    const ids = new Set([...this.highlighted.keys(), ...changes.keys()]);
    for (const id of ids) {
      const next = changes.get(id);
      if (this.highlighted.get(id) === next) continue;
      const handle = this.handles.get(id);
      if (!handle) continue;
      // 外れた柱は outOpacity にする。外すときは、apply で決めた透明度（圏外なら OUTSIDE_OPACITY）に戻す
      const opacity = next === "out" ? style.outOpacity : (this.applied.get(id)?.opacity ?? 1);
      const fade = { opacity, transparent: opacity < 0.999 };
      if (next === "in") {
        const color = style.inColor ? new Color().setStyle(style.inColor) : this.baseColor;
        handle.update({ box: { color, effectIds: this.effectIds(id, [style.glowEffectId], style), emissiveColor: glow, emissiveIntensity: style.glowIntensity, ...fade } });
      } else if (next === "out") {
        handle.update({ box: { color: new Color().setStyle(style.outColor), effectIds: this.effectIds(id, [], style), emissiveIntensity: 0, ...fade } });
      } else {
        handle.update({ box: { color: this.baseColor, effectIds: this.effectIds(id, [], style), emissiveIntensity: 0, ...fade } });
      }
      if (next) this.highlighted.set(id, next);
      else this.highlighted.delete(id);
    }
  }

  /** 柱に付ける効果の id。選んだ柱には輪郭を足す */
  private effectIds(id: string, base: string[], style: HighlightStyle): string[] {
    return this.selected === id ? [...base, style.selectEffectId] : base;
  }

  /**
   * 一覧で選んだ柱に輪郭（SelectiveOutline）を付ける。null で外す。
   * 入った柱の光（SelectiveBloom）とは別の効果なので、両方付く
   */
  setSelected(id: string | null, style: HighlightStyle): void {
    const before = this.selected;
    this.selected = id;
    for (const target of [before, id]) {
      if (!target) continue;
      const base = this.highlighted.get(target) === "in" ? [style.glowEffectId] : [];
      this.handles.get(target)?.update({ box: { effectIds: this.effectIds(target, base, style) } });
    }
  }

  /**
   * 状態を画面に反映する。前回と変わった項目だけを更新する。
   * final = true（アニメーションの最後や、アニメーション無しの切り替え）では、透明度も値どおりに合わせる
   */
  apply(states: Map<string, PillarState>, final = true): void {
    for (const [id, s] of states) {
      const handle = this.handles.get(id);
      if (!handle) continue;
      const prev = this.applied.get(id);
      const visible = s.height >= MIN_VISIBLE_HEIGHT && s.opacity > 0.01;
      if (!visible) {
        if (prev?.visible !== false) handle.update({ visible: false });
        // 隠すときは位置・高さ・透明度を入れないので、控えは「実際に入れた値」のままにする（まだ一度も入れていなければ未設定）。
        // 控えを s で書き換えると、あとで立てるときに位置を入れ直さず、柱が経度0・緯度0に立った（2026-11-25 に直した）
        this.applied.set(id, { ...(prev ?? UNSET), visible: false });
        continue;
      }
      const update: Parameters<typeof handle.update>[0] = {};
      if (!prev?.visible) update.visible = true;
      if (!prev || prev.lon !== s.lon || prev.lat !== s.lat) update.geodetic = { lng: s.lon, lat: s.lat, height: 0 };
      if (!prev || prev.height !== s.height) {
        // geodetic の座標系は Y が上。箱は中心が原点なので、高さの半分だけ持ち上げる
        update.scale = { x: this.width, y: s.height, z: this.width };
        update.position = { x: 0, y: s.height / 2, z: 0 };
      }
      // 透明度は、ある程度変わったときだけ更新する（マテリアルの更新は毎フレーム呼ぶと重い）。
      // 外れた柱の色にしている間は触らない（値だけ覚えておき、setHighlights で外すときに戻す）
      let opacity = prev?.opacity ?? -1;
      const diff = Math.abs(opacity - s.opacity);
      if (this.highlighted.get(id) === "out") {
        opacity = s.opacity;
      } else if (!prev || diff > 0.05 || (final && diff > 0)) {
        update.box = { opacity: s.opacity, transparent: s.opacity < 0.999 };
        opacity = s.opacity;
      }
      if (Object.keys(update).length > 0) handle.update(update);
      this.applied.set(id, { ...s, opacity, visible: true });
    }
  }
}
