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
import {
  addKey,
  getHeOverlayKeys,
  getHeOverlayText,
  getHeSelectedKeys,
  toggleKey,
} from 'src/store/heSlice';
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
  const overlay = useAppSelector(getHeOverlayKeys);
  const overlayText = useAppSelector(getHeOverlayText);

  /*
   * 키 정의 순서 -> 매트릭스 인덱스.
   *
   * keys[] 는 물리 배치 순서라 (row, col) 로 못 찾는다. 펌웨어의 키별 명령은
   * 매트릭스 인덱스를 쓰므로 여기서 한 번 바꿔 둔다.
   */
  const cols = definition && typeof definition !== 'string' ? definition.matrix.cols : 8;
  const idxOf = (k: {row: number; col: number}) => k.row * cols + k.col;

  /*
   * 칠할 키. 색칠은 테마가 한다 (키캡 렌더는 손대지 않는다).
   *
   * 무엇을 칠할지는 **지금 화면이 정한다** (heSlice 의 overlayKeys). null 이면
   * 보여줄 것이 없다는 뜻이라 선택 표시로 돌아간다.
   */
  const marked = overlay ?? selected;
  const shownKeys = useMemo(
    () =>
      keys.map((k) =>
        marked.includes(idxOf(k)) ? {...k, color: KeyColorType.Accent} : k,
      ),
    [keys, marked, cols],
  );

  /*
   * 키캡 글자. 렌더는 **키 정의 순서**로 받으므로 매트릭스 인덱스에서 옮겨 담는다.
   *
   * 값이 없는 키는 undefined 로 남겨 원래 각인이 나오게 한다 — 빈 문자열을 주면
   * 각인이 사라진 빈 키캡이 되어 어느 키인지 알 수 없다.
   */
  const keyLabels = useMemo(
    () =>
      overlayText
        ? keys.map((k) => overlayText[idxOf(k)])
        : undefined,
    [keys, overlayText, cols],
  );

  if (!definition || !props.dimensions) {
    return null;
  }

  const KeyboardCanvas = getKeyboardCanvas(props.nDimension);
  return (
    <KeyboardCanvas
      matrixKeycodes={matrixKeycodes}
      keys={shownKeys}
      /*
       * ★ 켜야 한다. key-group 이 disabled: !selectable 로 넘기고, 키캡은 disabled 면
       *   핸들러를 전부 noop 으로 바꾼다. 끄면 클릭도 호버 눌림 효과도 같이 죽는다.
       *
       *   호버 눌림은 Configure 모드에서만 붙는다 (ConfigureColors 는 hover(true) 를
       *   부르지 않는다). 어느 키를 가리키는지 보이려면 이 모드여야 한다.
       */
      selectable={true}
      /*
       * ★ VIA 의 단일 선택은 쓰지 않는다.
       *
       *   키캡은 hovered || selected 일 때 눌린 모양이 된다. selectable 을 켜면
       *   클릭이 updateSelectedKey 도 부르므로, 마지막에 누른 키가 손을 떼도 계속
       *   눌린 채로 남았다.
       *
       *   -1 을 넘겨 "선택된 키 없음"으로 고정한다. 우리 선택은 키 색으로 따로
       *   나타내므로 이 표시는 쓸 자리가 없다.
       */
      selectedKey={-1}
      keyLabels={keyLabels}
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
