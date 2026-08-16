import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {shallowEqual} from 'react-redux';
import {TestKeyState} from 'src/types/types';
import {
  BADGE_COLOR,
  getDarkenedColor,
  getLiveColor,
  LIVE_COLOR_ON_DARK,
} from 'src/utils/color-math';
import {CSSVarObject} from 'src/utils/keyboard-rendering';
import styled from 'styled-components';
import {Keycap2DTooltip} from '../../inputs/tooltip';
import {ComboKeycap} from './combo-keycap';
import {EncoderKey} from './encoder';
import {
  CanvasContainer,
  KeycapContainer,
  TestOverlay,
  TooltipContainer,
} from './keycap-base';
import {
  KeycapState,
  TwoStringKeycapProps,
  DisplayMode,
} from 'src/types/keyboard-rendering';

/*
 * 눌림 테두리 색.
 *
 * 키캡 색·강조색과 겹치지 않는 것으로 박는다. 테두리는 키캡 **바깥**에 그려져 늘
 * 어두운 바탕 위에 얹히므로 하나로 족하다 — 키캡 위에 얹히는 글자만 색을 고른다
 * (getLiveColor).
 */
const PRESSED_COLOR = LIVE_COLOR_ON_DARK;

/*
 * 키캡 아래 실시간 값.
 *
 * ★ 캔버스가 아니라 요소다.
 *
 *   2D 의 캔버스는 키캡 **윗면**만 덮는다. 치마(윗면 바깥 테두리) 자리는 캔버스가
 *   닿지 않으므로 거기 글자를 그리려면 요소로 얹어야 한다.
 *
 * ★ 색은 눌림 테두리와 같다.
 *
 *   둘 다 "지금 이 순간" 을 말하는 표시다. 설정값(윗면의 숫자)과 색으로 갈라 두면
 *   무엇이 고정값이고 무엇이 흐르는 값인지 한눈에 나뉜다.
 */
const Foot = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 1px;
  z-index: 1;
  text-align: center;
  font-size: 9px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
