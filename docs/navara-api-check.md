# Navara API 確認メモ

対象：`@navaramap/*` **0.3.1**（2026-11-22 に 0.0.5 から上げた）。

## 経緯

- T0 では、まずテンプレの 0.0.5 で調べた。その結果、npm の最新が 0.3.1（2026-11-10）だと分かり、yyamaの指示で 0.3.1 に上げた
- 上げたのは `@navaramap/three`、`three-default-plugin`、`three-default-descs`、`three-plugins` の4つ。three 0.184.0 と postprocessing 6.38.3 はそのまま（0.3.1 の peer 条件 `three >=0.183.0`、`postprocessing >=6.38.0` を満たす）
- 上げたあと、テンプレの `src/main.ts` のまま `pnpm build`（tsc＋vite）が通ることを確かめた
- 依存関係の警告が1件ある：postprocessing 6.38.3 は three を `<0.184.0` で求めている。これは 0.0.5 のときからあった
- 本家テンプレ（reearth/navara-template）は 2026-11-22 時点でまだ 0.0.5。スキル `.claude/skills/navara-usage/` も 0.0.5 に合わせて書かれている

## 調べたもの

- 正とした版：`node_modules/@navaramap/*` の 0.3.1 の `src/` と `dist/index.d.ts`
- 公開ドキュメント：https://navara.world/docs/ （2026-11-22 に取得）
- Re:Earth Papers：https://papers.reearth.land/
- スキル：参考にとどめた（0.0.5 向けで、古い箇所がある。末尾の「スキルの古い箇所」を参照）

確かめたのはソースと型まで。画面に出しての確認はしていない（T2・T3 で見る）。

## 結果の一覧

| # | 機能 | 判定 | ひとこと |
|---|---|---|---|
| 1 | 緯度経度に柱（箱）を置き、高さ・色・透明度を後から変える | 使える | `box` メッシュ＋`geodetic` で緯度経度にそのまま立つ |
| 2 | メッシュの更新方法と毎フレーム更新 | 条件付き | `update()`。高さは `scale` で変える（`box.height` を変えると毎回作り直し） |
| 3 | カメラの固定と `setCamera` | 使える | `view.camera.options` で回転・ズーム・傾きを切れる |
| 4 | 背景地図（TileJsonPlugin で Papers を読む） | 使える | Papers は TileJSON 3.0.0 のラスタ（webp）を出している |
| 5 | GeoJSON ポリゴンを属性で塗り分ける | 使える | vector レイヤー＋`FeatureEvaluator` の `color` |
| 6 | 地図上のテキストラベル | 条件付き | `text` マテリアルと OverlayPlugin の両方ある。それぞれ注意点あり |
| 7 | キー入力 | 条件付き | 普通の DOM イベントでよい。Navara も document の keydown を拾っている |

---

## 1. 柱を置いて、高さ・色・透明度を変える — 使える

- `BoxMeshDesc`（登録キー `box`）。`DefaultPlugin` が登録済み
  - ドキュメント：https://navara.world/docs/three_default_descs/mesh-desc/box-mesh-desc/
- 設定できるもの：`width` `height` `depth` `color` `opacity` `transparent` `emissiveColor` など
  - 根拠：`node_modules/@navaramap/three-default-descs/src/meshes/BoxMeshDesc.ts` の `Description` 型
- **緯度経度に立てる方法：`geodetic: { lng, lat, height }`**（0.3.1 で入った）
  - 西・上・北（Y が上）の座標系がその地点に作られる。このため、**箱の `height`（Y 軸）がそのまま空に向かって伸びる**
  - 根拠：`node_modules/@navaramap/three/src/core/MeshDesc.ts:60-73`、`dist/index.d.ts:5264-5287`（`GeodeticPlacement`：`lng` `lat` `height` `heading` `pitch` `roll` `scale` `heightReference`）
  - `geodetic` と `matrix`・`matrixWorld` は同時に使えない。両方渡すとエラーになる（`MeshDesc.ts:110-130`）
