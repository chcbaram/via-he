import React, {useMemo} from 'react';
import {shallowEqual} from 'react-redux';
import {
  calculateKeyboardFrameDimensions,
  CSSVarObject,
  KB_FILL,
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
   * 담긴 자리를 채우는 배율 — 가로세로 중 먼저 닿는 쪽이 정한다.
   *
   * ★ 배율 상한 1 을 없앴다.
   *
   *   1 에서 막아 두면 **작은 배치가 자리를 남기고도 안 커진다.** 키 테스트 탭은
   *   풀사이즈 배치(22.5 x 6.25 유닛)라 같은 배율 1 에서 자리를 거의 채우는데,
   *   63키 보드는 15 x 5 유닛이라 한참 작게 보였다. 같은 배율인데 다른 크기로
   *   보이는 것이라, "키 테스트 탭만 크다" 로 나타났다.
   *
   *   상한을 풀면 배치가 무엇이든 자리를 채운다 — 큰 배치는 가로에, 작은 배치는
   *   세로에 먼저 닿을 뿐이다. 탭마다 다르게 보일 이유가 없어진다.
   *
   *   식에서 기준 높이(500)가 사라졌다. 손잡이로 높이를 바꾸면 그 높이에 맞춰
   *   커지고 작아진다 — 기준값을 중간에 끼울 필요가 없다.
   *
   * ★ 꽉 채우지는 않는다 (KB_FILL).
   *
   *   딱 맞게 채우면 키보드가 자리에 끼인 것처럼 보이고, 가장자리 키가 화면 끝에
   *   닿는다. 한 뼘 남겨 둔다. 크기를 조절하려면 **이 숫자 하나만** 만진다 —
   *   2D·3D 가 같은 값을 쓴다.
   *
   * ★ 2D 는 CSS 확대다. 키캡이 캔버스라 1 을 넘으면 그만큼 해상도를 잃는다.
   *   레티나(dpr 2)에서는 1.5배로 키워도 실효 해상도가 1 을 넘어 티가 안 난다.
   *   흐려 보이면 캔버스를 dpr x 배율로 그리게 해야 한다 — 지금은 안 한다.
   */
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

  const ratio = KB_FILL * (Math.min(fitW, containerHeight / boardH) || 1);

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
