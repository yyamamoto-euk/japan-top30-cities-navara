// 画面の左の年表（2026-11-22 yyamaの指示）。年・和暦・その年の出来事の一言を縦に並べ、今の年を目立たせる。
// - 年をクリックすると、その年へ移る（main.ts の go）
// - 年の位置は実際の年数に比例させる。近すぎる年（1940・1945・1950）は、文字が重ならないよう最低限の間隔をあける
// - 文言は frames.ts の era と event。年の行の右端に、その年の日本の総人口（cities.json の national）を出す

import type { Frame } from "./frames.ts";

/** 年と年の最低限の間隔（px）。1行目（年・和暦）と2行目（出来事）が重ならない高さ */
const MIN_GAP = 46;

export class Timeline {
  private panel: HTMLElement;
  private list: HTMLElement;
  private items: HTMLButtonElement[] = [];

  constructor(
    parent: HTMLElement,
    private frames: Frame[],
    /** 年 → 総人口の表示（「3,854万人」など）。無い年は null */
    totalFor: (year: number) => string | null,
    onSelect: (index: number) => void,
  ) {
    this.panel = document.createElement("nav");
    this.panel.className = "timeline";
    this.panel.setAttribute("aria-label", "年表");
    const caption = document.createElement("div");
    caption.className = "timeline__caption";
    caption.textContent = "右の数字は日本の総人口";
    this.panel.appendChild(caption);
    this.list = document.createElement("div");
    this.list.className = "timeline__list";
    this.panel.appendChild(this.list);

    frames.forEach((f, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "timeline__item";
      item.setAttribute("aria-label", `${f.year}年（${f.era}）へ。${f.event}${totalFor(f.year) ? `。総人口 ${totalFor(f.year)}` : ""}`);
      const head = document.createElement("span");
      head.className = "timeline__head";
      const year = document.createElement("span");
      year.className = "timeline__year";
      year.textContent = `${f.year}`;
      const era = document.createElement("span");
      era.className = "timeline__era";
      era.textContent = f.era;
      head.append(year, era);
      const total = totalFor(f.year);
      if (total) {
        const t = document.createElement("span");
        t.className = "timeline__total";
        t.textContent = total;
        head.append(t);
      }
      const event = document.createElement("span");
      event.className = "timeline__event";
      event.textContent = f.event;
      item.append(head, event);
      item.addEventListener("click", () => onSelect(i));
      this.list.appendChild(item);
      this.items.push(item);
    });

    parent.appendChild(this.panel);
    new ResizeObserver(() => this.layout()).observe(this.list);
    this.layout();
  }

  /** 今の年を目立たせる */
  show(index: number): void {
    this.items.forEach((item, i) => {
      const active = i === index;
      item.classList.toggle("timeline__item--active", active);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
  }

  /** 年の位置を決める：年数に比例させ、近すぎる年は MIN_GAP だけ離す。はみ出した分は上へ戻す */
  private layout(): void {
    const height = this.list.clientHeight;
    if (height === 0) return;
    const first = this.frames[0].year;
    const span = this.frames[this.frames.length - 1].year - first;
    const lastTop = Math.max(0, height - MIN_GAP);
    const tops = this.frames.map((f) => ((f.year - first) / span) * lastTop);
    for (let i = 1; i < tops.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + MIN_GAP);
    if (tops[tops.length - 1] > lastTop) {
      tops[tops.length - 1] = lastTop;
      for (let i = tops.length - 2; i >= 0; i--) tops[i] = Math.min(tops[i], tops[i + 1] - MIN_GAP);
    }
    this.items.forEach((item, i) => (item.style.top = `${Math.max(0, tops[i])}px`));
  }
}
