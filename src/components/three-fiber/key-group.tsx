import {useGLTF} from '@react-three/drei';
import {ThreeEvent} from '@react-three/fiber';
import glbSrc from 'assets/models/keyboard_components.glb';
import {useMemo} from 'react';
import {getBasicKeyToByte} from 'src/store/definitionsSlice';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {getSelectedKey} from 'src/store/keymapSlice';
import {getExpressions} from 'src/store/macrosSlice';
import {getHostKeyboardLayout, getSelectedSRGBTheme} from 'src/store/settingsSlice';
import {keymapExtras} from 'src/utils/keymap-extras';
import {KeyGroupProps, KeysKeys} from 'src/types/keyboard-rendering';
import {getRGB} from 'src/utils/color-math';
import {
  calculateKeyboardFrameDimensions,
  CSSVarObject,
  KeycapMetric,
} from 'src/utils/keyboard-rendering';
import {useSkipFontCheck} from 'src/utils/use-skip-font-check';
import {Color} from 'three';
import {
  getKeycapSharedProps,
  getKeysKeys,
  getLabels,
} from '../n-links/key-group';
import {Keycap} from './unit-key/keycap';

const getSRGBArray = (keyColors: number[][]) => {
  return keyColors.map(([hue, sat]) => {
    const rgbStr = getRGB({
      hue: Math.round((255 * hue) / 360),
      sat: Math.round(255 * sat),
    });
    const srgbStr = `#${new Color(rgbStr)
      .convertSRGBToLinear()
      .getHexString()}`;
    const keyColor = {c: srgbStr, t: srgbStr};
    return keyColor;
  });
};
const getPosition = (x: number, y: number): [number, number, number] => [
  (KeycapMetric.keyXPos * x) / CSSVarObject.keyXPos,
  (-y * KeycapMetric.keyYPos) / CSSVarObject.keyYPos,
  0,
];
export const KeyGroup: React.FC<KeyGroupProps<ThreeEvent<MouseEvent>>> = (
  props,
) => {
  const dispatch = useAppDispatch();
  const keycapScene = useGLTF(glbSrc, true).scene;
  const selectedKey = useAppSelector(getSelectedKey);
  const selectedSRGBTheme = useAppSelector(getSelectedSRGBTheme);
  const macroExpressions = useAppSelector(getExpressions);
  const skipFontCheck = useSkipFontCheck();
  const keyColorPalette = props.keyColors
    ? getSRGBArray(props.keyColors)
    : selectedSRGBTheme;
  const {basicKeyToByte, byteToKey} = useAppSelector(getBasicKeyToByte);
  const hostKeyboardLayout = useAppSelector(getHostKeyboardLayout);
  const keycodeLUT = keymapExtras[hostKeyboardLayout]?.keycodeLUT;
  const macros = useAppSelector((state) => state.macros);
  const {keys, selectedKey: externalSelectedKey} = props;
  const selectedKeyIndex =
    externalSelectedKey === undefined ? selectedKey : externalSelectedKey;
  const keysKeys: KeysKeys<ThreeEvent<MouseEvent>> = useMemo(() => {
    return getKeysKeys(props, keyColorPalette, dispatch, getPosition);
  }, [
    keys,
    keyColorPalette,
    props.onKeycapPointerDown,
    props.onKeycapPointerOver,
  ]);
  const labels = useMemo(() => {
    return getLabels(props, macroExpressions, basicKeyToByte, byteToKey, keycodeLUT);
  /*
   * ★ keyBadge 를 빠뜨리면 배지만 바뀔 때 갱신이 안 된다.
   *
   *   RT 를 켜고 끄면 키캡의 숫자(되뗌 거리)는 그대로라 keyLabels 가 안 바뀐다.
   *   그러면 이 memo 가 안 돌아 배지가 옛 상태로 남는다. 예전에는 overlayText 를
   *   내용이 같아도 매번 새 객체로 보내서 우연히 같이 갱신됐는데, 그 중복 전송을
   *   막고 나니 드러났다 — 우연에 기대고 있었던 것이다.
   */
  }, [keys, props.matrixKeycodes, props.keyLabels, props.keyBars, props.keyPressed, props.keyFoot, props.keyBadge, macros, props.definition, keycodeLUT]);
  const {width, height} = calculateKeyboardFrameDimensions(keys);
  const elems = useMemo(() => {
    return props.keys.map((k, i) => {
      const {meshKey} = keysKeys.coords[i];
      const {key, ...otherProps} = getKeycapSharedProps(
        k,
        i,
        props,
        keysKeys,
        selectedKeyIndex,
        labels,
        skipFontCheck,
      );
      return k.d ? null : (
        <Keycap
          key={key}
          keycapGeometry={
            (
              (keycapScene.getObjectByName(meshKey) as any) ||
              keycapScene.getObjectByName('K-R1-100')
            ).geometry
          }
          {...otherProps}
        />
      );
    });
  }, [
    keys,
    selectedKeyIndex,
    labels,
    props.pressedKeys,
    props.selectable,
    keyColorPalette,
    props.definition.vendorProductId,
    skipFontCheck,
  ]);
  return (
    <group
      scale={1}
      position={[
        (-width * KeycapMetric.keyXPos + KeycapMetric.keyXSpacing) / 2,
        (KeycapMetric.keyYPos * height - KeycapMetric.keyYSpacing) / 2,
        0,
      ]}
    >
      {elems}
    </group>
  );
};
