// 人口と名前の表示の形。画面のラベル（src/labels.ts・main.ts）と scripts/spot-check.ts が同じものを使う。

/** 人口を「112万」「8.2万」の形にする（10万以上は整数、未満は小数1桁） */
export function formatPopulation(pop: number): string {
  const man = pop / 10_000;
  return man >= 10 ? `${Math.round(man)}万` : `${(Math.round(man * 10) / 10).toFixed(1)}万`;
}

/**
 * ラベルの（）に出す今の名前。出さないときは null。
 * - 当時の名前と同じ、または当時の名前に「市」を付けただけ（1886年の「大阪」→「大阪市」など）のときは出さない
 * - 比べるのはデータの名前。表示は display で置き換える（東京の「特別区部」→「東京23区」）
 */
export function nowNameForLabel(nameThen: string, nameNow: string | null, display: Record<string, string> = {}): string | null {
  if (!nameNow || nameNow === nameThen || nameNow === `${nameThen}市`) return null;
  return display[nameNow] ?? nameNow;
}

/** 総人口を「3,854万人」「1億2,693万人」の形にする（万人未満は四捨五入） */
export function formatNationalPopulation(pop: number): string {
  const man = Math.round(pop / 10_000);
  const oku = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (oku === 0) return `${rest.toLocaleString("en-US")}万人`;
  return rest === 0 ? `${oku}億人` : `${oku}億${rest.toLocaleString("en-US")}万人`;
}
