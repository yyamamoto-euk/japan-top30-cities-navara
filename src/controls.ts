// 画面下の中央の操作ボタン：◀ 前の年 ／ 今の年と出典 ／ 次の年 ▶ ／ アニメーション ON・OFF。
// ← → キーでは送らない（誤動作防止、2026-11-22）。

import type { Frame } from "./frames.ts";

const ANIMATION_KEY = "japan-top30-cities-navara:animation";

/** アニメーションの ON/OFF を、このブラウザに覚えさせる（読めなければ ON） */
export function loadAnimationSetting(): boolean {
  try {
    return localStorage.getItem(ANIMATION_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveAnimationSetting(on: boolean): void {
  try {
    localStorage.setItem(ANIMATION_KEY, on ? "on" : "off");
  } catch {
    // 保存できなくても動く
  }
}

export type ControlsHandlers = {
  onPrev: () => void;
  onNext: () => void;
  onAnimationChange: (on: boolean) => void;
};

export class Controls {
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;
  private title: HTMLDivElement;
  private yearText: HTMLSpanElement;
  private total: HTMLSpanElement;
  private source: HTMLDivElement;
  private changes: HTMLDivElement;
  private anim: HTMLButtonElement;
  private dummyBadge: HTMLDivElement;
  private animationOn: boolean;

  constructor(parent: HTMLElement, handlers: ControlsHandlers, animationOn: boolean) {
    this.animationOn = animationOn;

    const bar = document.createElement("div");
    bar.className = "controls";

    this.prev = document.createElement("button");
    this.prev.type = "button";
    this.prev.className = "controls__step";
    this.prev.addEventListener("click", handlers.onPrev);

    const current = document.createElement("div");
    current.className = "controls__current";
    this.title = document.createElement("div");
    this.title.className = "controls__title";
    this.yearText = document.createElement("span");
    this.total = document.createElement("span");
    this.total.className = "controls__total";
    this.title.append(this.yearText, this.total);
    this.source = document.createElement("div");
    this.source.className = "controls__source";
    // 上位30の入れ替わりの説明（src/changes.ts）。見本の四角は index.html の CSS で柱の色と光に似せる
    this.changes = document.createElement("div");
    this.changes.className = "controls__changes";
    current.append(this.title, this.changes, this.source);

    this.next = document.createElement("button");
    this.next.type = "button";
    this.next.className = "controls__step";
    this.next.addEventListener("click", handlers.onNext);

    this.anim = document.createElement("button");
    this.anim.type = "button";
    this.anim.className = "controls__anim";
    this.anim.addEventListener("click", () => {
      this.animationOn = !this.animationOn;
      saveAnimationSetting(this.animationOn);
      this.renderAnimation();
      handlers.onAnimationChange(this.animationOn);
    });

    bar.append(this.prev, current, this.next, this.anim);
    parent.appendChild(bar);

    this.dummyBadge = document.createElement("div");
    this.dummyBadge.className = "dummy-badge";
    this.dummyBadge.textContent = "仮データ";
    this.dummyBadge.hidden = true;
    parent.appendChild(this.dummyBadge);

    this.renderAnimation();
  }

  /** 今のコマに合わせて表示を変える */
  show(
    frames: Frame[],
    index: number,
    usesDummy: boolean,
    total: string | null = null,
    changes: { in: number; out: number; prevYear: number } | null = null,
  ): void {
    const f = frames[index];
    const before = frames[index - 1];
    const after = frames[index + 1];
    this.yearText.textContent = `${f.year}年`;
    this.total.textContent = total ? `総人口 ${total}` : "";
    this.total.hidden = !total;
    this.changes.replaceChildren();
    this.changes.hidden = !changes;
    if (changes) {
      const item = (cls: string, text: string) => {
        const span = document.createElement("span");
        span.className = "controls__change";
        const swatch = document.createElement("span");
        swatch.className = `controls__swatch ${cls}`;
        span.append(swatch, text);
        return span;
      };
      this.changes.append(
        item("controls__swatch--in", `${changes.prevYear}年から新たに上位30に入った（${changes.in}本）`),
        item("controls__swatch--out", `外れた（${changes.out}本）`),
      );
    }
    this.source.textContent = f.source;
    this.source.hidden = f.source === "";
    this.prev.textContent = before ? `◀ ${before.year}年` : "◀";
    this.prev.disabled = !before;
    this.prev.setAttribute("aria-label", before ? `前の年（${before.year}年）へ` : "前の年はありません");
    this.next.textContent = after ? `${after.year}年 ▶` : "▶";
    this.next.disabled = !after;
    this.next.setAttribute("aria-label", after ? `次の年（${after.year}年）へ` : "次の年はありません");
    this.dummyBadge.hidden = !usesDummy;
  }

  private renderAnimation(): void {
    this.anim.textContent = `アニメ ${this.animationOn ? "ON" : "OFF"}`;
    this.anim.setAttribute("aria-pressed", String(this.animationOn));
  }
}
