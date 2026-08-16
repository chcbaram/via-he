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

/*
 * 실시간 값의 색 — 키캡의 눌림 테두리·아래 숫자와 같아야 한다.
 * (two-string/unit-key/keycap.tsx 의 PRESSED_COLOR)
 */
const LIVE_COLOR = '#4da3ff';

/* 잡음 위에서 자른다 — 안 누른 키도 깊이가 딱 0 이 아니다 (0.01mm 단위) */
const LIVE_MIN = 10;

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
  right: 0;
  top: ${(p) => p.$y}px;
  transform: translateY(-50%);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  opacity: ${(p) => (p.$dim ? 0.7 : 1)};
`;

/*
 * 설정값 칸 — **자 왼쪽**에 둔다.
 *
 * 오른쪽에 두었더니 자와 값 사이에 눈금이 끼어 있어, 손잡이를 끌면서 숫자를 보려면
 * 눈금을 건너뛰어야 했다. 왼쪽에 붙이고 오른끝을 맞추면 손잡이 바로 옆이 숫자다.
 *
 * 오른쪽은 실시간 값이 쓴다 — 자를 사이에 두고 왼쪽이 정해 둔 값, 오른쪽이 지금
 * 값으로 갈린다.
 */
const Readouts = styled.div`
  position: relative;
  height: ${H}px;
  width: 74px;
  font-size: 13px;
  text-align: right;
`;

/*
 * 실시간 깊이 값 — 막대가 닿은 높이에 붙는다.
 *
 * ★ 설정값과 **다른 칸**에 둔다.
 *
 *   같은 칸에 넣으면 값이 지나갈 때마다 설정값 글자와 포개진다. 색이 달라도 겹친
 *   글자는 둘 다 못 읽는다. 칸을 나누면 서로 지나가도 각자 읽힌다.
 */
const LiveReadouts = styled(Readouts)`
  width: 62px;
  color: ${LIVE_COLOR};
  text-align: left;
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
  /* 잡을 수 있는 최대 — 그 키의 전 행정 */
  travelUm: number;
  /*
   * 눈금이 덮는 범위. 없으면 travelUm 과 같다.
   *
   * ★ 눈금과 잡히는 범위는 다르다.
   *
   *   눈금은 3.4 처럼 끝나면 읽기 나쁘다 — 4.0 까지 그어 두면 눈금이 온전한
   *   숫자로 끝난다. 그리고 키는 공칭 행정보다 깊이 들어갈 수 있어서, 눈금을
   *   행정에 맞추면 그 사실이 꼭대기에 붙어 안 보인다.
   *
   *   그렇다고 손잡이를 거기까지 열면 안 된다. 펌웨어가 설정값을 전 행정으로
   *   잘라내므로(keysClampUm), 4.0 으로 잡아도 조용히 3.4 가 된다 — 화면과 장치가
   *   갈라진다.
   */
  scaleUm?: number;
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
   * 잡을 대상이 아예 없다 — 고른 키가 하나도 없을 때.
   *
   * ★ readOnly 로는 모자란다.
   *
   *   readOnly 는 손잡이만 숨긴다. 값 숫자와 채움과 막대의 표시는 그대로 남아서,
   *   대상이 없는데 "1.00 mm" 라는 **거짓 숫자**가 뜬다. 옆 줄의 다른 값들은 이미
   *   `—` 로 비어 있는데 이 자만 값이 있는 척한다.
   *
   *   대상이 없으면 손잡이·숫자·채움이 **함께** 사라져야 한다. 눈금과 라이브 막대는
   *   남긴다 — 그건 설정하는 것이 아니라 보는 것이다.
   */
  blank?: boolean;

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
  scaleUm,
  onChange,
  depthUm,
  pressed,
  readOnly,
  blank,
  value2,
  onChange2,
  showValues,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const full = scaleUm ?? travelUm;
  const toY = (um: number) => (Math.min(um, full) / full) * H;

  const dual = value2 !== undefined && onChange2 !== undefined;

  /* 대상이 없으면 끌 수도 없다 — 둘을 따로 두면 반드시 한쪽만 고친다 */
  const frozen = readOnly || blank;

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
      let um = Math.round((ratio * full) / 5) * 5;
      /* 눈금은 더 넓어도 잡히는 것은 전 행정까지다 */
      um = Math.max(5, Math.min(um, travelUm));

      if (!dual) {
        onChange(um);
        return;
      }
      /* 해제는 입력보다 얕아야 한다 — 넘기지 못하게 여기서 잡는다 */
      if (which === 'a') onChange(Math.max(um, (value2 as number) + 5));
      else onChange2!(Math.min(um, value - 5));
    },
    [onChange, onChange2, travelUm, full, dual, value, value2],
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
    if (frozen) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    grabbed.current = nearest(e.clientY);
    pick(e.clientY, grabbed.current);
  };
  const onMove = (e: React.PointerEvent) => {
    if (frozen) return;
    if (e.buttons & 1) pick(e.clientY, grabbed.current);
  };

  /* 0.5mm 마다 눈금, 1.0mm 마다 숫자 */
  const ticks: {y: number; major: boolean; label?: string}[] = [];
  for (let um = 0; um <= full; um += 50) {
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
      {showValues && (
        <Readouts>
          {!blank && dual && (
            <Readout $y={readoutY.b} $dim>
              {(value2! / 100).toFixed(2)} mm
            </Readout>
          )}
          {!blank && (
            <Readout $y={readoutY.a}>{(value / 100).toFixed(2)} mm</Readout>
          )}
        </Readouts>
      )}
      <Track
        ref={ref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        style={frozen ? {cursor: 'default', opacity: 0.35} : undefined}
      >
        {!blank && <Fill $h={toY(value)} />}
        {!frozen && dual && <Knob $y={toY(value2 as number)} $hollow />}
        {!frozen && <Knob $y={toY(value)} />}
      </Track>

      <Bar>
        <BarFill $h={depthUm === null ? 0 : toY(depthUm)} $on={!!pressed} />
        {!blank && dual && <BarMark $y={toY(value2 as number)} />}
        {!blank && <BarMark $y={toY(value)} />}
      </Bar>

      <Ruler>
        {ticks.map((t, i) => (
          <Tick key={i} $y={t.y} $major={t.major}>
            {t.label ?? ''}
          </Tick>
        ))}
      </Ruler>

      {/*
        * ★ 칸은 늘 자리를 잡아 둔다.
        *
        *   값이 있을 때만 칸을 만들면, 키를 누를 때마다 옆의 설정값들이 가로로
        *   밀린다. 읽으려는 숫자가 움직이는 것만큼 거슬리는 것이 없다.
        */}
      {showValues && (
        <LiveReadouts>
          {depthUm !== null && depthUm >= LIVE_MIN && (
            <Readout $y={toY(depthUm)}>
              {((Math.round(depthUm / 5) * 5) / 100).toFixed(2)} mm
            </Readout>
          )}
        </LiveReadouts>
      )}

    </Wrap>
  );
};
