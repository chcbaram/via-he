import {getBoundingBox, Result, VIAKey} from '@the-via/reader';
import {useAppDispatch} from 'src/store/hooks';
import {updateSelectedKey} from 'src/store/keymapSlice';
import {
  KeycapSharedProps,
  KeyGroupProps,
  KeysKeys,
} from 'src/types/keyboard-rendering';
import {getByteToKey} from 'src/utils/key';
import {getBasicKeyDict} from 'src/utils/key-to-byte/dictionary-store';
import {
  calculatePointPosition,
  getKeyboardRowPartitions,
  getKeyId,
  getLabel,
  getMeshName,
  getScale,
  KeycapMetric,
} from 'src/utils/keyboard-rendering';

export function getKeycapSharedProps<T>(
  k: VIAKey,
  i: number,
  props: KeyGroupProps<T>,
  keysKeys: KeysKeys<T>,
  selectedKeyIndex: number | null,
  labels: any[],
  skipFontCheck: boolean,
): KeycapSharedProps<T> {
  const {
    position,
    rotation,
    scale,
    color,
    idx,
    onClick,
    onPointerDown,
    onPointerOver,
  } = keysKeys.coords[i];
  const isEncoder = k['ei'] !== undefined;
  return {
    mode: props.mode,
    position: position,
    rotation: rotation,
    scale: getScale(k, scale),
    textureWidth: k.w,
    textureHeight: k.h,
    textureOffsetX: !!k.w2 ? Math.abs(k.w2 - k.w) : 0,
    color: color,
    shouldRotate: isEncoder,
    onPointerDown: onPointerDown,
    onPointerOver: onPointerOver,
    keyState: props.pressedKeys ? props.pressedKeys[i] : -1,
    disabled: !props.selectable,
    selected: i === selectedKeyIndex,
    idx: idx,
    label: labels[i],
    onClick: onClick,
    key: keysKeys.indices[i],
    skipFontCheck,
  };
}

const getKeysKeysIndices =
  (vendorProductId: number) => (k: VIAKey, i: number) => {
    const isEncoder = k['ei'] !== undefined;
    return `${vendorProductId}-${i}-${k.w}-${k.h}-${isEncoder}`;
  };

export function getLabels<T>(
  props: KeyGroupProps<T>,
  macroExpressions: string[],
  basicKeyToByte: ReturnType<typeof getBasicKeyDict>,
  byteToKey: ReturnType<typeof getByteToKey>,
  keycodeLUT?: Record<string, {name: string; title?: string}>,
) {
  return !props.matrixKeycodes.length
    ? []
    : props.keys.map((k, i) => {
        const base = getLabel(
          props.matrixKeycodes[i],
          k.w,
          macroExpressions,
          props.definition,
          basicKeyToByte,
          byteToKey,
          keycodeLUT,
        );

        /*
         * 밖에서 준 값은 **각인 아래에 얹는다** (subLabel).
         *
         * ★ 각인을 갈아 끼우면 안 된다.
         *
         *   처음에는 각인 자리를 값으로 바꿨다. 그러면 어느 키인지 알 수 없어져,
         *   보정하려고 보는 화면에서 "다음에 누를 키" 를 못 찾는다. 각인은 좌상단,
         *   값은 우하단으로 갈라 놓으면 둘 다 보인다.
         *
         * ★ 각인 스타일은 **값 유무가 아니라 화면이 정한다** (compact).
         *
         *   처음에는 값이 붙은 키만 각인을 접었다. 그랬더니 같은 화면 안에서
         *   보정된 키는 한 줄, 안 된 키는 두 줄로 나와 들쭉날쭉했다. 값을 보여주는
         *   화면이면 전 키가 같은 각인 스타일이어야 한다 — 값이 아직 없는 키도
         *   곧 생길 자리를 비워 두는 것이 맞다.
         *
         * key 를 값까지 포함해 만든다 — 키캡이 이 문자열로 다시 그릴지 정한다.
         * 안 넣으면 값이 바뀌어도 옛 그림이 남는다 (보정 중에는 계속 바뀐다).
         */
        if (!props.keyLabels) return base;

        const sub = props.keyLabels[i];
        const bar = props.keyBars?.[i];
        const pressed = props.keyPressed?.[i];
        const b = base && typeof base === 'object' ? base : {};
        return {
          ...b,
          compact: true,
          subLabel: sub,
          bar,
          pressed,
          key: `${(b as any).key ?? ''}|c|${sub ?? ''}|${bar ?? ''}|${
            pressed ? 1 : 0
          }`,
        };
      });
}

export function getKeysKeys<T>(
  props: KeyGroupProps<T>,
  keyColorPalette: any,
  dispatch: ReturnType<typeof useAppDispatch>,
  getPosition: (x: number, y: number) => [number, number, number],
): KeysKeys<T> {
  const {keys} = props;
  const {rowMap} = getKeyboardRowPartitions(keys);
  const boxes = (keys as unknown as Result[]).map(getBoundingBox);
  const [minX, minY] = [
    Math.min(...boxes.map((p) => p.xStart)),
    Math.min(...boxes.map((p) => p.yStart)),
  ];
  const positions = keys
    .map((k) => {
      const key = {...k};
      if (minX < 0) {
        key.x = key.x - minX;
      }
      if (minY < 0) {
        key.y = key.y - minY;
      }
      return key;
    })
    .map(calculatePointPosition);
  return {
    indices: keys.map(getKeysKeysIndices(props.definition.vendorProductId)),
    coords: keys.map((k, i) => {
      // x & y are pixel positioned
      const [x, y] = positions[i];
      const r = (k.r * (2 * Math.PI)) / 360;
      // The 1.05mm in-between keycaps but normalized by a keycap width/height
      const normalizedKeyXSpacing =
        KeycapMetric.keyXSpacing / KeycapMetric.keyWidth;
      const normalizedKeyYSpacing =
        KeycapMetric.keyYSpacing / KeycapMetric.keyHeight;
      const normalizedWidth =
        (1 + normalizedKeyXSpacing) * (k.w2 || k.w) - normalizedKeyXSpacing;
      const normalizedHeight =
        k.h * (1 + normalizedKeyYSpacing) - normalizedKeyYSpacing;
      const meshKey = getMeshName(k, rowMap[getKeyId(k)], false);
      const paletteKey = props.keyColors ? i : k.color;
      const color = (keyColorPalette as any)[paletteKey];

      return {
        position: getPosition(x + minX, y + minY),
        rotation: [0, 0, -r],
        scale: [normalizedWidth, normalizedHeight, 1],
        color,
        meshKey,
        idx: i,
        onClick: (evt: any, idx: number) => {
          evt.stopPropagation();
          dispatch(updateSelectedKey(idx));
        },
        onPointerDown: props.onKeycapPointerDown,
        onPointerOver: props.onKeycapPointerOver,
      };
    }),
  };
}
