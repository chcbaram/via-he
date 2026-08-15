/*
 * he-depth.tsx — 세로 깊이 슬라이더
 *
 * 값 하나를 mm 눈금 위에서 잡고, 그 옆에 실제 키 깊이를 실시간으로 세운다.
 *
 * ★ 왜 세로인가.
 *
 *   입력지점은 "키가 얼마나 내려갔을 때"를 정하는 값이다. 키는 위에서 아래로
 *   내려가므로 눈금도 그 방향이어야 읽힌다. 가로 슬라이더는 숫자를 읽고 머릿속에서
 *   방향을 돌려야 한다.
 *
 * ★ 왜 옆에 실제 깊이를 세우나.
 *
 *   "1.00mm 가 내 손가락으로 어느 정도인가"는 숫자로 알 수 없다. 눈금을 잡아 둔 채
 *   키를 눌러 보면 바로 안다. 라이브 트래킹이 여기서 제 몫을 한다.
 */
import React, {useCallback, useRef} from 'react';
import styled from 'styled-components';

const H = 220;          /* 자 높이(px) */
const TRACK_W = 6;
const BAR_W = 14;

const Wrap = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  height: ${H + 16}px;
  padding: 8px 0;
  user-select: none;
`;

const Track = styled.div`
  position: relative;
  width: ${TRACK_W}px;
  height: ${H}px;
  border-radius: ${TRACK_W / 2}px;
  background: var(--bg_control);
  cursor: pointer;
`;

/* 잡은 지점까지 채운다 — 위에서 아래로 */
const Fill = styled.div<{$h: number}>`
  position: absolute;
  top: 0;
  width: 100%;
  height: ${(p) => p.$h}px;
  border-radius: ${TRACK_W / 2}px;
  background: var(--color_accent);
`;

const Knob = styled.div<{$y: number}>`
  position: absolute;
  left: 50%;
  top: ${(p) => p.$y}px;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: var(--color_accent);
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
`;

/* 실제 깊이 — 위에서 아래로 자란다 */
const Bar = styled.div`
  position: relative;
  width: ${BAR_W}px;
  height: ${H}px;
  border-radius: 3px;
  background: var(--bg_control);
  overflow: hidden;
`;

const BarFill = styled.div<{$h: number; $on: boolean}>`
  position: absolute;
  top: 0;
  width: 100%;
  height: ${(p) => p.$h}px;
  background: ${(p) =>
    p.$on ? 'var(--color_accent)' : 'var(--color_accent)'};
  opacity: ${(p) => (p.$on ? 1 : 0.45)};
`;

/* 잡아 둔 지점을 깊이 막대 위에도 그어 준다 — 눌러서 넘는 순간이 보인다 */
const BarMark = styled.div<{$y: number}>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${(p) => p.$y}px;
  height: 2px;
  background: var(--color_inside-accent);
  opacity: 0.9;
`;

const Ruler = styled.div`
  position: relative;
  height: ${H}px;
  width: 54px;
  font-size: 12px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
`;

const Tick = styled.div<{$y: number; $major: boolean}>`
  position: absolute;
  top: ${(p) => p.$y}px;
  left: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  transform: translateY(-50%);
  &::before {
    content: '';
    width: ${(p) => (p.$major ? 10 : 5)}px;
    height: 1px;
    background: currentColor;
  }
`;

type Props = {
  /* 0.01mm */
  value: number;
  travelUm: number;
  onChange: (um: number) => void;
  /* 라이브 깊이 (0.01mm). null 이면 막대를 비운다 */
  depthUm: number | null;
  pressed?: boolean;
};

export const DepthSlider: React.FC<Props> = ({
  value,
  travelUm,
  onChange,
  depthUm,
  pressed,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const toY = (um: number) => (Math.min(um, travelUm) / travelUm) * H;

  const pick = useCallback(
    (clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      /* 0.05mm 단위로 물린다 — 그보다 잘게 잡아도 손으로 재현이 안 된다 */
      const um = Math.round((ratio * travelUm) / 5) * 5;
      onChange(Math.max(5, um));
    },
    [onChange, travelUm],
  );

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pick(e.clientY);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons & 1) pick(e.clientY);
  };

  /* 0.5mm 마다 눈금, 1.0mm 마다 숫자 */
  const ticks: {y: number; major: boolean; label?: string}[] = [];
  for (let um = 0; um <= travelUm; um += 50) {
    const major = um % 100 === 0;
    ticks.push({
      y: toY(um),
      major,
      label: major ? (um / 100).toFixed(1) : undefined,
    });
  }

  return (
    <Wrap>
      <Track ref={ref} onPointerDown={onDown} onPointerMove={onMove}>
        <Fill $h={toY(value)} />
        <Knob $y={toY(value)} />
      </Track>

      <Bar>
        <BarFill $h={depthUm === null ? 0 : toY(depthUm)} $on={!!pressed} />
        <BarMark $y={toY(value)} />
      </Bar>

      <Ruler>
        {ticks.map((t, i) => (
          <Tick key={i} $y={t.y} $major={t.major}>
            {t.label ?? ''}
          </Tick>
        ))}
      </Ruler>
    </Wrap>
  );
};
