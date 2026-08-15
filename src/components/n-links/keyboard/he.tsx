/*
 * HE 탭이 쓰는 키보드.
 *
 * Configure 와 같은 렌더를 쓰되, 키를 골라 설정할 수 있도록 **선택 상태**를 얹는다.
 *
 * ★ 공유 렌더를 고치지 않았다.
 *
 *   KeyboardCanvas 에 ConfigureColors 모드가 이미 있다. 키 페인터가 쓰려고 만든
 *   것인데, 키마다 색을 주고 클릭·드래그를 받는 통로가 그대로 있다. 선택 표시가
 *   정확히 그 모양이라 새로 만들 필요가 없었다.
 *
 *   keyColors 는 [색상(0~360), 채도(0~1)] 쌍이다. 고른 키만 강조색을 주고 나머지는
 *   채도 0(회색)으로 둔다.
 */
import {VIAKey} from '@the-via/reader';
import {useMemo} from 'react';
import {
  getSelectedDefinition,
  getSelectedKeyDefinitions,
} from 'src/store/definitionsSlice';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {getSelectedKeymap} from 'src/store/keymapSlice';
import {addKey, getHeSelectedKeys, toggleKey} from 'src/store/heSlice';
import {DisplayMode, NDimension} from 'src/types/keyboard-rendering';
import {getKeyboardCanvas} from './configure';

const EMPTY_KEYMAP: number[] = [];

/* 고른 키 / 안 고른 키의 [색상, 채도] */
const ON: [number, number] = [8, 0.62];
const OFF: [number, number] = [0, 0];

export const HeKeyboard = (props: {
  dimensions?: DOMRect;
  nDimension: NDimension;
}) => {
  const dispatch = useAppDispatch();
  const matrixKeycodes = useAppSelector(
    (state) => getSelectedKeymap(state) || EMPTY_KEYMAP,
  );
  const keys: (VIAKey & {ei?: number})[] = useAppSelector(
    getSelectedKeyDefinitions,
  );
  const definition = useAppSelector(getSelectedDefinition);
  const selected = useAppSelector(getHeSelectedKeys);

  /*
   * 키 정의 순서 -> 매트릭스 인덱스.
   *
   * keys[] 는 물리 배치 순서라 (row, col) 로 못 찾는다. 펌웨어의 키별 명령은
   * 매트릭스 인덱스를 쓰므로 여기서 한 번 바꿔 둔다.
   */
  const cols = definition && typeof definition !== 'string' ? definition.matrix.cols : 8;
  const idxOf = (k: {row: number; col: number}) => k.row * cols + k.col;

  const keyColors = useMemo(
    () => keys.map((k) => (selected.includes(idxOf(k)) ? ON : OFF)),
    [keys, selected, cols],
  );

  if (!definition || !props.dimensions) {
    return null;
  }

  const KeyboardCanvas = getKeyboardCanvas(props.nDimension);
  return (
    <KeyboardCanvas
      matrixKeycodes={matrixKeycodes}
      keys={keys}
      selectable={true}
      definition={definition}
      containerDimensions={props.dimensions}
      mode={DisplayMode.ConfigureColors}
      keyColors={keyColors}
      onKeycapPointerDown={(_: any, i: number) =>
        dispatch(toggleKey(idxOf(keys[i])))
      }
      /* 끌면 지나간 키를 켜기만 한다 — 토글하면 왕복할 때 꺼진다 */
      onKeycapPointerOver={(_: any, i: number) =>
        dispatch(addKey(idxOf(keys[i])))
      }
    />
  );
};
