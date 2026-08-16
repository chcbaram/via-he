/*
 * he-curve.ts — 자석 물리 모델로 ADC↔거리 곡선을 만든다
 *
 * ★ 왜 실측이 아니라 계산인가.
 *
 *   홀 출력은 거리에 대해 직선이 아니다. 지금 펌웨어는 두 점(무압·바닥) 사이를
 *   직선으로 읽는데, 그러면 가운데가 최대 0.94mm 어긋난다 — 하필 그 가운데가
 *   액추에이션 구간이다.
 *
 *   그런데 곡선을 재려고 63키를 심 끼워 누를 필요가 없다. 축방향으로 자화된 원통
 *   자석의 축상 자기장은 식이 알려져 있고, 제조사가 주는 두 점(초기·바닥 자속)으로
 *   미지수 두 개를 풀면 곡선이 결정된다.
 *
 * ★ 정규화하면 개체차가 사라진다.
 *
 *   u = (adc − rest) / (bottom − rest) 에서 곡선 **모양**은 자석 세기와 센서
 *   오프셋에 무관하다 — 아핀 변환이 분자·분모에서 소거되기 때문이다. 그래서
 *   종류당 곡선 하나면 되고, 키별로는 두 점만 있으면 된다 (이미 갖고 있다).
 *
 * 근거와 도출: firmware/wish60-he/docs/ref/he-magnet-model.md
 */

/* 원통 자석 축상 자기장의 모양 인자. B(z) = (Br/2) * f(z) */
const shape = (z: number, R: number, L: number) =>
  (z + L) / Math.hypot(z + L, R) - z / Math.hypot(z, R);

/*
 * 자석 형상.
 *
 * ★ 값을 정확히 몰라도 된다.
 *
 *   양 끝점을 고정하고 나면 곡선 모양은 형상 가정에 거의 무관하다 (문서 4절:
 *   Ø4x2.0 과 Ø4x2.5 의 중간 구간 차이가 0.1%, 거리로 2um). 물리 형태가 이미
 *   모양을 결정해 버리기 때문이다.
 */
const MAG_R = 2.0;
const MAG_L = 2.0;

/*
 * 두 점 스펙에서 유효 갭 z0 을 푼다.
 *
 * 비를 취하면 Br 이 소거되고 z0 에 대한 1차원 근찾기가 된다. brentq 대신 이분법을
 * 쓴다 — 단조라서 충분하고, 의존성을 안 늘리는 편이 낫다.
 *
 * ★ z0 하나만 맞추면 안 된다. 미지수가 둘(z0, Br)인데 하나만 풀면 나머지 한 점이
 *   30% 넘게 어긋난다. 비로 풀면 둘을 동시에 만족한다.
 */
function solveGap(ratio: number, travelMm: number): number | null {
  const err = (z0: number) =>
    shape(z0, MAG_R, MAG_L) / shape(z0 + travelMm, MAG_R, MAG_L) - ratio;

  let lo = 0.05;
  let hi = 20;
  if (err(lo) * err(hi) > 0) return null;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (err(lo) * err(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export type HeCurve = {
  /* 거리(mm) 를 균일 분할한 지점마다의 정규화 눌림 비율 u (0~1) */
  u: number[];
  travelMm: number;
  /* 직선으로 읽을 때 생기는 최대 거리 오차 (mm) */
  maxErrMm: number;
};

/*
 * 곡선을 만든다. 못 만들면 null (스펙이 물리적으로 말이 안 되는 경우).
 *
 * ★ 거리를 균일 분할한다.
 *
 *   u 를 균일 분할하면 곡선이 가파른 구간에서 해상도가 무너진다 — 첫 칸이 거리로
 *   0.6mm 를 덮어 버린다. 거리를 균일하게 잡고 u 를 저장해야 전 구간 해상도가 같다.
 */
export function heMakeCurve(
  initialGs: number,
  bottomGs: number,
  travelMm: number,
  n = 33,
): HeCurve | null {
  if (!(initialGs > 0) || !(bottomGs > initialGs) || !(travelMm > 0)) return null;

  const z0 = solveGap(bottomGs / initialGs, travelMm);
  if (z0 === null) return null;

  const bBottom = shape(z0, MAG_R, MAG_L);
  const bRest = shape(z0 + travelMm, MAG_R, MAG_L);
  const span = bBottom - bRest;
  if (!(span > 0)) return null;

  const u: number[] = [];
  let maxErrMm = 0;

  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * travelMm;
    /* 눌린 깊이 d 에서의 갭은 z0 + (T - d) */
    const b = shape(z0 + travelMm - d, MAG_R, MAG_L);
    const uu = (b - bRest) / span;
    u.push(uu);

    /* 같은 u 를 직선으로 읽으면 몇 mm 로 보이나 */
    maxErrMm = Math.max(maxErrMm, Math.abs(uu * travelMm - d));
  }
  return {u, travelMm, maxErrMm};
}

/*
 * 정규화 값 u 를 실제 거리(mm)로 되돌린다 — 곡선을 거꾸로 읽는 일이다.
 *
 * 펌웨어가 앞으로 할 일이 바로 이것이고(이진 탐색 + 선형 보간), 화면은 지금 그것을
 * 미리 보여준다. 두 값을 나란히 두면 지금 얼마나 어긋나 있는지가 눈에 들어온다.
 */
export function heCurveToMm(c: HeCurve, u: number): number {
  const n = c.u.length;
  const step = c.travelMm / (n - 1);

  if (u <= 0) return 0;
  if (u >= 1) return c.travelMm;

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c.u[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = c.u[hi] - c.u[lo];
  const frac = span > 0 ? (u - c.u[lo]) / span : 0;
  return (lo + frac) * step;
}
