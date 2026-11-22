// Vite の設定（GitHub Pages で配信するため）。
// - base: "./"：GitHub Pages はリポジトリ名のサブパス（/リポジトリ名/）で配信されるので、相対パスにして
//   リポジトリ名に左右されずに動くようにする（eukarya-biz に移しても、そのまま動く）
// - Navara（@navaramap/three 0.3.1）の大気・雲・ノイズのアセットは、ライブラリが
//   new URL("assets/atmosphere/…", import.meta.url) とファイル名まで書いて読むので、ビルドのときに Vite が
//   dist/assets に入れる。0.1.1・0.2.1 で要ったアセットのコピーは、0.3.1 では要らない
//   （2026-11-22 にサブパスで配信して、読み込みの 404 が無いことを確かめた）
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 8080 },
  build: {
    // Navara の WASM が大きいので、チャンクの大きさの警告の閾値を上げる
    chunkSizeWarningLimit: 9000,
  },
});
