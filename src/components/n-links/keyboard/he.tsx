/*
 * HE 탭이 쓰는 키보드.
 *
 * Configure 와 같은 렌더를 쓴다 — 키캡 글자까지 그대로다. 그런데 **자리를 따로**
 * 잡는다. 공유 캔버스는 키보드를 경로별 슬롯에 두고 가로로 미는 구조라, 슬롯을
 * 나눠 두면 나중에 이쪽에만 깊이 표시를 얹을 수 있다.
 *
 * 깊이는 KeyboardCanvas 의 pressedKeys 통로에 실을 생각이다. 지금은 3단계 값만
 * 받으므로 연속값을 넣으려면 keycap 쪽을 손봐야 한다 — 12편에서 스트리밍이
 * 빨라진 뒤에 본다.
 */
import {VIAKey} from '@the-via/reader';
import {
  getSelectedDefinition,
  getSelectedKeyDefinitions,
} from 'src/store/definitionsSlice';
import {useAppSelector} from 'src/store/hooks';
import {getSelectedKeymap} from 'src/store/keymapSlice';
import {DisplayMode, NDimension} from 'src/types/keyboard-rendering';
import {getKeyboardCanvas} from './configure';

const EMPTY_KEYMAP: number[] = [];

export const HeKeyboard = (props: {
  dimensions?: DOMRect;
  nDimension: NDimension;
}) => {
  const matrixKeycodes = useAppSelector(
    (state) => getSelectedKeymap(state) || EMPTY_KEYMAP,
  );
  const keys: (VIAKey & {ei?: number})[] = useAppSelector(
    getSelectedKeyDefinitions,
  );
  const definition = useAppSelector(getSelectedDefinition);

  if (!definition || !props.dimensions) {
    return null;
  }

  const KeyboardCanvas = getKeyboardCanvas(props.nDimension);
  return (
    <KeyboardCanvas
      matrixKeycodes={matrixKeycodes}
      keys={keys}
      /* 키를 고르는 화면이 아니다 — 설정은 아래 그리드에서 한다 */
      selectable={false}
      definition={definition}
      containerDimensions={props.dimensions}
      mode={DisplayMode.Configure}
    />
  );
};
