// public/data/cities.json（scripts/build-data.ts の出力）と、
// テスト用の仮データ dummy-cities.json（scripts/build-dummy.ts の出力）の型と読み込み。

export type YearKey = string; // "1886" など

export type City = {
  id: string;
  pref: string;
  lon: number | null;
  lat: number | null;
  merged_into: string | null;
  merged_year: number | null;
  name: Record<YearKey, string>;
  /** 今の名前（scripts/build-data.ts。2025年の名前、吸収された柱は吸収先の名前） */
  name_now: string | null;
  pop: Record<YearKey, number | null>;
  rank: Record<YearKey, number | null>;
  status: Record<YearKey, string>;
  source: Record<YearKey, string>;
  note: Record<YearKey, string>;
};

export type CitiesData = {
  years: number[];
  /** 各年の日本の総人口（人）。scripts/build-data.ts が data/national_pop.csv から書く */
  national: Record<YearKey, { pop: number; source: string; note: string }>;
  cities: City[];
};

export type DummyData = {
  years: number[];
  cities: { id: string; pop: Record<YearKey, number>; rank: Record<YearKey, number>; dummy: Record<YearKey, true> }[];
};

/** ある年の、柱ごとの値 */
export type YearValue = { pop: number; rank: number | null; dummy: boolean };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} を読めません（${res.status}）`);
  return (await res.json()) as T;
}

export const loadCities = (url: string) => fetchJson<CitiesData>(url);

/** 仮データは無くても動くようにする（無ければ実データだけで描く） */
export async function loadDummy(url: string): Promise<DummyData | null> {
  try {
    return await fetchJson<DummyData>(url);
  } catch {
    return null;
  }
}

/**
 * ある年に画面へ出す値。
 * 仮データの年は、仮データの pop と rank（実データと合わせて付け直した順位）を使う。
 * それ以外の年は実データだけを使う。
 */
export function valuesForYear(data: CitiesData, dummy: DummyData | null, year: number): Map<string, YearValue> {
  const y = String(year);
  const out = new Map<string, YearValue>();
  if (dummy && dummy.years.includes(year)) {
    for (const d of dummy.cities) {
      const pop = d.pop[y];
      if (pop != null && pop > 0) out.set(d.id, { pop, rank: d.rank[y] ?? null, dummy: !!d.dummy[y] });
    }
    return out;
  }
  for (const c of data.cities) {
    const pop = c.pop[y];
    if (pop != null && pop > 0) out.set(c.id, { pop, rank: c.rank[y] ?? null, dummy: false });
  }
  return out;
}
