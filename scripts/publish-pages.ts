// GitHub Pages（ブランチ公開）に出すビルド結果を、gh-pages ブランチにコミットする。push はしない。
// 実行：pnpm publish:pages（公開用リポジトリで。手順は README の「公開のしかた」）
//
// - GitHub Actions は使わない。Pages は「Deploy from a branch」の gh-pages・/(root) で出す（main の docs/ は文書とスクショに使っているため）
// - やること：
//   1. コミットしていない変更があれば止める（ビルドの中身と、メッセージに入れるハッシュを食い違わせないため）
//   2. pnpm build
//   3. dist に、100MB を超えるファイル（GitHub に上げられない）と、_ で始まるファイル・フォルダが無いかを見て表示する。100MB を超えるものがあれば止める
//   4. git worktree で gh-pages を一時フォルダ（OS の Temp の下）に出す。
//      手元に gh-pages があればそれを、無くて origin/gh-pages があればそこから作る（fetch はしない）。どちらも無ければ、ほかの履歴を持たない新しいブランチとして作る
//   5. 一時フォルダの中身を dist の中身で置き換え、空の .nojekyll を足す（Jekyll を通さず、_ で始まるファイルもそのまま出すため）
//   6. コミットする。メッセージに元にしたコミットの短いハッシュを入れる。前のコミットと中身が同じならコミットしない
//   7. 一時フォルダの worktree を外し、gh-pages の中身（ファイル数・合計の大きさ・.nojekyll の有無）を表示する
// - 外部のパッケージは使わず、git と pnpm を呼ぶだけ。Windows の PowerShell で動く
// - コミットの名前とメールは、このリポジトリの git の設定のまま

import { execFileSync, execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";

const BRANCH = "gh-pages";
const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const WORKTREE = join(tmpdir(), `${basename(ROOT)}-${BRANCH}`);
/** GitHub に上げられる1ファイルの大きさの上限 */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** git を実行して標準出力を返す。失敗したら例外 */
const git = (args: string[], cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
/** git を実行して、成功したか（終了コード 0 か）だけを返す */
const gitOk = (args: string[], cwd = ROOT) => spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

function fail(message: string): never {
  console.error(`\n止めました：${message}`);
  process.exit(1);
}

/** フォルダの中のファイルを、相対パス（/ 区切り）と大きさで全部返す */
function listFiles(dir: string): { path: string; bytes: number }[] {
  const out: { path: string; bytes: number }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push({ path: relative(dir, p).split(sep).join("/"), bytes: statSync(p).size });
    }
  };
  walk(dir);
  return out;
}

/** 前の実行で残った一時フォルダの worktree を外す */
function removeWorktree(): void {
  if (existsSync(WORKTREE)) {
    if (!gitOk(["worktree", "remove", "--force", WORKTREE])) rmSync(WORKTREE, { recursive: true, force: true });
  }
  git(["worktree", "prune"]);
}

// 1. コミットしていない変更があれば止める
const dirty = git(["status", "--porcelain"]);
if (dirty) fail(`コミットしていない変更があります。コミットしてから実行してください。\n${dirty}`);
const sourceBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const sourceHash = git(["rev-parse", "--short", "HEAD"]);

// 2. ビルド
console.log(`${sourceBranch} ${sourceHash} をビルドします（pnpm build）\n`);
execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });

// 3. dist の点検
const distFiles = listFiles(DIST);
const tooLarge = distFiles.filter((f) => f.bytes > MAX_FILE_BYTES);
const underscored = distFiles.filter((f) => f.path.split("/").some((part) => part.startsWith("_")));
const largest = distFiles.reduce((a, b) => (b.bytes > a.bytes ? b : a));
console.log("\ndist の点検");
console.log(`- ファイル ${distFiles.length} 個、合計 ${mb(distFiles.reduce((s, f) => s + f.bytes, 0))}。いちばん大きいのは ${largest.path}（${mb(largest.bytes)}）`);
console.log(`- 100MB を超えるファイル：${tooLarge.length ? tooLarge.map((f) => `${f.path}（${mb(f.bytes)}）`).join("、") : "無し"}`);
console.log(`- _ で始まるファイル・フォルダ：${underscored.length ? underscored.map((f) => f.path).join("、") : "無し"}（.nojekyll を置くので、あってもそのまま出る）`);
if (tooLarge.length) fail("100MB を超えるファイルは GitHub に上げられません。");

// 4. gh-pages を一時フォルダに出す
removeWorktree();
if (gitOk(["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`])) {
  git(["worktree", "add", WORKTREE, BRANCH]);
} else if (gitOk(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${BRANCH}`])) {
  git(["worktree", "add", "-b", BRANCH, WORKTREE, `origin/${BRANCH}`]);
} else {
  console.log(`\n${BRANCH} ブランチが無いので、ほかの履歴を持たない新しいブランチとして作ります`);
  git(["worktree", "add", "--orphan", "-b", BRANCH, WORKTREE]);
}

try {
  // 5. 中身を dist の中身で置き換え、.nojekyll を足す
  for (const name of readdirSync(WORKTREE)) {
    if (name !== ".git") rmSync(join(WORKTREE, name), { recursive: true, force: true });
  }
  cpSync(DIST, WORKTREE, { recursive: true });
  writeFileSync(join(WORKTREE, ".nojekyll"), "");

  // 6. コミット（改行コードを変えずに、ビルド結果のとおりに入れる）
  git(["-c", "core.autocrlf=false", "add", "-A"], WORKTREE);
  const message = `${sourceBranch} ${sourceHash} のビルド結果`;
  if (gitOk(["diff", "--cached", "--quiet"], WORKTREE) && gitOk(["rev-parse", "--verify", "--quiet", "HEAD"], WORKTREE)) {
    console.log(`\n${BRANCH} の中身は前のコミットと同じなので、コミットしませんでした`);
  } else {
    git(["commit", "-q", "-m", message], WORKTREE);
    console.log(`\n${BRANCH} にコミットしました：${git(["rev-parse", "--short", "HEAD"], WORKTREE)} ${message}`);
  }
} finally {
  // 7. 一時フォルダの worktree を外す
  removeWorktree();
}

// gh-pages の中身（コミットされたもの）
const tree = git(["ls-tree", "-r", "-l", BRANCH])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [meta, path] = line.split("\t");
    return { path, bytes: Number(meta.trim().split(/\s+/)[3]) };
  });
console.log(`\n${BRANCH} の中身`);
console.log(`- ファイル ${tree.length} 個、合計 ${mb(tree.reduce((s, f) => s + f.bytes, 0))}`);
console.log(`- .nojekyll：${tree.some((f) => f.path === ".nojekyll") ? "あり" : "無し"}`);
console.log(`- index.html：${tree.some((f) => f.path === "index.html") ? "あり" : "無し"}`);
console.log(`\ngit push origin ${BRANCH} で公開されます`);