- 色・透明度は `handle.update({ box: { color, opacity, transparent } })` で変えられる。マテリアルの値を書き換えるだけで、作り直しはしない
- 表示の切り替えは `handle.update({ visible })` か `handle.visible = false`
- **光源**：箱は光で陰影が付く材質。光源が無いと黒く写る。0.3.1 からは `lit: false` で光を使わず素の色で出せる。メッシュごとに指定するか、`view.lit = false` で全体に効かせる
  - 根拠：`MeshDesc.ts:74-80`（`lit`）、`src/index.ts:952-967`（`view.lit`）

注意

- 箱の中心が原点にある。`geodetic.height`（地面からの高さ）を柱の高さの半分にして持ち上げるか、`position: { y: 高さ / 2 }` で持ち上げる
- 同じ形のまとめ描き用に `InstancedBoxMeshDesc`（キー `boxes`）もある。柱が50〜60本なら、1本ずつ `box` で足りる見込み

## 2. メッシュの更新方法と毎フレーム更新 — 条件付き

- 更新は `handle.update(部分設定)`。渡した項目だけが上書きされる（部分マージ）
- **`scale`・`position`・`geodetic` の更新は、行列を計算し直すだけで軽い。**
  - 根拠：`MeshDesc.ts:611-680`（`spatialChanged` のとき `applyTransform()` を呼ぶだけ）
  - `geodetic` の一部だけ渡すと、残りは前の値が引き継がれる（`MeshDesc.ts:83-92`、`mergeGeodetic`）
- **`box.width/height/depth` の更新は、毎回ジオメトリを捨てて作り直す。** 毎フレーム呼ぶとメモリの確保と解放が続くので、高さのアニメーションには使わない
  - 根拠：`BoxMeshDesc.ts:158-159`
  - 方針：`box: { width: 1, height: 1, depth: 1 }` の単位の箱を置き、`scale: { x: 幅, y: 高さ, z: 幅 }` で伸び縮みさせる
- 毎フレーム呼んでも描画は追いつく。描画ループは `setAnimationLoop` で毎フレーム回っている。`update()` は `needsUpdate` を出し、それを受けて次のフレームが描かれる。`animation: true` にしなくても、更新した次のフレームは描かれる
  - 根拠：`src/index.ts:2418`（`needsUpdate` → `forceUpdate`）、`src/index.ts:3305`（メインループ）、`src/index.ts:371-372`（`animation` の説明）
- アニメーションの時間管理は自分の `requestAnimationFrame` で持つ。`preRender` イベントは描画したフレームでしか出ないので、時計には向かない

判定を「条件付き」にした理由：高さは `scale` で変えるという条件が付く。実際のフレームレートは T3 で見る。

## 3. カメラの固定と setCamera — 使える

- `view.setCamera({ lng, lat, height, heading, pitch, roll })` で、カメラを一度に置ける（`src/index.ts:2870`）
- 操作を切る方法：`view.camera.options = { enableSpin: false, enableZoom: false, enableTilt: false }`
  - それぞれ、ドラッグでの回転、ホイールとピンチのズーム、傾き（Ctrl＋ドラッグ、右ドラッグ）を止める
  - 根拠：`dist/index.d.ts:2106-2136`
  - ドキュメント：https://navara.world/docs/three/api/camera/ （「Disable all interactive controls」の例がそのまま載っている）
- 章ごとにカメラを動かすには `view.flyTo()`（`src/index.ts:2949`）。ただし寄り道の章で呉に寄せるとき以外は、`setCamera` だけで足りる

注意：マウスとタッチのイベントは、上の設定に関係なく Navara に届く。止まるのはカメラの動きだけ。

## 4. 背景地図（TileJsonPlugin で Papers を読む）— 使える

- `TileJsonPlugin`（`@navaramap/three-plugins`）は TileJSON 3.0.0 を読み、`raster-tile`・`vector-tile`・`raster-dem` のどれかのソースとして登録する。どれにするかは呼ぶ側が `type` で指定する。文書の `attribution` は画面のクレジットに自動で載る
  - 根拠：`node_modules/@navaramap/three-plugins/src/TileJsonPlugin.ts` の冒頭コメントと型
  - ドキュメント：https://navara.world/docs/three_plugins/tilejsonplugin/