`;

/*
 * 우측 위 구석의 상태 표시 — 값이 아니라 켜졌나 꺼졌나다.
 *
 * ★ 자리 — 각인은 좌측·중앙, 실시간 값은 하단 중앙, 막대는 아래를 쓴다. 우측 위는
 *   모든 화면에서 비어 있는 유일한 구석이고, 눈이 마지막에 닿는 자리라 각인과
 *   싸우지 않는다.
 *
 * ★ 글자가 아니라 점 — 이 자리는 6~8px 라 그 크기의 글자는 뭉개지고 무엇보다 또
 *   하나의 각인처럼 읽힌다. 63개를 훑어 "어디에 켜져 있나" 를 잡는 일이라 색과
 *   모양이 맞다. 눈은 그것을 한 번에 묶어 보고 글자는 하나씩 읽는다.
 *
 * ★ 색 — 강조색이다. 빨강은 거의 모든 UI 에서 오류·경고라 정상 설정을 문제처럼
 *   읽게 만들고, 어두운 키캡 위에서 대비도 가장 나쁘며, 적록 색각이상이 남성의 8%다.
 *   파랑도 안 된다 — 눌림 테두리와 그래프의 "지금" 이 이미 파랑이라 뜻이 겹친다.
 *
 * ★ 어두운 선을 한 겹 두른다.
 *
 *   고른 키는 키캡이 크림색(강조색)으로 바뀌는데 거기서 호박색이 묻어 안 보였다.
 *   키캡 색은 화면 상태를 따라 바뀌므로 **배지 색 하나로는 어느 바탕에서도 보이게
 *   할 수 없다.** 바깥에 어두운 선을 두르면 밝은 바탕이든 어두운 바탕이든 윤곽이
 *   산다 — 눌림 테두리를 키캡 색과 무관한 색으로 박은 것과 같은 생각이다.
 *
 * ★ 한 단계 더 나누는 것은 **길이로** 한다.
 *
 *   채움과 테두리로 갈라 봤다. 6px 에서는 테두리 원의 가운데 구멍이 2px 라 채운
 *   원과 구분이 안 갔고, 9px 로 키우니 이번엔 키캡에서 너무 컸다.
 *
 *   그래서 옆으로 늘린다. 점 하나는 원, 연속은 그 둘을 이은 **알약 모양**이다.
 *   높이가 같고 길이만 다르므로 크기를 안 건드리고도 갈리고, 떨어진 점 둘보다
 *   덩어리 하나가 훑는 중에 더 잘 잡힌다 — 눈은 이어진 것을 먼저 묶는다.
 *
 * ★ 자리는 키캡 몸통이 아니라 **얼굴** 기준이다.
 *
 *   이 요소는 키캡 몸통 안에 얹히는데, 눈에 보이는 네모는 그보다 안쪽의 얼굴이다
 *   (위 2px, 오른쪽 6px 만큼 들어가 있다). 몸통 기준으로 같은 값을 주면 위아래는
 *   맞는데 오른쪽만 얼굴 밖으로 나간다 — 실제로 그렇게 보였다.
 *
 *   얼굴 여백을 더해서 잡는다. 숫자를 손으로 적지 않고 CSSVarObject 에서 가져오므로
 *   키캡 모양이 바뀌어도 따라간다.
 */
const BADGE_INSET = 3;
const BADGE_DOT = 6;
const BADGE_STEP = 8; /* 점 하나가 늘어날 때마다 붙는 길이 */

const Badge = styled.div<{$n: number}>`
  position: absolute;
  top: ${CSSVarObject.faceYPadding[0] + BADGE_INSET}px;
  right: ${CSSVarObject.faceXPadding[1] + BADGE_INSET}px;
  z-index: 1;
  height: ${BADGE_DOT}px;
  width: ${(p) => BADGE_DOT + (p.$n - 1) * BADGE_STEP}px;
  border-radius: 999px;
  pointer-events: none;
  background: ${BADGE_COLOR};
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
`;

const getMacroData = ({
  macroExpression,
  label,
}: {
  macroExpression?: string;
  label: string;
}) =>
  label && label.length > 15
    ? label
    : macroExpression && macroExpression.length
    ? macroExpression
    : null;

const paintDebugLines = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d');
  if (context == null) {
    return;
  }
  context.strokeStyle = 'magenta';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(canvas.width, 0);
  context.lineTo(canvas.width, canvas.height);
  context.lineTo(0, canvas.height);
  context.lineTo(0, 0);
  context.stroke();
};

const paintKeycapLabel = (
  canvas: HTMLCanvasElement,
  legendColor: string,
  label: any,
) => {
  const context = canvas.getContext('2d');
  if (context == null) {
    return;
  }
  const dpi = devicePixelRatio;
  const [canvasWidth, canvasHeight] = [canvas.width, canvas.height];
  canvas.width = canvasWidth * dpi;
  canvas.height = canvasHeight * dpi;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  context.scale(dpi, dpi);
  const fontFamily =
    'Fira Sans, Pretendard Variable, Arial Rounded MT, Arial Rounded MT Bold, Arial';
  // Margins from face edge to where text is drawn
  const topLabelMargin = {x: 4, y: 4};
  const bottomLabelMargin = {x: 4, y: 4};
  const centerLabelMargin = {x: 3, y: 0};
  const singleLabelMargin = {x: 4, y: 4};

  // Define a clipping path for the top face, so text is not drawn on the side.
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(canvas.width, 0);
  context.lineTo(canvas.width, canvas.height);
  context.lineTo(0, canvas.height);
  context.lineTo(0, 0);
  context.clip();

  context.fillStyle = legendColor;
  let overflowed = false;
  if (label === undefined) {
  } else if (label.topLabel && label.bottomLabel && label.compact) {
    /*
     * ★ 값이 붙으면 두 줄 각인을 한 줄로 접는다.
     *
     *   두 줄 각인은 키캡 위아래를 다 쓴다. 값이 우하단에 들어가면 아래 줄과
     *   나란히 붙어 "1 2530" 처럼 한 덩어리로 읽혔다.
     *
     *   남기는 것은 **아래 줄**이다. 그게 그 키의 이름이다 (1, `, ,). 위 줄은
     *   시프트했을 때의 글자라 지금 화면에서 알 필요가 없다.
     */
    let fontSize = 18;
    let fontHeight = 0.75 * fontSize;
    context.font = `bold ${fontSize}px ${fontFamily}`;
    context.fillText(
      label.bottomLabel,
      singleLabelMargin.x,
      singleLabelMargin.y + fontHeight,
    );
  } else if (label.topLabel && label.bottomLabel) {
    let fontSize = 16;
    let fontHeight = 0.75 * fontSize;
    let topLabelOffset = label.offset[0] * fontHeight;
    let bottomLabelOffset = label.offset[1] * fontHeight;
    context.font = `bold ${fontSize}px ${fontFamily}`;
    context.fillText(
      label.topLabel,
      topLabelMargin.x,
      topLabelMargin.y + topLabelOffset + fontHeight,
    );
    context.fillText(
      label.bottomLabel,
      bottomLabelMargin.x,
      canvasHeight - bottomLabelMargin.y - bottomLabelOffset,
    );
  } else if (label.centerLabel) {
    /* 값이 붙는 키캡은 각인을 줄인다 — 아래를 값에 내준다 */
    let fontSize = (label.compact ? 11 : 13) * label.size;
    let fontHeight = 0.75 * fontSize;
    let faceMidLeftY = canvasHeight / 2;
    context.font = `bold ${fontSize}px ${fontFamily}`;
    /*
     * 값을 얹을 때는 각인을 위로 올린다.
     *
     * 여러 낱말짜리 각인(Backspace, Enter)은 세로 가운데에 놓이는데, 그 자리는
     * 우하단 값과 겹친다. 참고 보드도 값을 넣는 화면에서는 각인을 위로 붙인다 —
     * 아래를 값 자리로 비우는 것이다.
     */
    context.fillText(
      label.label,
      centerLabelMargin.x,
      label.compact
        ? topLabelMargin.y + fontHeight
        : faceMidLeftY + 0.5 * fontHeight,
    );
    // return if label would have overflowed so that we know to show tooltip
    overflowed =
      context.measureText(label.centerLabel).width >
      canvasWidth - centerLabelMargin.x;
  } else if (typeof label.label === 'string') {
    let fontSize = label.compact ? 18 : 22;
    let fontHeight = 0.75 * fontSize;
    context.font = `bold ${fontSize}px ${fontFamily}`;
    context.fillText(
      label.label,
      singleLabelMargin.x,
      singleLabelMargin.y + fontHeight,
    );
  }

  /*
   * 각인 아래 **오른쪽**에 값 한 줄.
   *
   * ★ 각인을 덮지 않는다.
   *
   *   처음에는 각인 자리를 값으로 갈아 끼웠는데, 그러면 어느 키인지 알 수 없어져
   *   보정 화면에서 "다음에 누를 키" 를 못 찾는다. 각인은 좌상단, 값은 우하단으로
   *   대각선으로 갈라 놓으면 1u 키캡에서도 둘이 안 부딪힌다. 참고 보드도 같은
   *   배치다.
   *
   * ★ 색은 legendColor 를 그대로 쓴다.
   *
   *   고른 키는 키캡이 강조색으로 바뀌고 각인이 어두워진다. 값에 색을 따로 박으면
   *   그 키에서 값이 배경에 묻는다. 각인과 같은 색을 쓰면 반전이 저절로 따라온다.
   */
  if (label && label.subLabel) {
    /*
     * ★ 값이 둘이면 줄을 나눠 쌓는다.
     *
     *   한 줄에 "1.00/0.50" 으로 붙이면 1u 키캡 폭에 맞추느라 글자가 읽을 수 없게
     *   작아진다. 가로는 더 못 늘리지만 세로는 남는다. 아래에서 위로 쌓으므로
     *   **마지막 줄이 맨 아래**다 — 부르는 쪽이 입력, 해제 순으로 주면 화면의 자와
     *   같은 순서로 놓인다.
     */
    const lines = String(label.subLabel).split('\n');
    const fontSize = 11;
    const lineH = fontSize + 1;

    context.font = `${fontSize}px ${fontFamily}`;
    context.textAlign = 'right';
    context.globalAlpha = 0.8;

    /* 막대가 있으면 그 위로 올린다 */
    const bottom = canvasHeight - (label.bar ? 8 : 4);
    lines.forEach((ln, i) => {
      context.fillText(
        ln,
        canvasWidth - 4,
        bottom - (lines.length - 1 - i) * lineH,
      );
    });

    context.globalAlpha = 1;
    context.textAlign = 'start';
  }

  /*
   * 맨 아래 깊이 막대.
   *
   * ★ 글자가 아니라 막대여야 한다.
   *
   *   누르는 동안 얼마나 들어갔는지는 숫자로 읽을 겨를이 없다. 길이는 곁눈으로도
   *   들어온다. 설정한 입력지점(글자)과 지금 깊이(막대)를 한 키캡에 같이 두면
   *   "이 키는 여기서 들어간다" 가 눈으로 맞춰진다.
   *
   *   깔개를 먼저 깔아 0 일 때도 자리가 보이게 한다 — 안 그러면 눌러야만 막대가
   *   나타나서 어디를 봐야 할지 모른다.
   */
  /*
   * 들어간 만큼만 그린다. 깔개는 깔지 않는다.
   *
   * ★ 안 눌린 키에 자국을 남기지 않는다.
   *
   *   빈 깔개를 깔아 두면 63개 키캡에 회색 줄이 늘 그어져 있어, 정작 움직이는
   *   막대가 그 줄들에 묻힌다. 아무것도 없다가 눌러야 생기는 편이 눈에 띈다.
   */
  if (label && label.bar) {
    const h = 3;
    context.globalAlpha = 0.9;
    context.fillRect(3, canvasHeight - h - 1, (canvasWidth - 6) * Math.min(1, label.bar), h);
    context.globalAlpha = 1;
  }

  return overflowed;
};

