import React, {useMemo} from 'react';
import {shallowEqual} from 'react-redux';
import {
  calculateKeyboardFrameDimensions,
  CSSVarObject,
} from 'src/utils/keyboard-rendering';
import styled from 'styled-components';
import {
  KeyboardCanvasProps,
  KeyboardCanvasContentProps,
} from 'src/types/keyboard-rendering';
import {Case} from './case';
import {KeyGroup} from './key-group';
import {MatrixLines} from './matrix-lines';
export const KeyboardCanvas: React.FC<KeyboardCanvasProps<React.MouseEvent>> = (
  props,
) => {
  const {containerDimensions, shouldHide, ...otherProps} = props;
  const {width, height} = useMemo(
    () => calculateKeyboardFrameDimensions(otherProps.keys),
    [otherProps.keys],
  );
  const containerHeight = containerDimensions.height;
  const minPadding = 35;
  /*
   * 담긴 자리에 맞춘 배율.
   *
   * ★ 기본 높이에서의 크기는 예전 그대로, 넓히면 그만큼 커진다.
   *
   *   원래는 배율이 1 에서 막혀 자리를 넓혀도 커지지 않았다. 그렇다고 상한만 풀면
   *   기본 상태에서부터 키보드가 커져 여백이 달라진다 — 기본 높이(500)에서도
   *   높이 여유가 이미 1 을 넘기 때문이다.
   *
   *   그래서 **기준 배율은 500 으로 재고, 실제 높이와 500 의 비율만큼 곱한다.**
   *   500 은 keyboardHeight 의 기본값이다(settingsSlice). 3D 가 배율식에 500 을
   *   박아 둔 것도 같은 이유이고, 3D 가 손잡이를 내릴수록 커지는 것도 뷰포트가
   *   그만큼 커지기 때문이다 — 이제 두 모드가 같은 식으로 움직인다.
   *
   *   마지막에 실제로 담기는 배율로 한 번 더 자른다. 안 자르면 좁은 창에서 옆이
   *   넘친다.
   *
   *   2D 는 CSS 확대라 1 을 넘으면 글자가 그만큼 흐려진다. 크게 보려고 넓히는
   *   것이므로 흐려도 안 보이는 것보다 낫다고 보고 열어 둔다.
   */
  const DEFAULT_H = 500;

  const fitW =
    (containerDimensions &&
      containerDimensions.width /
        ((CSSVarObject.keyWidth + CSSVarObject.keyXSpacing) * width -
          CSSVarObject.keyXSpacing +
          minPadding * 2)) ||
    1;
  const boardH =
    (CSSVarObject.keyHeight + CSSVarObject.keyYSpacing) * height -
    CSSVarObject.keyYSpacing +
    minPadding * 2;

  const base = Math.min(1, fitW, DEFAULT_H / boardH);
  const ratio =
    Math.min(
      base * (containerHeight / DEFAULT_H),
      fitW,
      containerHeight / boardH,
    ) || 1;

  return (
    <div
      style={{
        transform: `scale(${ratio}, ${ratio})`,
        opacity: shouldHide ? 0 : 1,
        position: 'absolute',
        pointerEvents: shouldHide ? 'none' : 'all',
      }}
    >
      <KeyboardCanvasContent {...otherProps} width={width} height={height} />
    </div>
  );
};
const KeyboardGroup = styled.div`
  position: relative;
`;

const KeyboardCanvasContent: React.FC<
  KeyboardCanvasContentProps<React.MouseEvent>
> = React.memo((props) => {
  const {
    matrixKeycodes,
    keys,
    definition,
    pressedKeys,
    mode,
    showMatrix,
    selectable,
    width,
    height,
  } = props;

  return (
    <KeyboardGroup>
      <Case width={width} height={height} />
      <KeyGroup
        {...props}
        keys={keys}
        mode={mode}
        matrixKeycodes={matrixKeycodes}
        selectable={selectable}
        definition={definition}
        pressedKeys={pressedKeys}
      />
      {showMatrix && (
        <MatrixLines
          keys={keys}
          rows={definition.matrix.rows}
          cols={definition.matrix.cols}
          width={width}
          height={height}
        />
      )}
    </KeyboardGroup>
  );
}, shallowEqual);
