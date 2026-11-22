// 古い Excel 形式（.xls）を、Windows の Excel で開いて TSV（UTF-8）に書き出す。
// exceljs は .xls を読めない。SheetJS を URL から入れるのは避けたので、この PC の Excel を使う（2026-11-22）。
// - 原本は読み取り専用で開き、書き換えない
// - 1枚目のシートの UsedRange の値（Value2）を、そのままタブ区切りで書く
// - Windows と Excel が要る。出力先は data/work/（git に入れない）

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/** srcDir の *.xls を outDir/*.tsv にする。すでに TSV があるファイルは飛ばす。書き出した数を返す */
export function xlsToTsv(srcDir: string, outDir: string): number {
  mkdirSync(outDir, { recursive: true });
  const todo = readdirSync(srcDir)
    .filter((f) => /\.xls$/i.test(f))
    .filter((f) => !existsSync(join(outDir, basename(f, ".xls") + ".tsv")));
  if (todo.length === 0) return 0;
  if (process.platform !== "win32") throw new Error(".xls の変換は Windows の Excel で行う（scripts/lib/xls.ts）");
  const list = todo.map((f) => `'${join(srcDir, f).replace(/'/g, "''")}'`).join(",");
  const ps = `
$ErrorActionPreference = 'Stop'
$x = New-Object -ComObject Excel.Application; $x.Visible = $false; $x.DisplayAlerts = $false; $x.AutomationSecurity = 3
$enc = New-Object System.Text.UTF8Encoding($false)
try {
  foreach ($p in @(${list})) {
    $wb = $x.Workbooks.Open($p, 0, $true)
    $v = $wb.Worksheets.Item(1).UsedRange.Value2
    $sb = New-Object System.Text.StringBuilder
    for ($r = 1; $r -le $v.GetLength(0); $r++) {
      $line = @(); for ($c = 1; $c -le $v.GetLength(1); $c++) { $line += ([string]$v[$r, $c]) -replace "[\`t\`r\`n]", " " }
      [void]$sb.AppendLine($line -join "\`t")
    }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($p) + '.tsv'
    [System.IO.File]::WriteAllText((Join-Path '${outDir.replace(/'/g, "''")}' $name), $sb.ToString(), $enc)
    $wb.Close($false)
  }
} finally { $x.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x) }
`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });
  return todo.length;
}