const paintKeycap = (
  canvas: HTMLCanvasElement,
  textureWidth: number,
  textureHeight: number,
  legendColor: string,
  label: any,
) => {
  const [canvasWidth, canvasHeight] = [
    CSSVarObject.keyWidth,
    CSSVarObject.keyHeight,
  ];
  canvas.width =
    canvasWidth * textureWidth -
    CSSVarObject.faceXPadding.reduce((x, y) => x + y, 0);
  canvas.height =
    canvasHeight * textureHeight -
    CSSVarObject.faceYPadding.reduce((x, y) => x + y, 0);

  const context = canvas.getContext('2d');
  if (context == null) {
    return;
  }

  // Fill the canvas with the keycap background color
  //context.fillStyle = bgColor;
  //context.fillRect(0, 0, canvas.width, canvas.height);

  // Leaving this here for future maintenance.
  // This draws lines around the keycap edge and the top face edge,
  // *or* a clipped area within it when keycaps are large, vertical or odd shapes.
  const debug = false;
  if (debug) {
    paintDebugLines(canvas);
  }

  return paintKeycapLabel(canvas, legendColor, label);
};

export const Keycap: React.FC<TwoStringKeycapProps> = React.memo((props) => {
  const {
    label,
    scale,
    color,
    selected,
    disabled,
    mode,
    rotation,
    keyState,
    shouldRotate,
    textureWidth,
    textureHeight,
    skipFontCheck,
    idx,
  } = props;
  const macroData = label && getMacroData(label);
  const [overflowsTexture, setOverflowsTexture] = useState(false);
  // Hold state for hovered and clicked events
  const [hovered, hover] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = React.useCallback(() => {
    if (
      canvasRef.current &&
      color &&
      label &&
      (document.fonts.check('bold 16px "Fira Sans"', label.label) ||
        skipFontCheck)
    ) {
      // Only render label if it is available
      const doesOverflow = paintKeycap(
        canvasRef.current,
        textureWidth,
        textureHeight,
        color.t,
        label,
      );
      setOverflowsTexture(!!doesOverflow);
    }
  }, [
    canvasRef.current,
    textureWidth,
    label && label.key,
    scale[0],
    scale[1],
    color && color.t,
    color && color.c,
    shouldRotate,
  ]);
  useEffect(redraw, [
    label && label.key,
    skipFontCheck,
    color && color.c,
    color && color.t,
  ]);

  const redrawRef = React.useRef(redraw);
  redrawRef.current = redraw;
  useEffect(() => {
    const handler = () => redrawRef.current();
    document.fonts.addEventListener('loadingdone', handler);
    return () => {
      document.fonts.removeEventListener('loadingdone', handler);
    };
  }, []);

  // Set Z to half the total height so that keycaps are at the same level since the center
  // is in the middle and each row has a different height
  const [zDown, zUp] = [-8, 0];
  const pressedState =
    DisplayMode.Test === mode
      ? TestKeyState.KeyDown === keyState
        ? KeycapState.Pressed
        : KeycapState.Unpressed
      : hovered || selected
      ? KeycapState.Pressed
      : KeycapState.Unpressed;
  const [keycapZ] =
    pressedState === KeycapState.Pressed
      ? [zDown, rotation[2]]
      : [zUp, rotation[2] + Math.PI * Number(shouldRotate)];
  const wasPressed = keyState === TestKeyState.KeyUp;
  const keycapColor =
    DisplayMode.Test === mode
      ? pressedState === KeycapState.Unpressed
        ? wasPressed
          ? 'mediumvioletred'
          : 'lightgrey'
        : 'mediumvioletred'
      : pressedState === KeycapState.Unpressed
      ? 'lightgrey'
      : 'lightgrey';
  const keycapOpacity =
    pressedState === KeycapState.Unpressed ? (wasPressed ? 0.4 : 0) : 0.6;

  const [onClick, onPointerOver, onPointerOut, onPointerDown] = useMemo(() => {
    const noop = () => {};
    return disabled
      ? [noop, noop, noop, noop]
      : props.mode === DisplayMode.ConfigureColors
      ? [
          noop,
          (evt: React.MouseEvent) => {
            if (props.onPointerOver) {
              props.onPointerOver(evt, idx);
            }
          },
          noop,
          (evt: React.MouseEvent) => {
            if (props.onPointerDown) {
              props.onPointerDown(evt, idx);
            }
          },
        ]
      : [
          (evt: React.MouseEvent) => props.onClick(evt, idx),
          (evt: React.MouseEvent) => {
            if (props.onPointerOver) {
              props.onPointerOver(evt, idx);
            }
            hover(true);
          },
          () => hover(false),
          (evt: React.MouseEvent) => {
            if (props.onPointerDown) {
              props.onPointerDown(evt, idx);
            }
          },
        ];
  }, [
    disabled,
    props.onClick,
    props.onPointerDown,
    props.onPointerOver,
    hover,
    idx,
    mode,
  ]);
  return shouldRotate ? (
    <EncoderKey
      onClick={onClick}
      size={textureWidth * CSSVarObject.keyWidth}
      style={{
        transform: `translate(${
          props.position[0] -
          (CSSVarObject.keyWidth * textureWidth - CSSVarObject.keyWidth) / 2
        }px,${
          (textureWidth * (CSSVarObject.keyHeight - CSSVarObject.keyWidth)) /
            2 +
          props.position[1] -
          (CSSVarObject.keyHeight * textureHeight - CSSVarObject.keyHeight) / 2
        }px) rotate(${-props.rotation[2]}rad)`,
        borderRadius: 3,
        color: props.color.c,
      }}
    />
  ) : props.clipPath ? (
    <ComboKeycap
      {...props}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      keycapZ={keycapZ}
      keycapOpacity={keycapOpacity}
      keycapColor={keycapColor}
      canvasRef={canvasRef}
      macroData={macroData}
      overflowsTexture={overflowsTexture}
      style={{
        transform: `translate(${
          CSSVarObject.keyWidth / 2 +
          props.position[0] -
          (CSSVarObject.keyXPos * textureWidth - CSSVarObject.keyXSpacing) / 2
        }px,${
          CSSVarObject.keyHeight / 2 +
          props.position[1] -
          (CSSVarObject.keyYPos * textureHeight - CSSVarObject.keyYSpacing) / 2
        }px) rotate(${-props.rotation[2]}rad)`,
        width: textureWidth * CSSVarObject.keyXPos - CSSVarObject.keyXSpacing,
        height: textureHeight * CSSVarObject.keyYPos - CSSVarObject.keyYSpacing,
      }}
    />
  ) : (
    <>
      <KeycapContainer
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        style={{
          transform: `translate(${
            CSSVarObject.keyWidth / 2 +
            props.position[0] -
            (CSSVarObject.keyXPos * textureWidth - CSSVarObject.keyXSpacing) / 2
          }px,${
            CSSVarObject.keyHeight / 2 +
            props.position[1] -
            (CSSVarObject.keyYPos * textureHeight - CSSVarObject.keyYSpacing) /
              2
          }px) rotate(${-props.rotation[2]}rad)`,
          width: textureWidth * CSSVarObject.keyXPos - CSSVarObject.keyXSpacing,
          height:
            textureHeight * CSSVarObject.keyYPos - CSSVarObject.keyYSpacing,
          cursor: !disabled ? 'pointer' : 'initial',
        }}
      >
        <GlowContainer
          $selected={selected}
          style={{
            animation: disabled
              ? 'initial' // This prevents the hover animation from firing when the keycap can't be interacted with
              : selected
              ? '.75s infinite alternate select-glow'
              : '',
            background: getDarkenedColor(props.color.c, 0.8),
            transform: `perspective(100px) translateZ(${keycapZ}px)`,
            borderRadius: 3,
            /*
             * 입력으로 잡힌 키에 **바깥** 테두리.
             *
             * ★ 막대만으로는 모른다.
             *
             *   막대는 얼마나 들어갔는지를 보여줄 뿐, 설정한 입력지점을 넘었는지는
             *   길이를 눈으로 재야 안다. 이 화면에서 정하는 것이 바로 그 지점이라
             *   **넘는 순간**이 따로 보여야 값을 옮겨 볼 근거가 생긴다.
             *
             * ★ 색이 아니라 테두리다.
             *
             *   키 색은 이미 선택 표시가 쓴다. 같은 통로에 얹으면 고른 키인지 눌린
             *   키인지 구분이 안 된다.
             *
             * ★ 테두리 색은 키캡을 따라가면 안 된다.
             *
             *   처음에는 각인 색을 썼다. 고른 키는 키캡이 강조색으로 바뀌면서 각인이
             *   어두워지는데, 그러면 테두리도 같이 어두워져 **고른 키에서만 눌림이
             *   안 보였다.** 정작 만지고 있는 키가 안 보이는 셈이다.
             *
             *   키캡 색과 무관한 색을 박는다. 파랑은 이 앱의 강조색(선택)과도,
             *   기본 키캡 색과도 겹치지 않는다.
             *
             * ★ 캔버스가 아니라 여기다.
             *
             *   캔버스는 키캡 **윗면**만 덮는다. 거기에 그리면 키캡 안쪽에 줄이
             *   하나 더 그어진 꼴이라 각인과 겹쳐 지저분하다. 이 요소가 키캡 몸통
             *   자체라 outline 이 곧 바깥 테두리가 된다.
             */
            outline: label?.pressed ? `2px solid ${PRESSED_COLOR}` : undefined,
            outlineOffset: 1,
            width:
              textureWidth * CSSVarObject.keyXPos - CSSVarObject.keyXSpacing,
            height:
              textureHeight * CSSVarObject.keyYPos - CSSVarObject.keyYSpacing,
          }}
        >
          {DisplayMode.Test === mode ? (
            <TestOverlay
              style={{
                background: keycapColor,
                opacity: keycapOpacity,
              }}
            ></TestOverlay>
          ) : null}
          <CanvasContainer
            style={{
              borderRadius: 4,
              background: props.color.c,
              height: '100%',
            }}
          >
            <canvas ref={canvasRef} style={{}} />
          </CanvasContainer>
          {label?.foot ? (
            <Foot style={{color: getLiveColor(props.color.c)}}>
              {label.foot}
            </Foot>
          ) : null}
          {label?.badge ? <Badge $n={label.badge} /> : null}
        </GlowContainer>
        {(macroData || overflowsTexture) && (
          <TooltipContainer $rotate={rotation[2]}>
            <Keycap2DTooltip>
              {macroData || (label && label.tooltipLabel)}
            </Keycap2DTooltip>
          </TooltipContainer>
        )}
      </KeycapContainer>
    </>
  );
}, shallowEqual);

const GlowContainer = styled.div<{$selected: boolean}>`
  box-sizing: border-box;
  padding: 2px 6px 10px 6px;
  transition: transform 0.2s ease-out;
  box-shadow: inset -1px -1px 0 rgb(0 0 0 / 20%),
    inset 1px 1px 0 rgb(255 255 255 / 20%);
  animation: ${(p) =>
    p.$selected ? '.75s infinite alternate select-glow' : 'initial'};
  &:hover {
    transform: perspective(100px) translateZ(-5px);
    animation: 0.5s 1 forwards select-glow;
  }
`;