- Re:Earth Papers の中身（2026-11-22 に取得）
  - `https://papers.reearth.land/styles/protomaps-light/tilejson.json`：TileJSON 3.0.0。ラスタ（webp）、`tileSize: 512`、zoom 0〜22、`scheme: xyz`
  - `https://papers.reearth.land/styles/papers-light/tilejson.json`：同じ形式。yyamaが例に挙げた `id=papers-light` はこちら
  - どちらも、z4 のタイル（`/tile/4/14/6.webp`）が 200 で返ることを確かめた
  - クレジットは「Re:Earth Papers · © OpenStreetMap contributors」。TileJSON の `attribution` から自動で出る
- 呼び方の見込み：`await tilejson.addSource({ type: "raster-tile", url: ".../tilejson.json" })` → `view.addLayer({ type: "raster", source })`

注意・未確認

- TASKS.md には「papers の protomaps-light」とあり、yyamaの例は papers-light。**どちらのスタイルにするか**は見た目の判断なので、T2 で決める（URL の差し替えだけで済む）
- 0.3.1 でも、ラスタタイルのソースに `tileSize` の項目は無い（`dist/index.d.ts:10589-10599`）。TileJsonPlugin が `tileSize` を使うのも `raster-dem` だけ（`TileJsonPlugin.ts:359`）。512px のタイルが 256px 前提で扱われると、文字が小さく見える。これは T2 の画面で見る

## 5. GeoJSON ポリゴンを属性で塗り分ける — 使える

- `geojson` ソース（`url` か、その場のデータを渡す `data`）と `vector` レイヤーの `polygon` マテリアルで出せる
  - ドキュメント：https://navara.world/docs/three/source/geojson-source/ 、https://navara.world/docs/three/material/polygon-material/
- 地物ごとの色：レイヤーの `featureCreated`/`featureUpdated` で受け取った `evaluator.evaluate(({ properties }) => ({ color, opacity, show }))` で、属性（例：`rate1945`）から色を返す
  - 根拠：`node_modules/@navaramap/three/src/evaluations/FeatureEvaluator.ts`（`EvaluatableMaterialProperty`）
  - ドキュメント：https://navara.world/docs/three/api/feature-evaluator/
- 章を送って 1945 → 1950 と塗り直すときは、評価関数が見る年を変えて `layer.forceUpdate()` を呼ぶ
- 地面に貼る（`clampToGround: true`）場合、貼る先の地図タイルが要る。今回は背景地図があるので問題ない。ただし貼った面には外周線（`outline`）が出ない（スキル `references/declarative-api.md:41-42`、0.0.5 時点の記述）

TASKS.md T4 にある「属性で塗れなければ階級ごとにレイヤーを分ける」は、要らない見込み。

## 6. 地図上のテキストラベル — 条件付き

3つの方法すべてが 0.3.1 にある。

**a. vector レイヤーの `text` マテリアル（点の GeoJSON にラベルを付ける）**

- 項目：`text` `font` `size` `height` `color` `anchor` `backgroundColor` `declutter` `declutterPriority` `depthTest` など。0.3.1 で `anchor`・`offset`・`letterSpacing`・`outlineBlur` などが増えた
  - 根拠：`dist/index.d.ts` の `TextMaterial`、`FeatureEvaluator.ts` の `EvaluatableMaterialProperty`
  - ドキュメント：https://navara.world/docs/three/material/text-material/
- ラベルの文字は評価関数で返す。**`text` と `show: true` を両方返さないと出ない**（スキル `references/declarative-api.md:43`。0.0.5 時点の記述で、0.3.1 でも同じかは T3 で見る）
- 重なったラベルは、優先度の低い方が消える（`declutter` が既定で有効）。30本すべてを出すなら `declutter: false`。人口順に優先したいなら `declutterPriority` を使う
- 日本語：フォントを `view.addFontFamily(await fetchFontFamilyFromCss(...))` で登録する（`fetchFontFamilyFromCss` は `@navaramap/three` から出ている）
- 条件：ラベルを柱の頭に置くには、高さ（`height`）を評価関数で返す。柱を伸び縮みさせる1.5秒のあいだ追いかけるには、毎フレーム `forceUpdate()` が要り、その重さは見ていない。切り替え中はラベルを消し、着いてから出すなら問題ない

**b. OverlayPlugin（HTML を地図に重ねる）**

