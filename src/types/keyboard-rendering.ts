import {ThreeEvent} from '@react-three/fiber';
import {VIADefinitionV2, VIADefinitionV3, VIAKey} from '@the-via/reader';
import {TestKeyState} from 'src/types/types';
import {BufferGeometry} from 'three';

export enum DisplayMode {
  Test = 1,
  Configure = 2,
  Design = 3,
  ConfigureColors = 4,
}

export enum KeycapState {
  Pressed = 1,
  Unpressed = 2,
}

export type KeyColorPair = {
  c: string;
  t: string;
};

export type NDimension = '2D' | '3D';

export type KeyboardCanvasContentProps<T> = {
  selectable: boolean;
  matrixKeycodes: number[];
  keys: (VIAKey & {ei?: number})[];
  definition: VIADefinitionV2 | VIADefinitionV3;
  pressedKeys?: TestKeyState[];
  mode: DisplayMode;
  showMatrix?: boolean;
  selectedKey?: number;
  keyColors?: number[][];
  keyLabels?: (string | undefined)[];
  keyBars?: (number | undefined)[];
  keyPressed?: (boolean | undefined)[];
  keyFoot?: (string | undefined)[];
  onKeycapPointerDown?: (e: T, idx: number) => void;
  onKeycapPointerOver?: (e: T, idx: number) => void;
  width: number;
  height: number;
};

export type KeyboardCanvasProps<T> = Omit<
  KeyboardCanvasContentProps<T>,
  'width' | 'height'
> & {
  shouldHide?: boolean;
  containerDimensions: DOMRect;
};

export type KeyGroupProps<T> = {
  selectable?: boolean;
  keys: VIAKey[];
  matrixKeycodes: number[];
  definition: VIADefinitionV2 | VIADefinitionV3;
  mode: DisplayMode;
  pressedKeys?: TestKeyState[];
  keyColors?: number[][];
  /*
   * 키캡에 찍을 글자를 밖에서 갈아 끼운다 (키 정의 순서, undefined 면 원래 각인).
   *
   * ★ 색칠과 다른 통로다.
   *
   *   칠하기는 "칠한다/안 한다" 두 값이라 키 색으로 보낼 수 있지만 스트로크나
   *   입력지점은 값이 연속이다. 같은 통로로 못 보낸다.
   */
  keyLabels?: (string | undefined)[];
  /*
   * 키캡 아래에 그릴 막대 (0~1, 키 정의 순서). 값이 아니라 **지금 상태**다.
   *
   * 글자와 통로를 따로 둔다 — 글자는 설정값처럼 가끔 바뀌지만 막대는 누르는 동안
   * 계속 움직인다. 섞어 두면 막대가 움직일 때마다 글자까지 다시 그린다.
   */
  keyBars?: (number | undefined)[];
  /*
   * 지금 **입력으로 잡힌** 키 (키 정의 순서).
   *
   * 막대(얼마나 들어갔나)와 다른 것이다. 설정한 입력지점을 넘었는지는 막대 길이를
   * 눈으로 재서는 알 수 없다 — 넘는 순간이 따로 보여야 한다.
   */
  keyPressed?: (boolean | undefined)[];
  /*
   * 키캡 **아래**(윗면 밖)에 찍을 글자 — 실시간 값이 온다.
   *
   * 윗면은 각인과 설정값이 이미 쓰고 있다. 계속 바뀌는 값을 그 위에 얹으면 둘 다
   * 안 읽힌다. 아래 치마 자리가 비어 있으므로 거기 쓴다.
   */
  keyFoot?: (string | undefined)[];
  selectedKey?: number;
  onKeycapPointerDown?: (e: T, idx: number) => void;
  onKeycapPointerOver?: (e: T, idx: number) => void;
};

export type KeyCoords<T> = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: KeyColorPair;
  idx: number;
  meshKey: string;
  onClick: (e: T, idx: number) => void;
  onPointerDown?: (e: T, idx: number) => void;
  onPointerOver?: (e: T, idx: number) => void;
};

export type KeysKeys<T> = {
  indices: string[];
  coords: KeyCoords<T>[];
};

export type KeycapSharedProps<T> = {
  label: any;
  selected: boolean;
  disabled: boolean;
  keyState: number;
  shouldRotate: boolean;
  textureOffsetX: number;
  textureWidth: number;
  textureHeight: number;
  mode: DisplayMode;
  key: string;
  skipFontCheck: boolean;
} & Omit<KeyCoords<T>, 'meshKey'>;

export type TwoStringKeycapProps = {
  clipPath: null | string;
} & KeycapSharedProps<React.MouseEvent<Element, MouseEvent>>;

export type ThreeFiberKeycapProps = {
  keycapGeometry: BufferGeometry;
} & KeycapSharedProps<ThreeEvent<MouseEvent>>;
