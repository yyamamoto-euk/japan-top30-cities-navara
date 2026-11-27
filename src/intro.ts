// スタート画面：初めて使う人に、何のアプリか・操作3つ・数字を読む前の注意を伝える（2026-11-23 yyamaの指示）。
// - 開くたびに出す（yyamaが「毎回」を選んだ）。「次から表示しない」にチェックした人だけ、次から出さない（ブラウザに覚えさせる）
// - 地図をうすく暗くした上に重ねる。地図の読み込み中は「はじめる」を押せない
// - 「はじめる」を押すと、カメラが遠くから日本へ寄り、柱が0から伸びる（main.ts の startIntro。案A）
// - 右上の「？」で、いつでも開き直せる（開き直したときは、閉じても地図はそのまま）
// - ダイアログとして作る（role="dialog"・aria-modal・見出し）。開いている間は Tab が中だけを回り、Esc で閉じる

import { CONDITIONS_URL, CREDIT_LINE } from "./constants.ts";

const HIDE_KEY = "japan-top30-cities-navara:intro-hidden";

/** 「次から表示しない」にチェックしたか（保存できないブラウザでは、いつも出す） */
export function introHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDE_KEY, "1");
    else localStorage.removeItem(HIDE_KEY);
  } catch {
    // 保存できなくても動く
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

const link = (text: string, url: string) => {
  const a = el("a", "", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
};

export class Intro {
  private backdrop: HTMLElement;
  private start: HTMLButtonElement;
  private help: HTMLButtonElement;
  private ready = false;
  /** 閉じたあとに呼ぶ。最初の1回は main.ts の入り方（寄る・伸びる）、開き直したときは何もしない */
  private onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.backdrop = el("div", "intro");
    this.backdrop.hidden = true;
    const card = el("div", "intro__card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "intro-title");
    card.setAttribute("aria-describedby", "intro-lead");

    // 見出しは長いので、折り返すなら全角スペースのところで折る（「（1886〜」などで切れないよう、3つのかたまりにする）
    const title = el("h1", "intro__title");
    title.append(el("span", "intro__title-part", "Navaraで見る日本の人口"), "　", el("span", "intro__title-part", "上位30都市の推移"), "　", el("span", "intro__title-part", "明治から令和まで（1886〜2025）"));
    title.id = "intro-title";
    title.tabIndex = -1; // 読み込み中は、開いたときにここへ移る
    const lead = el("p", "intro__lead", 
      "明治19年（1886年）から令和7年（2025年）までの12の年（おおむね10〜20年おき。戦争の前後の1940・1945・1950年は5年おき）で、人口の多い30都市の顔ぶれがどう入れ替わったかを、3D地図 Navara の上に立てた柱の高さで見ます。",
    );
    lead.id = "intro-lead";

    const how = el("ul", "intro__how");
    const items: [string, string][] = [
      ["年を送る", "◀ ▶ か、左の年表の年を押すと年が変わります。柱が伸び縮みし、新たに上位30に入った柱はオレンジ、外れた柱は赤紫になります。"],
      ["一覧", "右上の「一覧」で、順位と人口を表で読めます。名前を押すと、その柱に寄ります。"],
      ["地図を動かす", "ドラッグで移動、ホイールで拡大・縮小できます。"],
    ];
    for (const [head, body] of items) {
      const li = el("li");
      li.append(el("strong", "", head), document.createTextNode(`　${body}`));
      how.append(li);
    }

    const note = el("p", "intro__note");
    note.append("都市は当時の市町村で数えています。年ごとに資料と数え方が違います。詳しくは", link("数え方と条件", CONDITIONS_URL), "を見てください。");

    const actions = el("div", "intro__actions");
    this.start = el("button", "intro__start", "地図を読み込み中…");
    this.start.type = "button";
    this.start.disabled = true;
    this.start.addEventListener("click", () => this.close());
    const hideLabel = el("label", "intro__hide");
    const hide = el("input");
    hide.type = "checkbox";
    hide.checked = introHidden();
    hide.addEventListener("change", () => saveHidden(hide.checked));
    hideLabel.append(hide, document.createTextNode("次から表示しない（右上の「？」でいつでも開けます）"));
    actions.append(this.start, hideLabel);

    const credit = el("p", "intro__credit");
    CREDIT_LINE.forEach((part, i) => {
      if (i > 0) credit.append("　｜　");
      for (const piece of part) credit.append(typeof piece === "string" ? piece : link(piece.text, piece.url));
    });

    card.append(title, lead, how, note, actions, credit);
    this.backdrop.append(card);
    // Tab を中だけで回す。Esc で閉じる（読み込み中は閉じない）
    card.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.ready) {
        e.preventDefault();
        this.close();
      } else if (e.key === "Tab") {
        const focusable = [...card.querySelectorAll<HTMLElement>("a, button:not(:disabled), input")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    this.help = el("button", "intro-help", "？");
    this.help.type = "button";
    this.help.setAttribute("aria-label", "使い方（スタート画面）を開く");
    this.help.addEventListener("click", () => this.open(null));

    parent.append(this.help, this.backdrop);
  }

  /** 開く。onClose は閉じたあとに1回だけ呼ぶ */
  open(onClose: (() => void) | null): void {
    this.onClose = onClose;
    this.backdrop.hidden = false;
    (this.ready ? this.start : this.backdrop.querySelector<HTMLElement>(".intro__title"))?.focus();
  }

  /** 地図の準備ができたら呼ぶ。「はじめる」を押せるようにする */
  setReady(): void {
    this.ready = true;
    this.start.disabled = false;
    this.start.textContent = "はじめる";
    if (!this.backdrop.hidden) this.start.focus();
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  private close(): void {
    this.backdrop.hidden = true;
    const done = this.onClose;
    this.onClose = null;
    document.querySelector<HTMLElement>(".rank-toggle")?.focus();
    done?.();
  }
}