- `setPositions([{ id, lng, lat, alt }])` で位置を渡すと、`onUpdate(({ projected }) => ...)` に画面座標が毎描画ごとに届く。`moveOverlayElement(el, x, y)` で DOM を動かす
  - 根拠：`node_modules/@navaramap/three-plugins/src/OverlayPlugin.ts`
  - ドキュメント：https://navara.world/docs/three_plugins/overlayplugin/
- 条件：**`maxDistance` の既定は 100 km**（`OverlayPlugin.ts:93`）。それより遠い点は飛ばされる。日本全体を見るカメラは数千 km 先にあるので、`maxDistance` を大きくする必要がある
- 条件：柱の頭に付けるには、`alt` に柱の高さを入れ、伸び縮みに合わせて `setPositions` し直す
- 利点：文字は普通の HTML と CSS なので、日本語フォントや表示の切り替えが楽

**c. billboard マテリアル** — 画像のアイコン用。文字のラベルには a か b を使う

どちらにするかは T3 で決める。見込みとしては、文字の扱いやすさで b（OverlayPlugin）。

## 7. キー入力 — 条件付き

- Navara 側に、アプリ用のキー入力の仕組みは無い。**普通の `document.addEventListener("keydown", ...)` でよい**
- ただし Navara 自身も、`document` の `keydown`/`keyup` をすべてエンジンに渡している
  - 根拠：`node_modules/@navaramap/three/src/input.ts:112-157`
- エンジン本体（`@navaramap/engine` 0.3.1 の `navara_wasm_bg.wasm`）を文字列で検索した
  - `ArrowLeft`・`ArrowRight` などの矢印キーの名前は入っていなかった
  - 入っていたのは `ControlLeft`（Ctrl を押しながらの傾き操作）
  - このため、←→でカメラが動くことは無い見込み
- クレジット表示（AttributionPlugin）は `Escape` だけを見ている

判定を「条件付き」にした理由：矢印キーが無いことは、WASM の中の文字列で推測しただけ。T3 で←→を押して、カメラが動かないことを確かめる。

---

## 公開ドキュメントとの差（0.3.1 時点）

https://navara.world/docs/ は最新リリース（0.3.1）に、Nightly 版の機能を加えて書かれている。Nightly の機能は、印の付いたページだけにある（https://navara.world/docs/three/introduction/install/）。

| 項目 | ドキュメント | 入れた 0.3.1 |
|---|---|---|
| `geodetic`、`lit` | ある | ある |
| `PolygonMeshDesc` | ある | ある |
| `Text3DMeshDesc` | ある | 無い（Nightly の機能と見られる） |
| プラグイン | DevToolsPlugin、MaterialSchemaPlugin、StreetlightsPlugin、`maplibre-style`、`three-flood-mesh` がある | `three-plugins` にあるのは CesiumIon・Overlay・PersonView・TileJson の4つ。ほかは別パッケージか Nightly。今回は使わない |
| `box.draped` | 作成後は変えられないと書いてある | 今回は使わない |

0.0.5 → 0.3.1 の変更履歴（GitHub Releases）は読んでいない。

## スキルの更新（2026-11-22）

`.claude/skills/navara-usage/` は 0.0.5 向けに書かれていたので、0.3.1 に合わせて直した。直した点は次のとおり。

- 対象の版（0.3.1）を冒頭に書いた。「verified」と書かれた挙動は 0.0.5 で見たもので、0.3.1 では動かして確かめていないことも書いた
- 緯度経度の単位を、ラジアンから**度**に直した。`geodeticToVector3`・`sampleTerrainHeight`・`observeTerrainHeightAt`・`EllipsoidGeodesic` はどれも度で受け取る
  - 根拠：`three-api/src/index.ts:77-84`（`geodeticToVector3` の中で度をラジアンに変換している）、`three/src/index.ts:3029` 付近（`sampleTerrainHeight` の中で `degreeToRadian`）
- `geodetic` での置き方を足した。西・上・北の座標系で、Y が上になる
- `lit` を足した
- 高さのアニメーションは `scale` で行う、という注意を足した
- 描画は既定で必要なときだけ行われ、`preRender` を時計に使わない、という注意を足した
- `pick` イベントを `featureClick`・`featureHover`・`featureEnter`・`featureLeave` に直した。マウスのイベントは `MapMouseEvent` から `MapPointerEvent` に変わったので、それに合わせた
- `flyTo` の引数を、`flyTo(位置, duration, maxHeight)` の並びから、`flyTo(位置, { duration, maxHeight, easing })` のオブジェクトに直した。戻り値は Promise
- `view.camera.options` でカメラ操作を切る例を足した
- キー入力について、Navara が document の keydown を拾っていることを足した
- ドキュメントの URL を `https://navara.world/docs/` に直した

