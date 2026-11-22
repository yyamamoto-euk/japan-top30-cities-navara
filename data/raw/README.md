# data/raw：原本

統計表などの原本を置くフォルダです。中身は書き換えません。

## リポジトリに入れていない原本

次の原本は、利用条件のためリポジトリに入れていません（`.gitignore` で外しています）。スクリプトを動かすときは、取得先から取ってきて、同じ場所に置いてください。取得日や大きさは [`data/sources.csv`](../sources.csv) の note にあります。

| 置く場所 | 中身 | 取得先 | 入れない理由 |
|---|---|---|---|
| `sapporo/00-02_r2.pdf` | 札幌市統計書 表2-1 人口の推移 | https://www.city.sapporo.jp/toukei/tokeisyo/documents/00-02_r2.pdf | 転載には事前の相談が要る |
| `1940-1950/kure_109550.xls` | 呉市統計書 B-1 世帯・人口の推移 | https://www.city.kure.lg.jp/soshiki/7/stat2allr07.html | 転載には事前の相談が要る |
| `1886/yb07_043.jpg`・`yb07_044.jpg` | 第7回 日本帝国統計年鑑 第24表 | https://d-infra.ier.hit-u.ac.jp/Japanese/govstat-database/statistical-yb/1888/ | 一橋大学経済研究所のデータベースの画像。利用条件の記載がない |
| `1908/` | 第31回・第33回 日本帝国統計年鑑 表21・表26〜28 | https://d-repo.ier.hit-u.ac.jp/records/2007233 ほか（sources.csv） | 同上 |
| `1925/` | 第47回 日本帝国統計年鑑 表13・表14 | https://d-repo.ier.hit-u.ac.jp/records/2006526 ・ 2006527 | 同上 |
| `1940-1950/yb1949_*`・`yb1951_*` | 日本統計年鑑（1949年刊）表27、（1951年刊）表10 の画像とテキスト | https://d-infra.ier.hit-u.ac.jp/Japanese/govstat-database/statistical-yb/1949/ ・ 1951/ | 同上 |
| `N03/` | 国土数値情報 行政区域データ（今は使っていない） | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html | 大きすぎる（約600MB） |

画面の値は、これらの原本から作った `data/observations.csv` に入っているので、原本が無くても `pnpm data:build` と `pnpm dev` は動きます。原本が要るのは、`pnpm data:1940-1950` など、原本から行を作り直すスクリプトだけです。

## リポジトリに入れている原本

e-Stat（政府標準利用規約）と総務省統計局のウェブサイト（公共データ利用規約）の資料です。どちらも CC BY 4.0 と互換で、出典を書けば再配布できます。柱の座標に使う OpenStreetMap と国土地理院の地名検索の応答も入れています（下の2つ）。

- `1975/`：昭和50年国勢調査報告 表14・表16
- `2000/`：平成12年国勢調査 都道府県結果 表1（47都道府県）
- `2025/`：令和7年国勢調査 人口等基本集計 表1-1
- `national/`：第75回 日本統計年鑑 表2-1 人口の推移
- `1940-1950/y750203000.xlsx`：第75回 日本統計年鑑 表2-3 都道府県別人口
- `1940-1950/c1947_t3_cities100k.pdf`・`c1950_t13_cities100k.pdf`：昭和22年臨時国勢調査、昭和25年国勢調査の表
- `osm/townhall-japan.json`：OpenStreetMap の日本の役所（amenity=townhall）。Overpass API の応答をそのまま保存（`pnpm data:fetch-osm`）。**Open Database License（ODbL）1.0**、© OpenStreetMap contributors（https://www.openstreetmap.org/copyright）
- `gsi/townhall-search.json`：国土地理院の地名検索（地理院地図の検索窓と同じ API）で「○○市役所」を引いた応答27件。値は応答のまま（読みやすいよう改行だけ入れた）。国土地理院コンテンツ利用規約（地名検索 API そのものの利用条件のページは未確認）
