// 一覧：今の年の上位30を、数字で読める表で出す（2026-11-23 yyamaの指示）。
// - 3D の柱は手前が大きく奥が小さく見え、離れた都市どうしの比較や順位が目では読みにくい。授業で読み上げるときや、読み上げソフトのために文字で出す
// - 画面の右。「一覧」ボタンで開閉し、最初は閉じている。× と Esc でも閉じる。画面が狭いとき（1200px 未満）は地図の上に全面で重ねる（index.html の CSS）
// - 順位と人口は画面と同じ値（src/stack.ts で積んで順位を付け直したあと）。行は main.ts の rankRowsFor が作る
// - 表は <table> と <caption>。前の年からの変化は、記号のほかに読み上げ用の文も付ける（色だけ・記号だけに頼らない）

/** 前の年からの変化。null は比べる年が無い（1886年） */
export type RankChange = { kind: "up" | "down" | "same"; by: number } | { kind: "new" } | null;

export type RankRow = {
  id: string;
  rank: number;
  /** 当時の名前。1925年の東京は「東京市（4町を含む）」 */
  name: string;
  /** （）に出す今の名前。出さないときは null（ラベルと同じ決まり） */
  nameNow: string | null;
  pop: number;
  change: RankChange;
};

export type OutRow = { id: string; rank: number | null; name: string; nameNow: string | null; pop: number };

export type RankListContent = {
  year: number;
  /** 比べる年。1886年は null */
  prevYear: number | null;
  rows: RankRow[];
  outRows: OutRow[];
  /** その年の出典（frames.ts の source） */
  source: string;
};

/** 順位の注意のリンク先（conditions.md の「気をつけてほしい違い」） */
const NOTE_URL = "https://github.com/yyamamoto-euk/japan-top30-cities-navara/blob/main/conditions.md#%E6%B0%97%E3%82%92%E3%81%A4%E3%81%91%E3%81%A6%E3%81%BB%E3%81%97%E3%81%84%E9%81%95%E3%81%84";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 読み上げソフトだけが読む文 */
const srOnly = (text: string) => el("span", "sr-only", text);

export class RankList {
  private toggle: HTMLButtonElement;
  private panel: HTMLElement;
  private title: HTMLElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement) {
    this.toggle = el("button", "rank-toggle", "一覧");
    this.toggle.type = "button";
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggle.setAttribute("aria-controls", "rank-panel");
    this.toggle.addEventListener("click", () => this.setOpen(this.panel.hidden));

    this.panel = el("section", "rank-panel");
    this.panel.id = "rank-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-labelledby", "rank-panel-title");
    const head = el("div", "rank-panel__head");
    this.title = el("h2", "rank-panel__title");
    this.title.id = "rank-panel-title";
    this.title.tabIndex = -1; // 開いたときにここへ移る
    const close = el("button", "rank-panel__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "一覧を閉じる");
    close.addEventListener("click", () => this.setOpen(false));
    head.append(this.title, close);
    this.body = el("div", "rank-panel__body");
    this.panel.append(head, this.body);
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.setOpen(false);
    });

    parent.append(this.toggle, this.panel);
  }

  setOpen(open: boolean): void {
    this.panel.hidden = !open;
    this.toggle.setAttribute("aria-expanded", String(open));
    this.toggle.classList.toggle("rank-toggle--open", open);
    if (open) this.title.focus();
    else this.toggle.focus();
  }

  /** 年が決まったら呼ぶ。中身を丸ごと作り直す */
  show(c: RankListContent): void {
    this.title.textContent = `${c.year}年の人口上位${c.rows.length}`;
    this.body.replaceChildren(this.topTable(c), ...this.outSection(c), this.footnote(c));
  }

  private nameCell(name: string, nameNow: string | null): HTMLTableCellElement {
    const td = el("td", "rank-table__name");
    td.append(el("span", "rank-table__then", name));
    if (nameNow) td.append(el("span", "rank-table__now", `（${nameNow}）`));
    return td;
  }

  private changeCell(change: RankChange): HTMLTableCellElement {
    const td = el("td", "rank-table__change");
    if (!change) return td;
    if (change.kind === "new") {
      const mark = el("span", "rank-mark rank-mark--in");
      mark.setAttribute("aria-hidden", "true");
      const shown = el("span", "rank-table__new", "新");
      shown.setAttribute("aria-hidden", "true");
      td.append(mark, shown, srOnly("新たに入った"));
      return td;
    }
    const [sym, read] =
      change.kind === "up" ? [`↑${change.by}`, `${change.by}つ上がった`] : change.kind === "down" ? [`↓${change.by}`, `${change.by}つ下がった`] : ["→", "変わらず"];
    const shown = el("span", `rank-table__move rank-table__move--${change.kind}`, sym);
    shown.setAttribute("aria-hidden", "true");
    td.append(shown, srOnly(read));
    return td;
  }

  private topTable(c: RankListContent): HTMLTableElement {
    const table = el("table", "rank-table");
    table.append(el("caption", "rank-table__caption", `${c.year}年の人口上位${c.rows.length}（順位の順）`));
    const head = el("tr");
    for (const h of ["順位", "名前", "人口", c.prevYear ? `${c.prevYear}年から` : "前の年から"]) {
      const th = el("th", "", h);
      th.scope = "col";
      head.append(th);
    }
    table.append(el("thead"));
    table.tHead!.append(head);
    const tbody = el("tbody");
    for (const r of c.rows) {
      const tr = el("tr");
      const rank = el("th", "rank-table__rank", String(r.rank));
      rank.scope = "row";
      tr.append(rank, this.nameCell(r.name, r.nameNow), el("td", "rank-table__pop", r.pop.toLocaleString("ja-JP")), this.changeCell(r.change));
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  private outSection(c: RankListContent): HTMLElement[] {
    if (!c.prevYear || c.outRows.length === 0) return [];
    const heading = el("h3", "rank-panel__sub", `${c.prevYear}年から外れた（${c.outRows.length}本）`);
    const table = el("table", "rank-table rank-table--out");
    table.append(el("caption", "sr-only", `${c.prevYear}年は上位30で、${c.year}年は外れた柱`));
    const head = el("tr");
    for (const h of ["順位", "名前", "人口"]) {
      const th = el("th", "", h);
      th.scope = "col";
      head.append(th);
    }
    table.append(el("thead"));
    table.tHead!.append(head);
    const tbody = el("tbody");
    for (const r of c.outRows) {
      const tr = el("tr");
      const rank = el("th", "rank-table__rank");
      rank.scope = "row";
      const mark = el("span", "rank-mark rank-mark--out");
      mark.setAttribute("aria-hidden", "true");
      rank.append(mark, document.createTextNode(r.rank != null ? String(r.rank) : "—"));
      tr.append(rank, this.nameCell(r.name, r.nameNow), el("td", "rank-table__pop", r.pop.toLocaleString("ja-JP")));
      tbody.append(tr);
    }
    table.append(tbody);
    return [heading, table];
  }

  private footnote(c: RankListContent): HTMLElement {
    const note = el("div", "rank-panel__note");
    const p = el("p");
    p.append("順位は、その年の表の中での順位です。表に載っている範囲が年ごとに違うので、31位より下は年をまたいで比べられません（");
    const a = el("a", "", "数え方と条件");
    a.href = NOTE_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    p.append(a, "）。");
    note.append(p, el("p", "rank-panel__source", c.source));
    return note;
  }
}