確かめ方：直した例（柱の置き方、`featureClick`、`flyTo`、`camera.options`、TileJsonPlugin など）を一時ファイルに書き、0.3.1 の型で `tsc` が通ることを確かめた。確かめたあと、一時ファイルは消した。

`recipes.md` と `plugins.md` の本文は 0.3.1 でも合っていたので、URL の直し以外は変えていない。

## T4 で使った API（2026-11-22、0.3.1）

寄り道の章の都道府県の面（src/prefectures.ts）。5. の方法そのまま。

- `view.addSource({ type: "geojson", url })`：`GeoJsonSourceDescription` に `url`・`data`・`tiled`・`crs`（`dist/index.d.ts:5319`）
- `view.addLayer({ type: "vector", source, polygon: { color, opacity, clampToGround: true } })`：`PolygonMaterial` の項目は `color`・`opacity`・`clampToGround`・`lit`・`outlineColor`・`outlineShow`・`height`・`extrudedHeight` など（`dist/index.d.ts:8993`）。`color` は `Color` を渡す（スキル `declarative-api.md:36`）
- 地物ごとの色：`layer.on("featureCreated" | "featureUpdated", ({ evaluator }) => evaluator.evaluate(cb, { filters }))`。`cb` の型は `FeatureEvaluatorCallback = (info: FeatureInfo) => Partial<EvaluatedValue>`（`dist/index.d.ts:4955-4965`）。`show` と `color` を返す。`filters` で読む属性を絞る（スキル `low-level-api.md:7-28`）
  - 塗り直しで `featureUpdated` がまた来るように、スキルの例にある「同じ evaluator.id は飛ばす」はしない（47県なので毎回評価しても軽い）
- 年を変えたら `layer.forceUpdate()`（`dist/index.d.ts:6633`、スキル `low-level-api.md:30`）
- 今のカメラ：`view.camera.positionGeographic`（`LatLngHeight`）と `view.camera.orientation`（heading・pitch・roll）（`dist/index.d.ts:13440-13441`、スキル `declarative-api.md:98`）。どちらも `CameraPosition` と同じ型（`LatLngHeight`・`CameraOrientation`、`dist/index.d.ts:2281-2292`）なので、そのまま `setCamera`・`flyTo` に `height` 付きで渡して戻せる。2026-11-22 に呉へ寄るのをやめたので、今のコードでは使っていない。2026-11-22 yyamaが開発サーバーで、アニメーション ON・OFF とも、呉で寄ったカメラが戻ることを含めて動作を確認

## T5 で使った API（2026-11-22、0.3.1）

クレジット（src/credits.ts）。`@navaramap/three` と `@navaramap/three-plugins` の型（d.ts）で確かめた。

- `view.attribution`：組み込みのクレジット表示（ⓘ ボタンと開閉するカード）。`get attribution(): AttributionPlugin | undefined`（`three/dist/index.d.ts:12790`）。`defaultAttribution: false` で作ったときだけ `undefined`
- `view.attribution?.add(items: AttributionItem[])`（`three/dist/index.d.ts:585`）。同じものは1つにまとめられる
  - `AttributionSource`：`attribution`（名前）・`attributionUrl`・`children`（`AttributionChild[]`、`attribution` に部分的な `<a>` を書ける）など（`three/dist/index.d.ts:517`・`704`）
- 背景地図のクレジット：`TileJsonPlugin.addSource()` が TileJSON の `attribution` を `view.attribution` に自動で入れる（`three-plugins/dist/index.d.ts:709-721`）。開発サーバーで「Re:Earth Papers · © OpenStreetMap contributors」が入っていることを確かめた
- カードは閉じた状態が初期表示（`show()`・`hide()` で開閉）。プロジェクターでも出典が分かるよう、左下に常に出す1行は HTML で別に作った（2026-11-22 yyamaの指示）

## 入れ替わりを光らせる（2026-11-22、0.3.1）

