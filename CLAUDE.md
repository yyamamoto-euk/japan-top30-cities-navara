# CLAUDE.md

Navaraで見る日本の人口　上位30都市の推移　明治から令和まで（1886〜2025）。仕様は SPEC.md、作業の順番と依頼文は TASKS.md。

## 環境

- Windows／PowerShell。Node（fnm）、pnpm、Vite、TypeScript
- 開発サーバー（pnpm dev、ポート8080）はyyamaが別ターミナルで動かしている → 起動も停止もしない
- コマンドはPowerShellで動く形で書く。なるべく package.json の script 経由にする
- スクリプトはTypeScriptで書き、tsxで実行する（案）

## 進め方

- 1回の依頼＝TASKS.md の1タスク
- 実装の前に計画を出す（触るファイル、やること、完了条件の確かめ方）。OKが出てから書く
- 完了条件を満たしたら、やったことと未解決を短く報告してコミット（1タスク1コミット）
- 画面の見た目の良し悪しは判断しない。スクショはyyamaが撮る
- SPECに無い判断が要るときは、案を2つまで出して止まる

## Navara

- NavaraのAPIは `.claude/skills/navara-usage/` と公式ドキュメント（https://navara.world/docs/）で確かめてから書く
- テンプレに入っている `@navaramap/*` の版とドキュメントの版が違うときは、テンプレの版を正とし、差を報告する
- 見つからないAPIを推測で書かない。止まって報告する
- 確かめたAPIは `docs/navara-api-check.md` に追記していく

## データ

- 数値の正は `data/observations.csv`、出典は `data/sources.csv`、柱の定義は `data/entities.csv`
- `public/data/` 以下は生成物。`scripts/` で作り、手で直さない
- 同じ年・同じ柱に複数行あるときの採用順：一次照合済 → 二次のみ → 要照合。「矛盾あり」は採用しない
- 数値を推測や記憶で埋めない。無い値は空欄にして note に理由を書く
- PDFや画像から起こした値は status を「要照合」で入れ、note に出典のページ番号を書く
- status を「一次照合済」に変えるのは、yyamaの指示があったときか、機械可読の一次資料（e-StatのCSVなど）と完全一致したときだけ
- `data/raw/` の原本は書き換えない

## 用語

- 柱（entity）：年をまたいで続く街1つ。名前が変わっても同じ柱（例：東京 → 東京市 → 特別区部）
- 合併：別の柱に吸収された街は `merged_into` に吸収先と年を持つ（例：八幡市 → 北九州、渋谷町 → 東京）
- 和集合：どこかの年で30位以内に入った柱の集まり
- 寄り道の章：1940 → 1945 → 1950

## ディレクトリ（案）

```
CLAUDE.md / SPEC.md / TASKS.md
data/
  observations.csv   数値の正
  sources.csv        出典
  entities.csv       柱の定義（T1で作る）
  prefectures_pop.csv 寄り道章の都道府県人口（D3で作る）
  check/             照合表（yyamaが見る）
  raw/               原本。書き換えない
scripts/             データ生成と検証
public/data/         生成物。手で直さない
src/                 画面
docs/                API確認メモなど
```
