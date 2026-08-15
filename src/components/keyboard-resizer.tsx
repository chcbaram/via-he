/*
 * keyboard-resizer.tsx — 키보드 그림 영역 높이 손잡이
 *
 * 캔버스와 설정판 사이를 끌어 높이를 바꾼다.
 *
 * ★ 값은 settingsSlice 에 둔다.
 *
 *   거기 두면 저장(localStorage)과 탭 동기화가 한꺼번에 해결된다. 모든 탭이 같은
 *   store 를 보므로 한 탭에서 끌면 전부 따라오고, 다시 열어도 그대로다.
 *   컴포넌트 지역 상태로 두었으면 탭을 옮길 때마다 되돌아갔을 것이다.
 */
import React, {useCallback, useRef} from 'react';
import styled from 'styled-components';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {getKeyboardHeight, updateKeyboardHeight} from 'src/store/settingsSlice';

const Bar = styled.div`
  position: relative;
  z-index: 3;
  height: 10px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;

  /* 평소에는 눈에 띄지 않고, 가져가면 드러난다 */
  &::after {
    content: '';
    width: 46px;
    height: 3px;
    border-radius: 2px;
    background: var(--color_accent);
    opacity: 0.25;
    transition: opacity 120ms ease;
  }
  &:hover::after {
    opacity: 0.8;
  }
`;

export const KeyboardResizer: React.FC = () => {
  const dispatch = useAppDispatch();
  const height = useAppSelector(getKeyboardHeight);
  const start = useRef({y: 0, h: 0});

  const onMove = useCallback(
    (e: PointerEvent) => {
      dispatch(updateKeyboardHeight(start.current.h + (e.clientY - start.current.y)));
    },
    [dispatch],
  );

  const onUp = useCallback(() => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const onDown = (e: React.PointerEvent) => {
    start.current = {y: e.clientY, h: height};
    /*
     * 창 전체에 붙인다 — 손잡이는 10px 이라 빠르게 끌면 포인터가 금방 벗어난다.
     */
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return <Bar onPointerDown={onDown} title="drag to resize" />;
};
