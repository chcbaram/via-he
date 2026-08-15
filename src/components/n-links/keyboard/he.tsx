/*
 * HE 탭이 쓰는 키보드.
 *
 * Configure 와 같은 렌더를 쓰되, 키를 골라 설정할 수 있도록 **선택 상태**를 얹는다.
 *
 * ★ 공유 렌더를 고치지 않았다.
 *
 *   key-group 이 색을 이렇게 고른다.
 *
 *     const paletteKey = props.keyColors ? i : k.color;
 *
 *   처음에는 keyColors 로 직접 칠했는데, 그러면 팔레트가 통째로 바뀌어 키보드가
 *   조명 편집기처럼 알록달록해졌다. 기본 어두운 키캡도, 사용자가 고른 키캡 테마도
 *   전부 무시된다.
 *
 *   대신 **고른 키의 color 만 테마의 강조색으로 바꾼다.** 색칠은 테마가 하므로
 *   테마를 바꾸면 강조색도 따라간다. 모디파이어 키가 이미 그렇게 구분되고 있으니
 *   보는 사람에게도 익숙한 표시다.
 *
 * ★ 호버만으로 선택되지 않게 한다.
 *
 *   onPointerOver 는 그냥 지나가도 불린다. 버튼이 눌린 동안만 받는다 — 키 페인터도
 *   같은 방식으로 막는다 (evt.buttons === 1).
 */
import {KeyColorType, VIAKey} from '@the-via/reader';
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

  /* 고른 키만 테마의 강조색으로 — 색칠은 테마가 한다 */
  const shownKeys = useMemo(
    () =>
      keys.map((k) =>
        selected.includes(idxOf(k)) ? {...k, color: KeyColorType.Accent} : k,
      ),
    [keys, selected, cols],
  );

  if (!definition || !props.dimensions) {
    return null;
  }

  const KeyboardCanvas = getKeyboardCanvas(props.nDimension);
  return (
    <KeyboardCanvas
      matrixKeycodes={matrixKeycodes}
      keys={shownKeys}
      selectable={false}
      definition={definition}
      containerDimensions={props.dimensions}
      mode={DisplayMode.Configure}
      onKeycapPointerDown={(evt: any, i: number) => {
        if (evt?.buttons === 1) dispatch(toggleKey(idxOf(keys[i])));
      }}
      /* 끌면 지나간 키를 켜기만 한다 — 토글하면 왕복할 때 꺼진다 */
      onKeycapPointerOver={(evt: any, i: number) => {
        if (evt?.buttons === 1) dispatch(addKey(idxOf(keys[i])));
      }}
    />
  );
};
