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
        /*
         * 밖에서 준 글자가 있으면 각인 대신 그것을 찍는다.
         *
         * centerLabel 로 준다 — 가운데 줄에 13px 로 그려지는 길이라 "3.85" 같은
         * 짧은 숫자가 어느 키캡 폭에서든 들어간다. label 만 주면 22px 로 그려져
         * 1u 키에서 넘친다.
         */
        const over = props.keyLabels?.[i];
        if (over !== undefined) {
          return {
            label: over,
            centerLabel: over,
            tooltipLabel: over,
            key: `ov-${over}`,
            size: 1.0,
            offset: [0, 0] as [number, number],
          };
        }
        return getLabel(
          props.matrixKeycodes[i],
          k.w,
          macroExpressions,
          props.definition,
          basicKeyToByte,
          byteToKey,
          keycodeLUT,
        );
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
