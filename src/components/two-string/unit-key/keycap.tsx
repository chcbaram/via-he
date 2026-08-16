import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {shallowEqual} from 'react-redux';
import {TestKeyState} from 'src/types/types';
import {getDarkenedColor} from 'src/utils/color-math';
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
  } else if (label.topLabel && label.bottomLabel && label.subLabel) {
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
    let fontSize = (label.subLabel ? 11 : 13) * label.size;
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
      label.subLabel
        ? topLabelMargin.y + fontHeight
        : faceMidLeftY + 0.5 * fontHeight,
    );
    // return if label would have overflowed so that we know to show tooltip
    overflowed =
      context.measureText(label.centerLabel).width >
      canvasWidth - centerLabelMargin.x;
  } else if (typeof label.label === 'string') {
    let fontSize = label.subLabel ? 18 : 22;
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
    const fontSize = 11;
    context.font = `${fontSize}px ${fontFamily}`;
    context.textAlign = 'right';
    context.globalAlpha = 0.8;
    context.fillText(label.subLabel, canvasWidth - 4, canvasHeight - 4);
    context.globalAlpha = 1;
    context.textAlign = 'start';
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
