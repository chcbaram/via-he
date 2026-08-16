/*
 * he-graph.tsx — ADC ↔ 거리 곡선과 지금 눌린 자리
 *
 * ★ 무엇을 보여주는 그림인가.
 *
 *   가로가 실제 눌린 거리(mm), 세로가 센서가 읽는 값의 정규화 비율 u 다.
 *   u = (지금값 − 무압) / (바닥 − 무압) 이라 0 이 안 눌림, 1 이 바닥이다.
 *
 *     회색 직선   지금 펌웨어가 쓰는 환산. 두 점 사이를 곧게 잇는다
 *     강조색 곡선  자석 물리 모델이 말하는 실제
 *     파란 점     지금 눌린 키가 있는 자리
 *
 *   두 선이 벌어진 만큼이 곧 오차다. 점이 곡선 위에 있는데 직선에서 읽으면
 *   **그 가로 거리 차이만큼 틀린 값**이 나온다 — 그림에서 바로 보인다.
 *
 * ★ 왜 세로가 u 인가.
 *
 *   센서가 실제로 주는 것이 그것이기 때문이다. 거리는 우리가 계산해 내는 값이라
 *   세로에 두면 "무엇을 재서 무엇을 얻는가" 가 뒤집힌다.
 */
import React from 'react';
import styled from 'styled-components';
import {HeCurve, heCurveToMm} from 'src/utils/he-curve';

const W = 420;
const H = 240;
const PAD = {l: 34, r: 10, t: 10, b: 26};

const Box = styled.svg`
  overflow: visible;
  font-variant-numeric: tabular-nums;
`;

const Axis = styled.g`
  stroke: var(--border_color_cell);
  stroke-width: 1;
`;

const Tick = styled.text`
  fill: var(--color_label);
  font-size: 10px;
  opacity: 0.7;
`;

const Legend = styled.div`
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color_label);
  margin-top: 6px;
`;

const Swatch = styled.span<{$color: string; $dash?: boolean}>`
  display: inline-block;
  width: 18px;
  height: 0;
  border-top: ${(p) => (p.$dash ? '2px dashed' : '2px solid')} ${(p) => p.$color};
  vertical-align: middle;
  margin-right: 6px;
`;

const LIVE = '#4da3ff';

type Props = {
  curve: HeCurve | null;
  travelMm: number;
  /* 지금 눌린 비율 (0~1). null 이면 점을 안 찍는다 */
  u: number | null;
};

export const HeGraph: React.FC<Props> = ({curve, travelMm, u}) => {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const x = (mm: number) => PAD.l + (mm / travelMm) * iw;
  const y = (v: number) => PAD.t + (1 - v) * ih;

  /* 직선 — 지금 펌웨어의 환산 */
  const linear = `M ${x(0)} ${y(0)} L ${x(travelMm)} ${y(1)}`;

  /* 곡선 — 모델 */
  const curvePath = curve
    ? curve.u
        .map((uu, i) => {
          const mm = (i / (curve.u.length - 1)) * curve.travelMm;
          return `${i === 0 ? 'M' : 'L'} ${x(mm)} ${y(uu)}`;
        })
        .join(' ')
    : null;

  /* 지금 자리 — 같은 u 를 두 방식으로 읽으면 가로로 벌어진다 */
  const liveLin = u === null ? null : u * travelMm;
  const liveMod = u === null || !curve ? null : heCurveToMm(curve, u);

  const ticksX = [];
  for (let mm = 0; mm <= travelMm + 0.01; mm += 1) ticksX.push(mm);

  return (
    <div>
      <Box width={W} height={H}>
        <Axis>
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} />
          <line x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} />
          {[0.25, 0.5, 0.75, 1].map((v) => (
            <line
              key={v}
              x1={PAD.l}
              y1={y(v)}
              x2={PAD.l + iw}
              y2={y(v)}
              opacity={0.25}
            />
          ))}
        </Axis>

        {[0, 0.5, 1].map((v) => (
          <Tick key={v} x={PAD.l - 6} y={y(v) + 3} textAnchor="end">
            {v.toFixed(1)}
          </Tick>
        ))}
        {ticksX.map((mm) => (
          <Tick key={mm} x={x(mm)} y={PAD.t + ih + 14} textAnchor="middle">
            {mm}
          </Tick>
        ))}

        <path d={linear} stroke="var(--color_label)" strokeWidth={1.5}
              strokeDasharray="5 4" fill="none" opacity={0.55} />
        {curvePath && (
          <path d={curvePath} stroke="var(--color_accent)" strokeWidth={2}
                fill="none" />
        )}

        {/*
          * 지금 자리. 세로선 하나에 점 둘 — 같은 u 에서 두 방식이 말하는 거리가
          * 가로로 벌어진 것이 그대로 오차다.
          */}
        {u !== null && (
          <>
            <line x1={PAD.l} y1={y(u)} x2={PAD.l + iw} y2={y(u)}
                  stroke={LIVE} strokeWidth={1} opacity={0.4} />
            {liveLin !== null && (
              <circle cx={x(liveLin)} cy={y(u)} r={4} fill="none"
                      stroke={LIVE} strokeWidth={2} />
            )}
            {liveMod !== null && (
              <circle cx={x(liveMod)} cy={y(u)} r={4} fill={LIVE} />
            )}
          </>
        )}
      </Box>

      <Legend>
        <span><Swatch $color="var(--color_accent)" />모델(곡선)</span>
        <span><Swatch $color="var(--color_label)" $dash />지금 환산(직선)</span>
        <span><Swatch $color={LIVE} />지금 눌린 자리</span>
      </Legend>
    </div>
  );
};
