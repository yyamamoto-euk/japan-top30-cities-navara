// 柱の根元の地面の高さ。3D地形（main.ts）を TERRAIN_EXAGGERATION 倍に強調しているので、柱とラベルの根元をその地面の上に置く。
//
// - 柱ごとに、描く位置（layout.ts でずらしたあと）の地面の高さを Navara の observeTerrainHeightAt で見張る
// - 返る高さは、強調したあとの、画面に描かれている地面の高さ（m、楕円体から）。2026-11-22 に開発サーバーで確かめた：
//   松本の辺りで約6,370m（標高約590m＋ジオイド高 約40m の10倍）、東京で約716m
// - 地形のデータは、カメラが寄ると細かいものに読み替わり、高さも変わる。変わったら onChange を呼ぶ（まとめて200ミリ秒に1回）
// - 地形がまだ読み込まれていない柱は 0（今までどおり楕円体の高さ0）

import type ThreeView from "@navaramap/three";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";

/** 高さが変わったときに onChange を呼ぶまでの待ち（ミリ秒）。読み込みのたびに柱を動かさないよう、まとめる */
const BATCH_MS = 200;

export class GroundHeights {
  private heights = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    view: ThreeView<DefaultDescriptions>,
    positions: Map<string, { lon: number; lat: number }>,
    private onChange: () => void,
  ) {
    for (const [id, p] of positions) {
      const pos = { lng: p.lon, lat: p.lat };
      const now = view.sampleTerrainHeight(pos);
      if (now !== undefined) this.heights.set(id, now);
      view.observeTerrainHeightAt(pos, (h) => {
        if (this.heights.get(id) === h) return;
        this.heights.set(id, h);
        this.schedule();
      });
    }
  }

  /** 柱の根元の高さ（m）。地形がまだ無ければ 0 */
  at(id: string): number {
    return this.heights.get(id) ?? 0;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onChange();
    }, BATCH_MS);
  }
}
