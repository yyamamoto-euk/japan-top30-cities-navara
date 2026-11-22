// 柱どうしが重ならないように、画面に描く位置を少しずつずらす。
// データ（entities.csv の座標）は変えない。ずらすのは表示の位置だけ。
//
// 決め方
// - 同じ年に両方とも値がある（同時に画面に出うる）2本だけを対象にする
// - 中心どうしの距離が「柱の幅 + すき間」より近ければ、2本を離れる向きに押す。
//   押す量は人口（全年の最大）の逆比で分ける。人口の大きい柱ほど動かない
// - 全年の柱をまとめて一度だけ計算する。年を切り替えても柱は横に動かない

import type { City } from "./cities.ts";

const EARTH_RADIUS = 6_371_000; // m
const DEG = Math.PI / 180;

export type PlacedPosition = {
  lon: number;
  lat: number;
  /** 元の座標からのずれ（m） */
  shift: number;
};

type Node = {
  id: string;
  lon: number;
  lat: number;
  weight: number;
  years: Set<string>;
};

/** 2点の差を、その場の東西・南北のメートルで返す */
function deltaMeters(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const meanLat = ((a.lat + b.lat) / 2) * DEG;
  return {
    dx: (b.lon - a.lon) * DEG * EARTH_RADIUS * Math.cos(meanLat),
    dy: (b.lat - a.lat) * DEG * EARTH_RADIUS,
  };
}

function moveMeters(n: Node, dx: number, dy: number) {
  n.lat += dy / EARTH_RADIUS / DEG;
  n.lon += dx / (EARTH_RADIUS * Math.cos(n.lat * DEG)) / DEG;
}

export function layoutPillars(
  cities: City[],
  width: number,
  gap: number,
  maxIterations = 500,
): Map<string, PlacedPosition> {
  const nodes: Node[] = [];
  for (const c of cities) {
    if (c.lon === null || c.lat === null) continue;
    const years = new Set(Object.keys(c.pop).filter((y) => (c.pop[y] ?? 0) > 0));
    if (years.size === 0) continue;
    const weight = Math.max(...[...years].map((y) => c.pop[y] ?? 0));
    nodes.push({ id: c.id, lon: c.lon, lat: c.lat, weight, years });
  }

  // 同時に出うる組だけを対象にする
  const pairs: [Node, Node][] = [];
  for (let i = 0; i < nodes.length; i++)
    for (let k = i + 1; k < nodes.length; k++) {
      const a = nodes[i];
      const b = nodes[k];
      if ([...a.years].some((y) => b.years.has(y))) pairs.push([a, b]);
    }

  const minDist = width + gap;
  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    for (const [a, b] of pairs) {
      let { dx, dy } = deltaMeters(a, b);
      let dist = Math.hypot(dx, dy);
      if (dist >= minDist - 1) continue; // 1m 未満の不足は無視
      if (dist < 1e-6) {
        // まったく同じ位置：東西に分ける（決まった向きにして結果を毎回同じにする）
        dx = 1;
        dy = 0;
        dist = 1;
      }
      const push = minDist - dist;
      const ux = dx / dist;
      const uy = dy / dist;
      const shareA = b.weight / (a.weight + b.weight); // a の人口が大きいほど a は動かない
      const shareB = 1 - shareA;
      moveMeters(a, -ux * push * shareA, -uy * push * shareA);
      moveMeters(b, ux * push * shareB, uy * push * shareB);
      moved = true;
    }
    if (!moved) break;
  }

  const result = new Map<string, PlacedPosition>();
  for (const n of nodes) {
    const orig = cities.find((c) => c.id === n.id)!;
    const { dx, dy } = deltaMeters({ lon: orig.lon!, lat: orig.lat! }, n);
    result.set(n.id, { lon: n.lon, lat: n.lat, shift: Math.hypot(dx, dy) });
  }
  return result;
}
