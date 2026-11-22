// クレジット：画面の左下に常に出す1行と、Navara の ⓘ ボタンの中の一覧（2026-11-22 yyamaの指示「隅にも常に出す」）。
// - 背景地図（Re:Earth Papers・OpenStreetMap）のクレジットは、TileJsonPlugin が TileJSON の attribution を ⓘ に自動で入れる
// - ⓘ に足すのは、柱の位置（OpenStreetMap・国土地理院）と人口の統計。API：view.attribution?.add([...])（@navaramap/three の AttributionPlugin、
//   docs/navara-api-check.md）
// - 文言は constants.ts の CREDIT_LINE と CREDIT_ITEMS

import type ThreeView from "@navaramap/three";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";

import { CREDIT_ITEMS, CREDIT_LINE } from "./constants.ts";

export function addCredits(view: ThreeView<DefaultDescriptions>, parent: HTMLElement): void {
  view.attribution?.add(CREDIT_ITEMS);

  const line = document.createElement("div");
  line.className = "credit-line";
  CREDIT_LINE.forEach((part, i) => {
    if (i > 0) line.append(document.createTextNode("　｜　"));
    for (const piece of part) {
      if (typeof piece === "string") {
        line.append(document.createTextNode(piece));
      } else {
        const a = document.createElement("a");
        a.href = piece.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = piece.text;
        line.append(a);
      }
    }
  });
  parent.appendChild(line);
}
