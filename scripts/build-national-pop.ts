// 各年の日本の総人口を data/national_pop.csv に書き出す（年表と画面下の年の隣に出す）。
// 実行：pnpm data:national
//
// 原本（書き換えない）
// - 1886〜2010年：第75回 日本統計年鑑 表2-1「人口の推移」（総務省統計局）
//   data/raw/national/y750201a00.xlsx（A 明治5年〜大正9年）・y750201b00.xlsx（B 大正9年〜令和6年）。単位は千人
// - 2025年：令和7年国勢調査 人口等基本集計 表1-1 の「全国」（data/raw/2025/b01_01.xlsx）。単位は人
//
// - 単位は原本どおり（unit 列）。千人の値に 0 を足して人に直さない（画面に出すときに直す）
// - 年ごとの定義の違い（表の注記）を note に書く。1940・1945年は注記の補正の計算が表の値と合うことを確かめる
// - 機械可読の一次資料の値そのものなので status は「一次照合済」
// - 年や並びが想定と違ったら止める

import ExcelJS from "exceljs";
import { writeCsv } from "./lib/csv.ts";
import { ROOT, YEARS } from "./lib/data.ts";

const RAW = ROOT + "data/raw/national/";
const OUT = ROOT + "data/national_pop.csv";
const HEADER = ["year", "pop", "unit", "source_id", "status", "note"];

const cellNum = (v: unknown): number =>
  typeof v === "number" ? v : v && typeof v === "object" && "result" in v ? Number((v as { result: unknown }).result) : NaN;

/** 表2-1 の1枚から、西暦 → 総数（千人）を読む。A は西暦が2列目・総数が3列目、B は西暦が2列目・総数が4列目 */
async function readTable(file: string, popCol: number): Promise<Map<number, number>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(RAW + file);
  const ws = wb.worksheets[0];
  const out = new Map<number, number>();
  ws.eachRow((row) => {
    const year = cellNum(row.getCell(2).value);
    const pop = cellNum(row.getCell(popCol).value);
    if (Number.isInteger(year) && year >= 1872 && year <= 2100 && Number.isFinite(pop)) out.set(year, pop);
  });
  return out;
}

const a = await readTable("y750201a00.xlsx", 3);
const b = await readTable("y750201b00.xlsx", 4);

/** 表2-1 の注記（年ごと） */
const NOTES: Record<number, string> = {
  1886: "内閣統計局の推計。1月1日現在の内地の日本人の人口（表2-1 A の注記）。都市の値（12月31日現在の現住人口）とは日付と数え方が違う",
  1908: "内閣統計局の推計。1月1日現在の内地の日本人の人口（表2-1 A の注記）。都市の値（12月31日現在の現住人口）とは日付と数え方が違う",
  1925: "10月1日現在。国勢調査人口",
  1940: "10月1日現在。国勢調査の人口 73,114,308 から海外にいる軍人・軍属の推計 1,181,000 を引いた補正人口（表2-1 B の注記 b）",
  1945: "10月1日現在。11月1日の人口調査の人口 71,998,104 に軍人・軍属と外国人の推計 149,000 を足した補正人口（表2-1 B の注記 c）。沖縄県を除く",
  1950: "10月1日現在。国勢調査人口。沖縄県を含む（表2-1 B の注記 f）",
  1965: "10月1日現在。国勢調査人口",
  1975: "10月1日現在。国勢調査人口",
  1990: "10月1日現在。国勢調査人口",
  2000: "10月1日現在。国勢調査人口",
  2010: "10月1日現在。国勢調査人口",
};

const rows: Record<string, string>[] = [];
for (const year of YEARS) {
  if (year === 2025) continue;
  const table = year < 1920 ? a : b;
  const pop = table.get(year);
  if (pop === undefined) throw new Error(`表2-1 に ${year} 年がありません`);
  rows.push({
    year: String(year),
    pop: String(pop),
    unit: "千人",
    source_id: "S_NATIONAL_YB75_T2_1",
    status: "一次照合済",
    note: `第75回 日本統計年鑑 表2-1（${year < 1920 ? "y750201a00.xlsx" : "y750201b00.xlsx"}）。${NOTES[year]}`,
  });
}

// 注記の補正の計算が表の値（千人）と合うか
const check = (year: number, value: number) => {
  const pop = Number(rows.find((r) => r.year === String(year))!.pop);
  if (Math.round(value / 1000) !== pop) throw new Error(`${year}年：注記の補正 ${value} が表の値 ${pop} 千人と合いません`);
};
check(1940, 73_114_308 - 1_181_000);
check(1945, 71_998_104 + 149_000);

// 2025年：国勢調査 表1-1 の全国
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ROOT + "data/raw/2025/b01_01.xlsx");
const ws = wb.worksheets[0];
let national: number | null = null;
ws.eachRow((row) => {
  if (national === null && String(row.getCell(7).value ?? "") === "0001_全国") national = cellNum(row.getCell(8).value);
});
if (national === null || !Number.isInteger(national)) throw new Error("表1-1 に全国の人口がありません");
// 表2-1 の2020年（千人）と表1-1 の2020年の人口（組替）が合うかで、単位と列の読み違いを確かめる
const census2020 = (() => {
  let v: number | null = null;
  ws.eachRow((row) => {
    if (v === null && String(row.getCell(7).value ?? "") === "0001_全国") v = cellNum(row.getCell(11).value);
  });
  return v;
})();
if (census2020 === null || Math.round(census2020 / 1000) !== b.get(2020)) throw new Error(`2020年：表1-1 の ${census2020} と表2-1 の ${b.get(2020)} 千人が合いません`);
rows.push({
  year: "2025",
  pop: String(national),
  unit: "人",
  source_id: "S2025_ESTAT",
  status: "一次照合済",
  note: "令和7年国勢調査 人口等基本集計 表1-1 の全国（data/raw/2025/b01_01.xlsx）。10月1日現在",
});

writeCsv(OUT, HEADER, rows);
console.log(`data/national_pop.csv：${rows.length} 年`);
for (const r of rows) console.log(`  ${r.year}：${Number(r.pop).toLocaleString("en-US")} ${r.unit}`);
console.log(`確かめたこと：1940・1945年の注記の補正が表の値と一致。表2-1 の2020年（${b.get(2020)} 千人）と国勢調査 表1-1 の2020年（${census2020}）が一致`);