上位30に入った柱・外れた柱の見せ方（src/changes.ts、src/pillars.ts の setHighlights、src/main.ts）。型定義（d.ts）と、ライブラリの中身・開発サーバーでの動作で確かめた。

- 効果を足す：`view.addEffect({ id, selectiveBloom: { strength, radius, threshold } })`、`view.addEffect({ id, selectiveOutline: { color, thickness } })`。`SelectiveBloomConfig`・`SelectiveOutlineConfig`（`three-default-descs/dist/index.d.ts`）。効果の key は `selectiveBloom`・`selectiveOutline`
- 柱を選ぶ：箱（`BoxMeshDesc`）の `box.effectIds` に、上で付けた効果の `id` を入れた柱だけに効果がかかる。ライブラリの中で、効果の `id` ごとにマスクの番号が振られる（`SelectiveEffectRegistry.registerSlot(this.id)`、最大11個）
- 光：`box.emissiveColor`（`Color`）と `box.emissiveIntensity`。SelectiveBloom は発光（emissive）の出力をもとににじませる。発光の色は柱の色に足し合わされるので、青い柱に黄色の光を強く足すと白っぽくなり、弱いと明るい地図の上で見えにくかった。そのため、入った柱は色（`box.color`）そのものをオレンジに変え、光は軽く添えた
- 輪郭：SelectiveOutline は、半透明（不透明度 0.35）の柱にも付いた
- 付け外し：`handle.update({ box: { effectIds, emissiveColor, emissiveIntensity, color } })`（部分の更新）

## 3D地形（2026-11-22、0.3.1）

src/main.ts の地形と光、src/ground.ts の柱の根元。型定義（d.ts）、スキルの recipes.md、ライブラリの中身と開発サーバーでの動作で確かめた。

- 地形：`view.addSource({ type: "quantized-mesh", url, maxZoom, requestVertexNormals, requestWaterMask })` と `view.addLayer({ type: "terrain", source, terrain: { ... } })`（スキル `recipes.md`）。背景地図の層より先に足す（層は足した順に描く）
  - `maxZoom` は Re:Earth Terrain の `layer.json` の `maxzoom`（14）に合わせた
- 高さの強調：`TerrainMaterial` の `exaggeration`（既定 1）と `exaggerationRelativeHeight`（既定 0）。描く高さは `(h - relativeHeight) * exaggeration + relativeHeight`（`three/dist/index.d.ts:11833` 付近）
- 地面の高さ：`view.observeTerrainHeightAt({ lat, lng }, cb)`（度。`dist/index.d.ts:13337`）と `view.sampleTerrainHeight({ lat, lng })`。返る高さは強調したあとの、画面に描かれている地面の高さ（楕円体から）。開発サーバーで、松本の辺りで約6,370m（標高約590m＋ジオイド高 約40m の10倍）、東京で約716m だった。カメラが寄って細かい地形が読み込まれると、また呼ばれる
- 光：法線のある地形は、光が無いと黒くなる（スキル SKILL.md の Lighting）。`view.addLight({ sun: { castShadow, intensity } })` と `view.addLight({ ambient: { intensity } })`（`three-default-descs` の `SunLightConfig`・`AmbientLightConfig`）。太陽の向きは `view.atmosphere.date`（`Date`）から決まるので、日時を固定した。柱は `lit: false` なので光の影響を受けない
- クレジット：地形のクレジットは `view.attribution` に自動では入らなかった（TileJsonPlugin の背景地図とは違う）。constants.ts の CREDIT_ITEMS で足した
- 海の波の表現（`requestWaterMask: true`）を付けると画面が真っ黒になった。地形のシェーダーが組み立てられないため。`requestWaterMask: false` にした
- `requestWaterMask: false` でも、コンソールに地形のシェーダーの組み立ての失敗（MeshLambertMaterial、`transformDirectionByInverseViewMatrix` が無い）が出る。この関数は three.js 0.185 以降の `common.glsl.js` にあり、このリポジトリの three.js 0.184 には無い（`@navaramap/three` 0.3.1 の peerDependencies は `three >= 0.183.0`）。地形と陰影は描かれている
- 地形を入れると、開いてから地図が出るまでが長くなった（開発サーバーで、地形なし約7秒 → あり約10〜16秒。それまでは黒い画面）
