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
   * ★ 1 로 막지 않는다.
   *
   *   원래는 바깥의 Math.min 에 1 이 끼어 있어 아무리 자리를 넓혀도 원래 크기보다
   *   커지지 않았다. 3D 는 그런 상한이 없어(높이가 배율식에 아예 안 들어간다)
   *   가운데 손잡이를 내리면 계속 커지는데, 2D 만 어느 선에서 멈춰 두 모드가 다르게
   *   움직였다.
   *
   *   넓힌 만큼 커지는 것이 사용자가 손잡이를 끄는 이유다. 다만 2D 는 CSS 로
   *   확대하는 것이라 1 을 넘으면 글자가 그만큼 흐려진다 — 키캡 캔버스를 화면
   *   해상도에 맞춰 그리기 때문이다. 크게 보려고 넓히는 것이므로 흐려도 안 보이는
   *   것보다 낫다고 보고 열어 둔다.
   */
  const ratio =
    Math.min(
      (containerDimensions &&
        containerDimensions.width /
          ((CSSVarObject.keyWidth + CSSVarObject.keyXSpacing) * width -
            CSSVarObject.keyXSpacing +
            minPadding * 2)) ||
        1,
      containerHeight /
        ((CSSVarObject.keyHeight + CSSVarObject.keyYSpacing) * height -
          CSSVarObject.keyYSpacing +
          minPadding * 2),
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
