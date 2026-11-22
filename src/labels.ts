// 柱の人口ラベル。OverlayPlugin が出す画面座標に、HTML の文字を重ねる。
// 画面上で重なったラベルは、人口の小さい方を隠す。

import type ThreeView from "@navaramap/three";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";
import { moveOverlayElement, type OverlayPlugin, type ProjectedPosition } from "@navaramap/three-plugins";

export type LabelItem = {
  id: string;
  lon: number;
  lat: number;
  /** ラベルを付ける高さ（m）。柱の頭なら柱の高さ、根元なら 0 */
  alt: number;
  /** 人口（「112万」など） */
  text: string;
  /** 当時の名前（人口の右に小さく） */
  name: string;
  /** 今の名前（2行目に（）付きで出す）。出さないときは null */
  nameNow: string | null;
  /** 重なったときの優先度。大きいほうを残す（人口） */
  priority: number;
};

export { formatPopulation } from "./format.ts";

/** ラベルの中身：1行目「人口 当時の名前」、2行目「（今の名前）」 */
function renderLabel(span: HTMLElement, item: LabelItem): void {
  const line = document.createElement("span");
  line.className = "pillar-label__line";
  const pop = document.createElement("span");
  pop.className = "pillar-label__pop";
  pop.textContent = item.text;
  const name = document.createElement("span");
  name.className = "pillar-label__name";
  name.textContent = item.name;
  line.append(pop, name);
  span.replaceChildren(line);
  if (item.nameNow) {
    const now = document.createElement("span");
    now.className = "pillar-label__now";
    now.textContent = `（${item.nameNow}）`;
    span.append(now);
  }
}

/** 文字の下端（頭）または上端（根元）と、柱の点とのすき間（px）。index.html の CSS と合わせる */
const ANCHOR_OFFSET = 4;
/** 重なりの判定で、ラベルの周りに足す余白（px） */
const COLLISION_MARGIN = 2;

type Entry = {
  item: LabelItem;
  el: HTMLDivElement;
  width: number;
  height: number;
};

type Box = { left: number; top: number; right: number; bottom: number };

export class PillarLabels {
  private layer: HTMLDivElement;
  private entries = new Map<string, Entry>();

  constructor(
    private view: ThreeView<DefaultDescriptions>,
    private overlay: OverlayPlugin,
    parent: HTMLElement,
    private position: "top" | "bottom",
    fontSize: number,
    nameScale: number,
    nowScale: number,
  ) {
    this.layer = document.createElement("div");
    this.layer.className = `pillar-labels pillar-labels--${position}`;
    this.layer.style.setProperty("--label-font-size", `${fontSize}px`);
    this.layer.style.setProperty("--label-name-scale", String(nameScale));
    this.layer.style.setProperty("--label-now-scale", String(nowScale));
    parent.appendChild(this.layer);
    overlay.onUpdate(({ projected }) => this.place(projected));
  }

  /** 出すラベルを丸ごと入れ替える */
  set(items: LabelItem[]): void {
    const keep = new Set(items.map((i) => i.id));
    for (const [id, e] of this.entries) {
      if (!keep.has(id)) {
        e.el.remove();
        this.entries.delete(id);
      }
    }
    for (const item of items) {
      let entry = this.entries.get(item.id);
      if (!entry) {
        const el = document.createElement("div");
        el.className = "pillar-label";
        el.appendChild(document.createElement("span"));
        this.layer.appendChild(el);
        entry = { item, el, width: 0, height: 0 };
        this.entries.set(item.id, entry);
      }
      entry.item = item;
      renderLabel(entry.el.firstElementChild as HTMLElement, item);
      this.measure(entry);
    }
    this.overlay.setPositions(items.map((i) => ({ id: i.id, lng: i.lon, lat: i.lat, alt: i.alt })));
    // 描画は必要なときだけ行われるので、位置を変えたら1フレーム描かせて投影し直す
    this.view.forceUpdate();
  }

  /** 文字の大きさを測っておく（重なりの判定に使う） */
  private measure(entry: Entry): void {
    const { el } = entry;
    el.hidden = false;
    el.style.visibility = "hidden";
    const span = el.firstElementChild as HTMLElement;
    entry.width = span.offsetWidth;
    entry.height = span.offsetHeight;
    el.style.visibility = "";
    el.hidden = true; // 最初の投影が来るまで隠す
  }

  /** ラベルの画面上の箱。CSS の transform（中央揃え、頭なら上へ／根元なら下へ）と同じ計算 */
  private box(e: Entry, p: ProjectedPosition): Box {
    const left = p.x - e.width / 2 - COLLISION_MARGIN;
    const top =
      this.position === "top" ? p.y - ANCHOR_OFFSET - e.height - COLLISION_MARGIN : p.y + ANCHOR_OFFSET - COLLISION_MARGIN;
    return {
      left,
      top,
      right: left + e.width + COLLISION_MARGIN * 2,
      bottom: top + e.height + COLLISION_MARGIN * 2,
    };
  }

  /** 投影された位置に置き、人口の大きい順に、先に置いたラベルと重なるものを隠す */
  private place(projected: Map<string, ProjectedPosition>): void {
    const ordered = [...this.entries.values()].sort((a, b) => b.item.priority - a.item.priority);
    const shown: Box[] = [];
    for (const e of ordered) {
      const p = projected.get(e.item.id);
      if (!p) {
        e.el.hidden = true;
        continue;
      }
      const b = this.box(e, p);
      const overlaps = shown.some(
        (s) => b.left < s.right && s.left < b.right && b.top < s.bottom && s.top < b.bottom,
      );
      if (overlaps) {
        e.el.hidden = true;
        continue;
      }
      shown.push(b);
      e.el.hidden = false;
      moveOverlayElement(e.el, p.x, p.y);
    }
  }
}
