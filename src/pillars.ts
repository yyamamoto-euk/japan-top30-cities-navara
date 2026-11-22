// 柱の作成と更新。座標のある柱を最初に全部作り、年が変わったら高さ・透明度・位置を更新する。

import type ThreeView from "@navaramap/three";
import { Color, type MeshHandle } from "@navaramap/three";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";
import type { BoxMeshDesc } from "@navaramap/three-default-descs";

import type { Change } from "./changes.ts";
import type { City, YearValue } from "./cities.ts";
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

type Applied = PillarState & { visible: boolean; ground: number };

/** 入れ替わりの見せ方（src/main.ts で Navara の効果を足したときの id と、光の色・強さ） */
export type HighlightStyle = {
  /** 入った柱に使う SelectiveBloom の効果の id */
  glowEffectId: string;
  glowColor: string;
  glowIntensity: number;
  /** 入った柱の色。null なら柱の色のまま */
  inColor: string | null;
  /** 外れた柱に使う SelectiveOutline の効果の id */
  outlineEffectId: string;
};

export class Pillars {
  private handles = new Map<string, MeshHandle<BoxMeshDesc>>();
  private applied = new Map<string, Applied>();
  private highlighted = new Map<string, Change>();
  private baseColor: Color;

  constructor(
    view: ThreeView<DefaultDescriptions>,
    ids: Iterable<string>,
    private width: number,
    colorStyle: string,
    /** 柱の根元の地面の高さ（m）。3D地形を強調して描いているので、その上に立てる（src/ground.ts） */
    private groundAt: (id: string) => number = () => 0,
  ) {
    const color = new Color().setStyle(colorStyle);
    this.baseColor = color;
    for (const id of ids) {
      const handle = view.addMesh<BoxMeshDesc>({
        // 1×1×1 の箱を scale で伸ばす（高さの更新を scale だけで済ませるため）
        box: { width: 1, height: 1, depth: 1, color, opacity: 1, transparent: false },
        geodetic: { lng: 0, lat: 0, height: 0 },
        scale: { x: width, y: 1, z: width },
        lit: false,
        visible: false,
      });
      this.handles.set(id, handle);
    }
  }

  /**
   * 入れ替わりの見せ方を付け外しする（src/changes.ts）。入った柱は光らせ、外れた柱には輪郭を付ける。
   * 前回と変わった柱だけを更新する。空の Map を渡すと全部外す
   */
  setHighlights(changes: Map<string, Change>, style: HighlightStyle): void {
    const glow = new Color().setStyle(style.glowColor);
    const ids = new Set([...this.highlighted.keys(), ...changes.keys()]);
    for (const id of ids) {
      const next = changes.get(id);
      if (this.highlighted.get(id) === next) continue;
      const handle = this.handles.get(id);
      if (!handle) continue;
      const color = next === "in" && style.inColor ? new Color().setStyle(style.inColor) : this.baseColor;
      if (next === "in") handle.update({ box: { color, effectIds: [style.glowEffectId], emissiveColor: glow, emissiveIntensity: style.glowIntensity } });
      else if (next === "out") handle.update({ box: { color, effectIds: [style.outlineEffectId], emissiveIntensity: 0 } });
      else handle.update({ box: { color, effectIds: [], emissiveIntensity: 0 } });
      if (next) this.highlighted.set(id, next);
      else this.highlighted.delete(id);
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
        this.applied.set(id, { ...s, visible: false, ground: prev?.ground ?? 0 });
        continue;
      }
      const update: Parameters<typeof handle.update>[0] = {};
      if (!prev?.visible) update.visible = true;
      const ground = this.groundAt(id);
      if (!prev || prev.lon !== s.lon || prev.lat !== s.lat || prev.ground !== ground) update.geodetic = { lng: s.lon, lat: s.lat, height: ground };
      if (!prev || prev.height !== s.height) {
        // geodetic の座標系は Y が上。箱は中心が原点なので、高さの半分だけ持ち上げる
        update.scale = { x: this.width, y: s.height, z: this.width };
        update.position = { x: 0, y: s.height / 2, z: 0 };
      }
      // 透明度は、ある程度変わったときだけ更新する（マテリアルの更新は毎フレーム呼ぶと重い）
      let opacity = prev?.opacity ?? -1;
      const diff = Math.abs(opacity - s.opacity);
      if (!prev || diff > 0.05 || (final && diff > 0)) {
        update.box = { opacity: s.opacity, transparent: s.opacity < 0.999 };
        opacity = s.opacity;
      }
      if (Object.keys(update).length > 0) handle.update(update);
      this.applied.set(id, { ...s, opacity, visible: true, ground });
    }
  }
}
