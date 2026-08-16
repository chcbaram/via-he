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
 *
 * ★ 왜 입력지점과 해제지점을 **한 자에** 올리나.
 *
 *   둘은 같은 축 위의 두 점이고, 사이 거리가 곧 이력(히스테리시스)이다. 따로 두면
 *   그 거리가 안 보인다 — 해제지점을 가로 슬라이더로 두었더니 "입력보다 얕아야
 *   한다"는 제약조차 화면에서 읽히지 않았다. 한 자에 올리면 두 손잡이 사이가
 *   그대로 그 거리다.
 *
 * ★ 왜 숫자를 손잡이 높이에 붙이나.
 *
 *   숫자가 자에서 떨어져 있으면 어느 손잡이의 값인지 눈으로 이어야 한다. 손잡이
 *   옆에 두면 이을 것이 없다.
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

const Knob = styled.div<{$y: number; $hollow?: boolean}>`
  position: absolute;
  left: 50%;
  top: ${(p) => p.$y}px;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  /*
   * 해제지점은 속이 빈 손잡이다.
   *
   * 같은 자에 손잡이가 둘이면 어느 것이 무엇인지 모양으로 갈라야 한다. 채운 쪽이
   * 입력(들어가는 것), 빈 쪽이 해제(나오는 것)로 읽힌다.
   */
  background: ${(p) => (p.$hollow ? 'var(--bg_menu)' : 'var(--color_accent)')};
  box-shadow: ${(p) =>
    p.$hollow ? 'inset 0 0 0 3px var(--color_accent)' : 'none'};
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

/*
 * 손잡이 높이에 붙는 숫자.
 *
 * 자 옆에 절대 위치로 띄운다. 두 값이 가까워지면 글자가 겹치므로 부르는 쪽에서
 * 밀어 준다 — 여기서는 시키는 자리에 그리기만 한다.
 */
const Readout = styled.div<{$y: number; $dim?: boolean}>`
  position: absolute;
  left: 0;
  top: ${(p) => p.$y}px;
  transform: translateY(-50%);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  opacity: ${(p) => (p.$dim ? 0.7 : 1)};
`;

const Readouts = styled.div`
  position: relative;
  height: ${H}px;
  width: 74px;
  font-size: 13px;
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
  /*
   * 값을 못 바꾸게 한다.
   *
   * 보정 화면에서는 이 자가 **설정하는 도구가 아니라 보는 도구**다. 끌 수 있으면
   * 사용자가 여기서 값을 바꾸는 줄 알고 만진다.
   */
  readOnly?: boolean;

  /*
   * 같은 자에 올리는 둘째 값 — 해제지점. 없으면 손잡이 하나짜리 자다.
   *
   * 항상 value 보다 얕아야 한다 (펌웨어도 그렇게 자른다). 여기서도 막아 둔다 —
   * 끌어서 넘길 수 있으면 넘겨 보고 나서야 안 된다는 걸 안다.
   */
  value2?: number;
  onChange2?: (um: number) => void;

  /* 숫자를 자 옆에 붙일지. 끄면 부르는 쪽이 알아서 찍는다 */
  showValues?: boolean;
};

export const DepthSlider: React.FC<Props> = ({
  value,
  travelUm,
  onChange,
  depthUm,
  pressed,
  readOnly,
  value2,
  onChange2,
  showValues,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const toY = (um: number) => (Math.min(um, travelUm) / travelUm) * H;

  const dual = value2 !== undefined && onChange2 !== undefined;

  /*
   * 끄는 동안 손잡이를 바꾸지 않는다.
   *
   * 매번 가까운 쪽을 고르면, 두 손잡이가 붙어 있을 때 끌다가 다른 쪽으로 넘어간다.
   * 누른 순간 정한 쪽을 뗄 때까지 끈다.
   */
  const grabbed = useRef<'a' | 'b'>('a');

  const pick = useCallback(
    (clientY: number, which: 'a' | 'b') => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      /* 0.05mm 단위로 물린다 — 그보다 잘게 잡아도 손으로 재현이 안 된다 */
      let um = Math.round((ratio * travelUm) / 5) * 5;
      um = Math.max(5, um);

      if (!dual) {
        onChange(um);
        return;
      }
      /* 해제는 입력보다 얕아야 한다 — 넘기지 못하게 여기서 잡는다 */
      if (which === 'a') onChange(Math.max(um, (value2 as number) + 5));
      else onChange2!(Math.min(um, value - 5));
    },
    [onChange, onChange2, travelUm, dual, value, value2],
  );

  const nearest = (clientY: number): 'a' | 'b' => {
    const el = ref.current;
    if (!el || !dual) return 'a';
    const r = el.getBoundingClientRect();
    const y = clientY - r.top;
    return Math.abs(y - toY(value)) <= Math.abs(y - toY(value2 as number))
      ? 'a'
      : 'b';
  };

  const onDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    grabbed.current = nearest(e.clientY);
    pick(e.clientY, grabbed.current);
  };
  const onMove = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (e.buttons & 1) pick(e.clientY, grabbed.current);
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

  /*
   * 두 숫자가 겹치지 않게 밀어 둔다.
   *
   * 손잡이가 0.2mm 차이로 붙으면 글자 두 줄이 포개진다. 최소 간격만큼 벌리되
   * **위아래 순서는 지킨다** — 해제가 위, 입력이 아래다. 순서가 뒤집히면 어느
   * 것이 무엇인지 다시 헷갈린다.
   */
  const readoutY = (() => {
    const a = toY(value);
    if (!dual) return {a, b: 0};
    const b = toY(value2 as number);
    const gap = 18;
    if (a - b >= gap) return {a, b};
    const mid = (a + b) / 2;
    return {
      a: Math.min(H, mid + gap / 2),
      b: Math.max(0, mid - gap / 2),
    };
  })();

  return (
    <Wrap>
      <Track
        ref={ref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        style={readOnly ? {cursor: 'default', opacity: 0.35} : undefined}
      >
        <Fill $h={toY(value)} />
        {!readOnly && dual && <Knob $y={toY(value2 as number)} $hollow />}
        {!readOnly && <Knob $y={toY(value)} />}
      </Track>

      <Bar>
        <BarFill $h={depthUm === null ? 0 : toY(depthUm)} $on={!!pressed} />
        {dual && <BarMark $y={toY(value2 as number)} />}
        <BarMark $y={toY(value)} />
      </Bar>

      <Ruler>
        {ticks.map((t, i) => (
          <Tick key={i} $y={t.y} $major={t.major}>
            {t.label ?? ''}
          </Tick>
        ))}
      </Ruler>

      {showValues && (
        <Readouts>
          {dual && (
            <Readout $y={readoutY.b} $dim>
              {(value2! / 100).toFixed(2)} mm
            </Readout>
          )}
          <Readout $y={readoutY.a}>{(value / 100).toFixed(2)} mm</Readout>
        </Readouts>
      )}
    </Wrap>
  );
};
