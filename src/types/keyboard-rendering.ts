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
