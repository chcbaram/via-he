/*
 * HE 탭 — 홀이펙트 전용 화면
 *
 * VIA 의 커스텀 메뉴로는 안 되는 것만 여기 둔다.
 *
 *   커스텀 메뉴로 되는 것   전역 토글·드롭다운·슬라이더 (정의 JSON 의 menus)
 *   여기가 필요한 것        키별 값, 실시간 시각화, 절차형 UI
 *
 * 커스텀 메뉴는 [채널, 값ID] 두 바이트뿐이라 키 인덱스를 넣을 자리가 없다. 그래서
 * 전역 값만 다룰 수 있고, 키별 설정과 라이브 트래킹은 이쪽 몫이다.
 *
 * ★ 화면 구조는 Configure 탭 그대로다.
 *
 *   키보드는 공유 캔버스가 그린다. 한동안 깊이 막대가 붙은 자체 배치를 그렸는데,
 *   케이스·배경·키캡을 아무리 맞춰도 다른 탭과 인상이 달라졌다. 판을 투명하게 두고
 *   그 위에 그리드만 얹으면 같은 화면이 된다.
 *
 *   깊이 시각화는 공유 렌더에 얹는 쪽으로 다시 본다 — keycap 이 이미 키별 상태를
 *   받는 통로(pressedKeys)가 있어서 거기에 실을 수 있다.
 *
 *   그리드는 3단이다 — 아이콘 레일 / 하위 메뉴 / 내용. 래피드 트리거·데드존·보정이
 *   뒤따르므로 SECTIONS 에 한 줄 더하면 메뉴가 늘어난다.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import styled from 'styled-components';
import {useAppSelector} from 'src/store/hooks';
import {getSelectedRawLayer} from 'src/store/keymapSlice';
import {getBasicKeyToByte} from 'src/store/definitionsSlice';
import {getLabelForByte} from 'src/utils/key';
import {useTranslation} from 'react-i18next';
import {
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {ConfigureBasePane} from './pane';
import {
  Grid,
  MenuCell,
  OverflowCell,
  SubmenuOverflowCell,
  SubmenuRow,
  ControlRow,
  Label,
  Detail,
  Row,
  IconContainer,
} from './grid';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
  faArrowDownUpAcrossLine,
  faBolt,
  faCircleHalfStroke,
  faMicrochip,
  faRulerVertical,
  faToggleOn,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';
import {AccentButton} from '../inputs/accent-button';
import {MenuTooltip} from '../inputs/tooltip';
import {AccentRange} from '../inputs/accent-range';
import {AccentSelect} from '../inputs/accent-select';
import {AccentSlider} from '../inputs/accent-slider';
import {MenuContainer} from './configure-panes/custom/menu-generator';
import {DepthSlider} from './he-depth';
import {
  fwFetch,
  fwList,
  iapEnterBoot,
  iapFlash,
  iapRequest,
  type FwEntry,
  type IapProgress,
} from 'src/utils/he-iap';
import {
  clearKeys,
  getHeSelectedKeys,
  setOverlayKeys,
  setKeys,
} from 'src/store/heSlice';
import {useAppDispatch} from 'src/store/hooks';
import {
  heReadSwitches,
  heReadInfo,
  heCalStart,
  heCalStatus,
  heCalSave,
  heCalCancel,
  type HeCalState,
  type HeSwitchTable,
  HeKeyGeo,
  HeKeyState,
  HeSettings,
  HeTrackChannel,
  HeTrackInfo,
  heGetSettings,
  heReadLayout,
  heSetPress,
  heSetRelease,
  heSetSwitch,
  heSetTracking,
  heSetRtPress,
  heSetRtRelease,
  heSetBottom,
  heSetDead,
  heSetRtFlags,
  heReadKeyCfg,
  heWriteKeyCfg,
  HeKeyCfg,
  HE_KEY_ALL,
  HE_RT_ON,
  HE_RT_BOTTOM,
  HE_RT_CONT,
} from 'src/utils/he-api';

/* 매트릭스 열 수. 펌웨어의 키 인덱스가 row * COLS + col 이다. */
const MATRIX_COLS = 8;

/* 1 키유닛을 픽셀로. geo 는 1/4 유닛이라 4로 나눈다. */
const U = 62;

/*
 * 하위 메뉴. 아직 펌웨어 로직이 없는 것은 disabled 로 두되 **보이게** 한다 —
 * 앞으로 무엇이 오는지 알 수 있고, 로직이 생기면 플래그만 내리면 된다.
 */
const SECTIONS = [
  /* 자주 만지는 것부터. 스위치는 한 번 정하면 끝이라 뒤에 둔다. */
  {rail: 'tune', key: 'actuation', label: 'PRESS POINT', icon: faArrowDownUpAcrossLine},
  {rail: 'tune', key: 'rapid', label: 'RAPID TRIGGER', icon: faBolt},
  {rail: 'tune', key: 'deadzone', label: 'DEAD ZONE', icon: faCircleHalfStroke},
  {rail: 'tune', key: 'switch', label: 'SWITCH', icon: faToggleOn},

  /*
   * ★ 보정은 갈래가 다르다.
   *
   *   위엣것들은 **취향을 정하는** 설정이라 자주 만지고 값이 바로 반영된다.
   *   보정은 **장치를 재는** 일이라 한 번 하고 잊는다. 성격이 다른 것을 같은
   *   목록에 두면 "이것도 매번 만져야 하나" 로 읽힌다.
   *
   *   그리고 보정은 하나가 아니다 — 바닥값(지금)에 이어 비선형 보정이 온다.
   */
  {rail: 'cal', key: 'calibrate', label: 'BOTTOM-OUT', icon: faRulerVertical},

  /*
   * 장치 자체를 다루는 것들. 프로파일·내보내기도 앞으로 여기 붙는다.
   *
   * ★ 이름을 "Settings" 로 하지 않았다. VIA 에 이미 전역 Settings 탭이 있어
   *   같은 말을 두 군데 쓰면 어느 쪽인지 헷갈린다.
   */
  {rail: 'device', key: 'firmware', label: 'FIRMWARE', icon: faMicrochip},
] as const;

/*
 * 아이콘 레일은 큰 갈래를, 가운데 열은 그 안의 항목을 고른다.
 */
const RAILS = [
  {key: 'tune', title: 'Hall Effect', icon: faWaveSquare},
  {key: 'cal', title: 'Calibration', icon: faRulerVertical},
  {key: 'device', title: 'Device', icon: faMicrochip},
] as const;

type RailKey = (typeof RAILS)[number]['key'];
type SectionKey = (typeof SECTIONS)[number]['key'];

/*
 * 이름 뒤에 전 행정을 같이 찍는다. 자기 스위치를 아는 사람은 제품을 골라야 mm 가
 * 맞는다 — 일반형 4.0mm 로 두고 실제가 3.4mm 였을 때 모든 mm 가 18% 어긋났다.
 *
 * ★ 목록은 **장치에서 읽는다** (heReadSwitches). 여기 박아 두면 펌웨어에 스위치를
 *   하나 추가할 때 번호가 밀려, 사용자가 고른 것과 다른 스위치가 걸린다.
 */
const switchOptions = (tbl: HeSwitchTable | null) =>
  (tbl?.list ?? []).map((s, value) => ({
    label: `${s.name}  (${(s.travelUm / 100).toFixed(1)} mm)`,
    value,
  }));

/*
 * 프리셋. 슬라이더 세 개를 모르는 사람도 바로 쓸 수 있게 한다.
 *
 * 첫 줄은 8편에서 정한 펌웨어 기본값과 같다 — 상용 웹툴의 "처음 사용자용" 과도
 * 같은 값이라 기준으로 삼기 좋다.
 */
const PRESETS = [
  {label: 'Beginner', press: 100, release: 50, rt: 50},
  {label: 'Adaptive', press: 50, release: 20, rt: 30},
  {label: 'Advanced', press: 30, release: 10, rt: 30},
] as const;

/*
 * Configure 탭과 같은 판.
 *
 * 키보드는 공유 캔버스가 그린다 — 자체 렌더를 두면 아무리 맞춰도 다른 탭과 인상이
 * 달라진다. 판을 투명하게 두고 그 위에 그리드만 얹는다.
 */

/*
 * 내용은 가운데로 모은다. ControlRow 가 max-width 960px 이라 좁은 창에서는 꽉 차고
 * 넓은 창에서는 가운데 정렬된다 — Test 탭과 같은 모양이다.
 */
const Content = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 18px 24px 24px;
`;

/*
 * 슬라이더 옆의 mm 값.
 *
 * ★ 폭을 고정한다.
 *
 *   본문 폰트가 비례폭이라 숫자마다 글자 폭이 다르다 (1 이 0 보다 좁다). 값이
 *   바뀔 때마다 이 칸의 폭이 변하고, 같은 줄의 슬라이더가 그만큼 늘었다 줄었다
 *   했다. 슬라이더를 잡고 끄는 내내 눈금이 흔들리는 셈이다.
 *
 *   tabular-nums 로 숫자 폭을 맞추고, 그래도 남는 흔들림은 min-width 로 막는다.
 */
const Val = styled.span`
  margin-left: 12px;
  /*
   * ★ min-width 가 아니라 고정폭이다.
   *
   *   하한만 두었더니 "1.00 mm" 가 그 하한보다 넓어서 내용에 따라 폭이 그대로
   *   변했다. 값이 없을 때 찍는 "—" 와 폭이 달라 슬라이더가 왔다 갔다 했다.
   */
  flex: 0 0 96px;
  width: 96px;
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

/* 고른 키들의 값이 서로 다르면 숫자 대신 이걸 보여준다 */
const fmtMm = (v: number | null) =>
  v === null ? '—' : `${(v / 100).toFixed(2)} mm`;

/*
 * 설명 말풍선.
 *
 * 기존 MenuTooltip 은 nowrap 에 대문자라 메뉴 라벨용이다. 여기 필요한 것은 두세 줄
 * 짜리 설명이라 따로 만든다.
 *
 * 설명은 Note 로도 아래에 적어 두지만, 항목이 여럿이면 어느 설명이 어느 항목의
 * 것인지 짚기 어렵다. 이름 위에서 바로 뜨는 쪽이 확실하다.
 */
const HintBubble = styled.span`
  position: absolute;
  left: 0;
  top: 100%;
  margin-top: 6px;
  width: 340px;
  max-width: 60vw;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border_color_cell);
  background: var(--bg_menu);
  color: var(--color_label);
  font-size: 13px;
  line-height: 1.55;
  white-space: normal;
  text-align: left;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
  z-index: 20;
`;

const HintWrap = styled.span`
  position: relative;
  border-bottom: 1px dotted currentColor;
  cursor: help;

  &:hover ${HintBubble} {
    opacity: 1;
  }
`;

const Hint: React.FC<{tip: string; children: React.ReactNode}> = ({
  tip,
  children,
}) => (
  <HintWrap>
    {children}
    <HintBubble>{tip}</HintBubble>
  </HintWrap>
);

/*
 * 선택 버튼 셋.
 *
 * ★ 목록 상자와 폭을 맞추려다 되돌렸다.
 *
 *   두 줄의 오른쪽 끝이 어긋나는 게 눈에 걸려 폭을 맞춰 봤는데, 그러자 **다른
 *   탭의 슬라이더가 상대적으로 좁아 보였다.** 이 열의 폭은 이 화면 하나가 아니라
 *   탭 전체가 나눠 쓰는 값이라, 한 줄만 보고 정하면 다른 데가 틀어진다.
 */
/*
 * 굽기 진행 막대.
 *
 * 부트로더로 넘어가고 기다리는 동안에는 비율을 모른다 — 그때는 흐르는 줄무늬로
 * "살아 있다" 만 보여준다.
 */
const FwStat = styled.span`
  margin-left: 12px;
  white-space: nowrap;
`;

const FwBar = styled.div`
  width: 260px;
  height: 10px;
  border-radius: 5px;
  background: var(--bg_control);
  overflow: hidden;
  display: inline-block;
  vertical-align: middle;
`;

const FwBarFill = styled.div<{$pct: number; $busy: boolean}>`
  height: 100%;
  width: ${(p) => (p.$busy ? 100 : p.$pct)}%;
  background: ${(p) =>
    p.$busy
      ? 'repeating-linear-gradient(45deg, var(--color_accent) 0 8px, transparent 8px 16px)'
      : 'var(--color_accent)'};
  transition: width 0.15s linear;
`;

const SelBtn = styled(AccentButton)`
  margin-left: 8px;
  min-width: 92px;
`;

/*
 * 선택 버튼 세 개를 한 덩어리로 묶는다.
 *
 * ★ 재려고 두는 것이다.
 *
 *   바로 아래 스위치 목록의 폭을 이 줄에 맞추고 싶은데, 버튼 폭은 번역에 따라
 *   달라진다 (min-width 92px 는 바닥일 뿐이고 "Select All" 은 이미 넘친다).
 *   그래서 숫자를 골라 두면 언어를 바꾸는 순간 다시 어긋난다 — 실제로 92 로
 *   맞춰 놓고 두 번 틀렸다.
 *
 *   짐작하지 말고 그려진 것을 잰다. 첫 버튼의 margin-left 도 폭에 들어가므로
 *   잰 값을 그대로 쓰면 오른쪽 끝이 맞는다.
 */
const SelBtnGroup = styled.span`
  display: inline-flex;
`;

/*
 * 굽기 쪽 버튼.
 *
 * "다시 굽기" 와 ".bin 고르기" 가 세로로 나란히 놓이는데 글자 길이가 달라 크기가
 * 제각각이면 목록으로 안 읽힌다. 폭을 하나로 잡되 **min-width 로** 둔다 — 고정
 * 폭이면 번역이 길어질 때 글자가 넘친다.
 */
const FwBtn = styled(SelBtn)`
  min-width: 150px;
  white-space: nowrap;
`;

/*
 * 프리셋 버튼은 폭을 맞춘다.
 *
 * 글자 길이가 달라 버튼 크기가 제각각이면 목록으로 안 읽히고 그냥 흩어진 버튼이
 * 된다. 가장 긴 이름에 맞춰 고정한다.
 */
const PresetButton = styled(AccentButton)`
  min-width: 130px;
`;

/*
 * 프리셋 한 줄이 담는 값들.
 *
 * 항목 이름을 짧게 줄여(Actuation Point -> Actuation) 한 줄에 넣는다. 두 줄로
 * 접으면 버튼과 값이 세로로 어긋나 어느 버튼의 값인지 읽기 어렵다.
 */
const PresetVals = styled.div`
  white-space: nowrap;
  font-size: 13px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
`;

const Note = styled.div`
  width: 100%;
  max-width: 960px;
  opacity: 0.6;
  font-size: 13px;
  margin-top: 12px;
  line-height: 1.6;
`;

const Err = styled(Note)`
  color: var(--color_error);
  opacity: 1;
`;

export const HePane: React.FC = () => {
  const {t} = useTranslation();
  const device = useAppSelector(getSelectedConnectedDevice);
  const api = useAppSelector(getSelectedKeyboardAPI);

  const [rail, setRail] = useState<RailKey>('tune');
  const [section, setSection] = useState<SectionKey>('actuation');
  const [layout, setLayout] = useState<HeKeyGeo[]>([]);
  const [info, setInfo] = useState<HeTrackInfo | null>(null);
  const [state, setState] = useState<HeKeyState[]>([]);
  const [tracking, setTracking] = useState(false);
  const [cfg, setCfg] = useState<HeSettings | null>(null);
  const [switches, setSwitches] = useState<HeSwitchTable | null>(null);
  const [cal, setCal] = useState<HeCalState | null>(null);
  /* 보정 화면에서 읽는 전 키 상태 — 어느 키가 이미 보정됐나 */
  const [calAll, setCalAll] = useState<HeKeyCfg[] | null>(null);
  const [fw, setFw] = useState<IapProgress | null>(null);
  const [fwErr, setFwErr] = useState<string | null>(null);
  const [fwList_, setFwList] = useState<FwEntry[] | null>(null);
  const [fwPick, setFwPick] = useState(0);
  const [fwInfo, setFwInfo] = useState<{board: string; version: string} | null>(
    null,
  );
  const fwInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  /*
   * 선택 버튼 줄의 실제 폭. 스위치 목록이 이 폭을 따른다.
   *
   * 처음 그려질 때와 언어가 바뀔 때 값이 달라지므로 ResizeObserver 로 따라간다.
   * 없으면(구형) 잰 값 없이 기본값으로 둔다 — 어긋날 뿐 깨지지는 않는다.
   */
  const selRowRef = useRef<HTMLSpanElement>(null);
  const [selRowW, setSelRowW] = useState(330);

  useEffect(() => {
    const el = selRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setSelRowW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
    /* 버튼 줄은 설정 갈래에서만 그려진다 — 갈래가 바뀌면 붙일 대상도 바뀐다 */
  }, [rail]);
  const fwPermit = useRef<((d: HIDDevice | null) => void) | null>(null);
  const fwVid = useRef<number | undefined>(undefined);
  const fwPid = useRef<number | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [fps, setFps] = useState(0);


  /*
   * 키 이름은 키맵에서 온다 — 숫자만 있으면 어느 키인지 세어봐야 한다.
   *
   * ★ getSelectedKeymap 이 아니라 원본 레이어를 쓴다.
   *   그쪽은 **키 정의 순서**로 늘어놓은 배열이라 (row, col) 로 못 찾는다.
   *   원본 레이어는 EEPROM 배치 그대로라 row * cols + col 이 통한다.
   */
  const rawLayer = useAppSelector(getSelectedRawLayer);

  /*
   * 고른 키. 키보드 그림(공유 캔버스)과 여기가 같은 것을 본다 — 그래서 스토어에 있다.
   */
  const dispatch = useAppDispatch();
  const selectedKeys = useAppSelector(getHeSelectedKeys);

  const {basicKeyToByte, byteToKey} = useAppSelector(getBasicKeyToByte);

  const chan = useRef<HeTrackChannel | null>(null);
  const frames = useRef(0);

  const send = useCallback(
    async (cmd: number, bytes: number[]) => {
      if (!api) throw new Error('no device');
      return api.hidCommand(cmd, bytes);
    },
    [api],
  );

  /*
   * 고른 키들의 값.
   *
   * ★ 아무것도 안 고르면 전역이다.
   *
   *   "전역"과 "키별"을 따로 두면 어느 쪽이 이기는지가 계속 문제가 된다. 그래서
   *   선택이 비면 전 키(HE_KEY_ALL)에 쓰고, 표시는 이미 읽어 둔 전역 값을 쓴다.
   */
  const [keyCfgs, setKeyCfgs] = useState<Record<number, HeKeyCfg>>({});

  useEffect(() => {
    if (!api || selectedKeys.length === 0) return;
    let alive = true;
    (async () => {
      const out: Record<number, HeKeyCfg> = {};
      for (const i of selectedKeys) {
        try {
          out[i] = await heReadKeyCfg(send, i);
        } catch {
          /* 한 키가 실패해도 나머지는 읽는다 */
        }
      }
      if (alive) setKeyCfgs(out);
    })();
    return () => {
      alive = false;
    };
  }, [api, send, selectedKeys]);

  /*
   * 고른 키들이 같은 값을 가지면 그 값, 다르면 null.
   *
   * 아무 값이나 대표로 보여주면, 만지지도 않은 키가 조용히 그 값으로 바뀐 것처럼
   * 보인다. 다를 때는 다르다고 하는 편이 낫다.
   */
  const pick = <K extends keyof HeKeyCfg>(k: K): HeKeyCfg[K] | null => {
    if (selectedKeys.length === 0) return null;
    const vals = selectedKeys.map((i) => keyCfgs[i]?.[k]);
    if (vals.some((v) => v === undefined)) return null;
    return vals.every((v) => v === vals[0]) ? (vals[0] as HeKeyCfg[K]) : null;
  };

  /* 고른 키가 있으면 그 값, 없으면 전역 값 */
  const num = (k: keyof HeKeyCfg, global: number) => {
    if (selectedKeys.length === 0) return global;
    const v = pick(k);
    return typeof v === 'number' ? v : null;
  };

  /* 배치에 있는 키의 매트릭스 인덱스 — "모두 선택"과 "반전"의 모집단 */
  const allKeyIndexes = useMemo(
    () => layout.map((g) => g.row * MATRIX_COLS + g.col),
    [layout],
  );

  /*
   * 값을 고른 키(또는 전 키)에 쓴다.
   *
   * ★ 항목을 하나씩 따로 쓰면 안 된다.
   *
   *   처음에는 put(항목, 값) 하나만 두고 프리셋에서 네 번 불렀다. 그런데 네 번 다
   *   같은 keyCfgs 스냅샷을 쓴다 — 리액트 상태는 다음 렌더까지 안 바뀐다. 그래서
   *   두 번째 호출이 첫 번째 결과를 덮어써 **마지막 항목만 남았다.** 프리셋을 눌러도
   *   일부만 바뀌는 것으로 나타났다.
   *
   *   바꿀 항목을 한꺼번에 받아 키마다 한 번씩만 쓴다.
   *
   * ★ 전 키를 고르면 브로드캐스트로 보낸다.
   *
   *   63키를 하나씩 쓰면 슬라이더를 끌 때마다 63 왕복이다. 펌웨어가 범위를 넘는
   *   인덱스를 "전 키"로 받으므로 한 번이면 된다.
   */
  const putMany = useCallback(
    async (patch: Partial<HeKeyCfg>) => {
      const all =
        selectedKeys.length === 0 ||
        (allKeyIndexes.length > 0 &&
          allKeyIndexes.every((i) => selectedKeys.includes(i)));
      const targets = all ? [HE_KEY_ALL] : selectedKeys;
      const done: Record<number, HeKeyCfg> = {};

      for (const i of targets) {
        const base =
          keyCfgs[i] ?? (await heReadKeyCfg(send, i === HE_KEY_ALL ? 0 : i));
        const next = {...base, ...patch} as HeKeyCfg;

        /* 해제가 입력보다 깊으면 펌웨어가 잘라내지만, 화면 값도 맞춰 둔다 */
        if (next.releaseUm >= next.pressUm && next.pressUm > 0) {
          next.releaseUm = next.pressUm - 1;
        }
        await heWriteKeyCfg(send, i, next);
        if (i !== HE_KEY_ALL) done[i] = next;
      }

      /* 브로드캐스트였으면 고른 키들의 표시값도 같이 맞춰 둔다 */
      if (all) {
        for (const i of selectedKeys) {
          if (keyCfgs[i]) done[i] = {...keyCfgs[i], ...patch} as HeKeyCfg;
        }
      }
      if (Object.keys(done).length) setKeyCfgs((m) => ({...m, ...done}));
    },
    [selectedKeys, allKeyIndexes, keyCfgs, send],
  );

  const put = useCallback(
    (k: keyof HeKeyCfg, v: number) => putMany({[k]: v} as Partial<HeKeyCfg>),
    [putMany],
  );


  /* 배치도 설정도 장치에서 읽는다 — 정의 파일이 없거나 낡아도 맞는다 */
  useEffect(() => {
    if (!api) return;
    let alive = true;
    heReadLayout(send)
      .then((l) => alive && setLayout(l))
      .catch((e) => alive && setErr(String(e)));
    heGetSettings(send)
      .then((c) => alive && setCfg(c))
      .catch(() => {});
    heReadSwitches(send)
      .then((t) => alive && setSwitches(t))
      .catch(() => {});
    heReadInfo(send)
      .then((i) => alive && setFwInfo(i))
      .catch(() => {});
    fwList()
      .then((l) => alive && setFwList(l))
      .catch(() => alive && setFwList([]));   /* 목록이 없어도 수동 굽기는 된다 */
    return () => {
      alive = false;
    };
  }, [api, send]);

  /*
   * 보정 화면을 열면 **저장돼 있는** 보정 상태를 전 키에서 읽는다.
   *
   * 보정을 도는 동안에만 칠하면, 평소에는 어느 키가 이미 보정됐는지 볼 길이 없다.
   * 63번 왕복이라 1~2초 걸리지만 화면을 열 때 한 번뿐이다.
   */
  useEffect(() => {
    /*
     * ── 키보드 그림에 무엇을 칠할지 ──────────────────────────────────────
     *
     * ★ **화면에 들어갈 때 자기 것을 넣는 것이 그 화면의 책임이다.**
     *
     *   안 넣으면 앞 화면의 표시가 그대로 남는다. 실제로 보정에서 칠한 것이
     *   펌웨어 화면까지 따라갔고, 반대로 예전 "모두 선택" 이 보정 상태로
     *   오해되기도 했다.
     *
     *   지금 정한 것 —
     *
     *     설정 갈래     null      선택 표시를 보여준다
     *     보정 (쉴 때)   안 된 키   무엇이 남았는지가 알고 싶은 것이다
     *     보정 (도는 중) 끝난 키    채워지는 것이 진행 상황이다 (아래 폴링에서)
     *     장치 갈래     []        칠할 것이 없다
     *
     *   화면이 늘면 여기에 한 줄 더한다.
     */
    if (rail === 'tune') {
      dispatch(setOverlayKeys(null));
      return;
    }
    dispatch(setOverlayKeys([]));
    if (!api || section !== 'calibrate' || cal?.active) return;

    let alive = true;
    (async () => {
      const out: HeKeyCfg[] = [];
      for (const g of layout) {
        const i = g.row * MATRIX_COLS + g.col;
        try {
          out[i] = await heReadKeyCfg(send, i);
        } catch {
          /* 한 키가 실패해도 나머지는 읽는다 */
        }
        if (!alive) return;
      }
      if (!alive) return;
      setCalAll(out);

      /*
       * ★ **안 된** 키를 칠한다.
       *
       *   끝난 키를 칠하면 61/63 이 다 켜져서 아무것도 안 켜진 것과 같다. 여기서
       *   알고 싶은 것은 "무엇이 남았나" 이고, 그건 몇 개뿐이라 눈에 띈다.
       *   보정을 도는 동안에는 반대로 끝난 키를 칠한다 — 그때는 채워지는 것이
       *   진행 상황이기 때문이다.
       */
      dispatch(
        setOverlayKeys(
          layout
            .map((g) => g.row * MATRIX_COLS + g.col)
            .filter((i) => !out[i]?.calibrated),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, [api, send, rail, section, cal?.active, layout, dispatch]);

  /*
   * 펌웨어 화면을 열 때마다 현재 버전을 다시 읽는다.
   *
   * 마운트 때 한 번만 읽으면 그 사이에 장치가 바뀌거나(굽기·재연결) 처음 읽기가
   * 실패했을 때 빈칸으로 남는다. 이 화면의 존재 이유가 버전을 보는 것이므로
   * 열 때마다 확인한다.
   */
  useEffect(() => {
    if (!api || section !== 'firmware' || busy) return;
    let alive = true;
    heReadInfo(send)
      .then((i) => alive && setFwInfo(i))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api, send, section, busy]);

  /*
   * 보정 중에는 상태를 주기적으로 읽는다.
   *
   * 표본 수집은 펌웨어가 스캔마다 하므로 여기서는 진행 상황만 가져온다. 250ms
   * 마다면 눈으로 따라가기 충분하고 USB 도 한가하다.
   */
  useEffect(() => {
    if (!api || !cal?.active) return;
    let alive = true;
    const id = setInterval(() => {
      heCalStatus(send)
        .then((c) => {
          if (!alive) return;
          setCal(c);
          dispatch(setOverlayKeys(c.keys));
        })
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [api, send, cal?.active, dispatch]);

  /*
   * Esc 로 선택을 푼다.
   *
   * 키보드를 만지다 보면 선택이 남은 줄 모르고 값을 바꾸게 된다. 빠져나갈 길이
   * 하나 있어야 한다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch(clearKeys());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  /* 나갈 때는 반드시 끈다. 안 그러면 장치가 계속 프레임을 쏜다. */
  useEffect(() => {
    return () => {
      chan.current?.close();
      if (api) heSetTracking(send, false).catch(() => {});
    };
  }, [api, send]);

  const start = async () => {
    if (!device || !api) return;
    setErr(null);
    try {
      let hid = await HeTrackChannel.find(device.vendorId, device.productId);
      if (!hid) {
        /* 권한이 없다 — 이 클릭이 사용자 제스처라 여기서 물어볼 수 있다 */
        hid = await HeTrackChannel.request(device.vendorId, device.productId);
      }
      if (!hid) {
        setErr(t('he.streamDenied'));
        return;
      }

      const nfo = await heSetTracking(send, true);
      setInfo(nfo);

      const c = new HeTrackChannel();
      await c.open(hid, nfo.keyCount);
      c.setOnFrame(() => {
        frames.current++;
      });
      chan.current = c;
      setTracking(true);
    } catch (e) {
      setErr(String(e));
    }
  };

  const stop = async () => {
    await chan.current?.close();
    chan.current = null;
    setTracking(false);
    setFps(0);
    try {
      await heSetTracking(send, false);
    } catch {
      /* 장치가 사라졌을 수도 있다 */
    }
  };

  /*
   * 화면은 60Hz 로만 새로 그린다.
   *
   * 장치는 그보다 훨씬 빠르게 보낸다. 프레임마다 리액트 상태를 갱신하면 렌더링이
   * 못 따라가고 브라우저가 멈춘다. 받은 것은 채널이 계속 덮어쓰고, 여기서는 그
   * 순간의 값을 떠 온다.
   */
  useEffect(() => {
    if (!tracking) return;
    let raf = 0;
    let last = performance.now();

    const tick = () => {
      const c = chan.current;
      if (c) setState([...c.getState()]);

      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames.current * 1000) / (now - last)));
        frames.current = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracking]);


  const travel = info?.travel ?? 400;

  /*
   * 어느 키의 깊이를 보여줄 것인가.
   *
   * 고른 키가 있으면 **그중 가장 깊은 키**다. 키를 골라 놓고 그 키를 눌러야 막대가
   * 서는 게 자연스럽고, 여러 개 골랐을 때 하나만 눌러도 보인다.
   *
   * 아무것도 안 골랐으면 전 키에서 가장 깊은 것을 쓴다 — 그때는 설정도 전 키에
   * 적용되므로 아무 키나 눌러도 되는 게 맞다.
   *
   * state[] 는 매트릭스 인덱스로 늘어서 있다 (펌웨어가 그 순서로 실어 보낸다).
   */
  const deepest = useMemo(() => {
    const idxs =
      selectedKeys.length > 0
        ? selectedKeys
        : state.map((_, i) => i);

    return idxs.reduce(
      (best, i) => {
        const k = state[i];
        return k && k.depth > best.um ? {um: k.depth, pressed: k.pressed} : best;
      },
      {um: 0, pressed: false},
    );
  }, [state, selectedKeys]);

  /*
   * 선택과 무관하게 판 전체에서 가장 깊은 키.
   *
   * ★ 보정 화면은 선택을 보면 안 된다.
   *
   *   설정 화면에서는 고른 키만 보는 것이 맞다 — 그 키들을 튜닝하는 중이니까.
   *   보정은 전 키를 하나씩 눌러야 하는 일이라, 선택이 남아 있으면 **그 키를 누를
   *   때만 막대가 움직인다.** 실제로 "특정 키만 실시간 깊이가 보인다" 로 나타났다.
   */
  const deepestAll = useMemo(
    () =>
      state.reduce(
        (best, k) =>
          k && k.depth > best.um ? {um: k.depth, pressed: k.pressed} : best,
        {um: 0, pressed: false},
      ),
    [state],
  );


  const label = (i: number) => {
    const byte = rawLayer?.keymap?.[i];
    if (byte === undefined) return '';
    return getLabelForByte(byte, 300, basicKeyToByte, byteToKey) ?? '';
  };

  const renderSection = () => {
    const todo = SECTIONS.find((s) => s.key === section) as {todo?: string};
    if (todo?.todo) {
      return <Note>{t('Not yet')} — {t(todo.todo)}</Note>;
    }

    if (section === 'firmware') {
      const cur = fwInfo?.version ?? '—';
      const rel = fwList_ ?? [];
      const sel: FwEntry | undefined = rel[fwPick];
      const pct = fw && fw.total ? Math.round((fw.sent * 100) / fw.total) : 0;

      const phase =
        fw?.phase === 'boot'
          ? t('Entering bootloader')
          : fw?.phase === 'wait'
          ? t('Waiting for bootloader')
          : fw?.phase === 'permit'
          ? t('Permission needed')
          : fw?.phase === 'write'
          ? `${pct}%`
          : fw?.phase === 'done'
          ? t('Done')
          : '';

      const flash = async (image: Uint8Array) => {
        /*
         * vid/pid 를 지금 붙잡아 둔다. 부트로더로 넘어가면 device 가 null 이
         * 되는데, 그걸 도중에 다시 읽으면 터진다.
         */
        const vid = device?.vendorId ?? fwVid.current;
        const pid = device?.productId ?? fwPid.current;
        if (vid === undefined || pid === undefined) return;
        fwVid.current = vid;
        fwPid.current = pid;

        setFwErr(null);
        setBusy(true);
        try {
          await iapFlash(vid, pid, image, setFw, () => {
            /*
             * 부트로더를 못 찾았다. 사용자가 버튼을 누를 때까지 기다린다 —
             * requestDevice() 는 사용자 제스처 안에서만 부를 수 있다.
             */
            return new Promise<HIDDevice | null>((res) => {
              fwPermit.current = res;
            });
          });
          /*
           * 구운 뒤 버전을 다시 읽는다.
           *
           * ★ 한 번만 물으면 못 받는다. 굽기가 끝나도 앱이 다시 열거되고 VIA 가
           *   장치를 다시 잡기까지 몇 초가 걸린다. 될 때까지 몇 번 두드린다.
           */
          for (let i = 0; i < 12; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const nfo = await heReadInfo(send);
              if (nfo.version) {
                setFwInfo(nfo);
                break;
              }
            } catch {
              /* 아직 안 올라왔다 */
            }
          }
        } catch (x) {
          setFwErr(String(x));
        } finally {
          setBusy(false);
        }
      };

      const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';   /* 같은 파일을 다시 골라도 이벤트가 오게 */
        if (f) await flash(new Uint8Array(await f.arrayBuffer()));
      };

      return (
        <>
          <ControlRow>
            <Label>{t('Current version')}</Label>
            <Detail>{cur}</Detail>
          </ControlRow>

          {rel.length > 0 && (
            <>
              <ControlRow>
                <Label>
                  {/* ★ 'Release' 는 앱에 이미 "해제" 로 번역돼 있다. 키를 따로 쓴다 */}
                  <Hint tip={t('he.tip.fw')}>{t('Release version')}</Hint>
                </Label>
                <Detail>
                  <AccentSelect
                    width={330}
                    value={{
                      label: `${rel[fwPick].version}  (${rel[fwPick].date})`,
                      value: fwPick,
                    }}
                    options={rel.map((r, i) => ({
                      label: `${r.version}  (${r.date})`,
                      value: i,
                    }))}
                    onChange={(o: any) => setFwPick(o?.value ?? 0)}
                  />
                </Detail>
              </ControlRow>

              {/* 릴리즈 노트 — 무엇이 바뀌는지 보고 고르게 한다 */}
              {sel?.notes?.length ? (
                <Note>
                  {sel.notes.map((n, i) => (
                    <div key={i}>· {n}</div>
                  ))}
                </Note>
              ) : null}

              <ControlRow>
                <Label>{t('Update')}</Label>
                <Detail>
                  <FwBtn
                    disabled={busy || !sel}
                    onClick={async (e: React.MouseEvent) => {
                      (e.currentTarget as HTMLElement).blur();
                      if (!sel) return;
                      setFwErr(null);
                      try {
                        await flash(await fwFetch(sel));
                      } catch (x) {
                        setFwErr(String(x));
                      }
                    }}
                  >
                    {/*
                      * ★ 이름 공간을 쓴다.
                      *
                      *   이 앱은 영어 문장을 그대로 키로 쓰는데, 'Flash' 는 이미
                      *   조명 뜻으로 "플래시" 라 번역돼 있어 그대로 쓸 수 없다.
                      *   피하려고 'Flash firmware' 로 늘렸더니 이번엔 영어에서
                      *   버튼이 150px 를 넘어 옆 버튼들과 폭이 안 맞았다.
                      *   짧은 낱말을 쓰되 키를 따로 두는 쪽이 맞다.
                      */}
                    {sel && sel.version === cur
                      ? t('he.fw.reflash')
                      : t('he.fw.flash')}
                  </FwBtn>
                </Detail>
              </ControlRow>
            </>
          )}

          {/* 손으로 고르는 길도 남긴다 — 배포 목록에 없는 빌드를 굽는 자리 */}
          <ControlRow>
            <Label>{t('From file')}</Label>
            <Detail>
              <FwBtn
                disabled={busy}
                onClick={(e: React.MouseEvent) => {
                  (e.currentTarget as HTMLElement).blur();
                  setFwErr(null);
                  fwInput.current?.click();
                }}
              >
                {t('Choose .bin')}
              </FwBtn>
              <input
                ref={fwInput}
                type="file"
                accept=".bin"
                style={{display: 'none'}}
                onChange={onFile}
              />
            </Detail>
          </ControlRow>

          {/*
            * ★ 진행은 막대로 보여준다.
            *
            *   숫자만 있으면 멈춘 것인지 도는 것인지 알 수 없다. 굽는 동안 손을
            *   떼면 안 되는 작업이라 "지금 살아 있다" 가 보여야 한다.
            */}
          {fw && (
            <ControlRow>
              <Label>{t('Progress')}</Label>
              <Detail>
                {/*
                  * ★ 상태 글자를 Val 에 넣지 않는다.
                  *
                  *   Val 은 "1.00 mm" 에 맞춘 고정폭이라 "부트로더 기다리는 중"
                  *   같은 문구가 들어가면 두세 줄로 잘린다. 여기는 폭을 안 고정한다.
                  */}
                <FwBar>
                  <FwBarFill
                    $pct={fw.phase === 'write' ? pct : fw.phase === 'done' ? 100 : 0}
                    $busy={fw.phase === 'boot' || fw.phase === 'wait'}
                  />
                </FwBar>
                <FwStat>{phase}</FwStat>
              </Detail>
            </ControlRow>
          )}

          {/*
            * ★ 부트로더는 따로 허용받아야 한다.
            *
            *   WebHID 권한은 인터페이스 구성까지 포함해서 준다. 앱을 허용해 두어도
            *   부트로더는 다른 구성이라 목록에 안 나오고, 앱 모드일 때는 부트로더
            *   인터페이스가 없으니 미리 받아둘 수도 없다. 그래서 부트로더가 뜬
            *   뒤에 한 번 받는다 — 그 뒤로는 기억된다.
            */}
          {fw?.phase === 'permit' && (
            <>
            <Note>{t('Allow the bootloader device')}</Note>
            <ControlRow>
              <Label>{t('Permission')}</Label>
              <Detail>
                <FwBtn
                  onClick={async (e: React.MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    const dev = await iapRequest();
                    fwPermit.current?.(dev);
                    fwPermit.current = null;
                  }}
                >
                  {t('Allow')}
                </FwBtn>
              </Detail>
            </ControlRow>
            </>
          )}

          {fwErr && <Note style={{color: '#d66'}}>{fwErr}</Note>}

          {/*
            * 부트로더로만 넘기는 길.
            *
            * 굽기 전에 권한을 미리 받아 두거나(앱 모드에서는 부트로더 인터페이스가
            * 없어 미리 못 받는다), 앱이 이상해졌을 때 손으로 넘겨 놓는 데 쓴다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.boot')}>{t('Bootloader')}</Hint>
            </Label>
            <Detail>
              <FwBtn
                disabled={busy}
                onClick={async (e: React.MouseEvent) => {
                  (e.currentTarget as HTMLElement).blur();
                  setFwErr(null);
                  const vid = device?.vendorId ?? fwVid.current;
                  const pid = device?.productId ?? fwPid.current;
                  if (vid === undefined || pid === undefined) return;
                  fwVid.current = vid;
                  fwPid.current = pid;
                  try {
                    await iapEnterBoot(vid, pid);
                    setFw({phase: 'permit', sent: 0, total: 0});
                  } catch (x) {
                    setFwErr(String(x));
                  }
                }}
              >
                {t('Run')}
              </FwBtn>
            </Detail>
          </ControlRow>

          {/*
            * ★ 벽돌이 되지 않는다는 것을 먼저 말한다.
            *
            *   굽기는 사용자가 가장 무서워하는 버튼이다. 부트로더는 기록 주소를
            *   하드코딩하므로 USB 로는 자신을 덮어쓸 수 없다 — 중간에 끊겨도
            *   업데이트 모드로 남아 다시 시도하면 된다. 그걸 알면 누를 수 있다.
            */}
          <Note>
            {t(
              'The bootloader cannot overwrite itself over USB, so a failed update leaves the board in update mode — just try again.',
            )}
          </Note>
        </>
      );
    }

    if (section === 'calibrate') {
      const active = cal?.active ?? false;
      const done = cal?.done ?? 0;
      const total = cal?.total ?? 0;
      /* 표에서 가장 긴 행정. 공칭보다 깊이 들어가도 눈금 안에 들어온다 */
      const calScale = Math.max(
        travel,
        ...(switches?.list.map((x) => x.travelUm) ?? [travel]),
      );

      /*
       * ★ 누른 뒤 포커스를 뗀다.
       *
       *   보정은 **키보드를 두드리는 화면**이다. 버튼에 포커스가 남아 있으면
       *   Enter 나 Space 가 그 버튼을 누른다 — 시작하자마자 Enter 를 치면 그 자리에
       *   들어선 저장 버튼이 눌려 바로 끝나 버렸다. 스페이스바는 보정 대상이기까지
       *   해서 더 나쁘다.
       */
      const blur = (e: React.MouseEvent) =>
        (e.currentTarget as HTMLElement).blur();

      /*
       * 보정을 시작하면 라이브 트래킹도 같이 켠다.
       *
       * 얼마나 눌러야 "끝" 으로 잡히는지 보이지 않으면 사용자가 감으로 눌러야 한다.
       * WebHID 권한은 사용자 제스처가 있어야 물어볼 수 있는데, 이 클릭이 그것이다.
       */
      const beginCal = async (e: React.MouseEvent) => {
        blur(e);
        if (!tracking) await start().catch(() => {});
        return heCalStart(send)
          .then((c) => {
            setCal(c);
            dispatch(setOverlayKeys(c.keys));
          })
          .catch((e) => setErr(String(e)));
      };

      const finish = (e: React.MouseEvent, save: boolean) => {
        blur(e);
        return (save ? heCalSave(send) : heCalCancel(send))
          .then((c) => {
            setCal(c);
            /*
             * 비워 두면 위의 효과가 다시 돌아 "아직 안 된 키" 로 채운다.
             * null 을 넣으면 아직 보정 갈래인데 선택 표시가 나온다.
             */
            dispatch(setOverlayKeys([]));
          })
          .catch((x) => setErr(String(x)));
      };

      return (
        <>
          {/*
            * ★ 보정이 두 가지라는 것부터 말한다.
            *
            *   무압 기준값은 펌웨어가 늘 자동으로 따라가므로 사용자가 할 일이 없다.
            *   여기서 모으는 것은 **바닥값**뿐이고, 그건 실제로 끝까지 눌러야만
            *   알 수 있다. 안 해도 동작하지만 하면 mm 가 정확해진다는 것을 먼저
            *   알려야 "왜 63번을 눌러야 하나" 가 납득된다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.cal')}>{t('Bottom-out calibration')}</Hint>
            </Label>
            <Detail>
              {!active ? (
                <SelBtn onClick={beginCal}>{t('Start')}</SelBtn>
              ) : (
                <>
                  <SelBtn onClick={(e: React.MouseEvent) => finish(e, true)}>
                    {t('Save')}
                  </SelBtn>
                  <SelBtn onClick={(e: React.MouseEvent) => finish(e, false)}>
                    {t('Cancel')}
                  </SelBtn>
                </>
              )}
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>{t('Progress')}</Label>
            <Detail>
              {/*
                * ★ 저장 뒤에는 `n / 63` 을 쓰지 않는다.
                *
                *   그렇게 쓰면 "63개 중 5개만 보정됨" 으로 읽히는데, 실제로는
                *   이번에 5개를 **갱신**했고 나머지는 기존 보정이 그대로 있다.
                *   부분 저장을 허용하므로 이 오해가 자주 난다.
                */}
              {active
                ? `${done} / ${total}`
                : cal?.saveOk
                ? `${t('Saved')} — ${done} ${t('keys updated')}`
                : '—'}
            </Detail>
          </ControlRow>

          {/*
            * 지금 얼마나 눌렸는지. 여기서는 값을 바꾸는 자가 아니라 보는 자다 —
            * 끝까지 눌렀는지 눈으로 확인하라고 둔다.
            *
            * ★ 눈금은 **설정한 스위치 행정이 아니라 표에서 가장 긴 것**을 쓴다.
            *
            *   보정은 그 공칭 행정이 맞는지를 재는 일이다. 3.4mm 로 눈금을 그으면
            *   실제로 더 깊이 들어가는 키가 있어도 꼭대기에 붙어 안 보인다.
            *   펌웨어도 같은 이유로 자르지 않게 고쳤다.
            */}
          <ControlRow>
            <Label>{t('Live Depth')}</Label>
            <Detail>
              <DepthSlider
                value={calScale}
                travelUm={calScale}
                depthUm={tracking ? deepestAll.um : null}
                pressed={deepestAll.pressed}
                onChange={() => {}}
                readOnly
              />
              <Val>
                {tracking && deepestAll.pressed
                  ? fmtMm(deepestAll.um)
                  : '—'}
              </Val>
            </Detail>
          </ControlRow>

          <Note>
            {active
              ? t(
                  'Press every key all the way down once. Keys that are done light up on the board above.',
                )
              : t(
                  'Optional. Without it the nominal switch travel is used; with it each key is measured, so the mm values are accurate.',
                )}
          </Note>
        </>
      );
    }

    if (section === 'actuation') {
      const applyPreset = (p: (typeof PRESETS)[number]) => {
        setCfg((c) =>
          c
            ? {
                ...c,
                pressUm: p.press,
                releaseUm: p.release,
                rtPressUm: p.rt,
                rtReleaseUm: p.rt,
              }
            : c,
        );
        /*
         * 프리셋도 선택을 따른다 — 고른 키가 있으면 그 키들만 바뀐다.
         * 해제가 입력보다 얕아야 하므로 해제를 먼저 내린다.
         */
        putMany({
          pressUm: p.press,
          releaseUm: p.release,
          rtPressUm: p.rt,
          rtReleaseUm: p.rt,
        }).catch(() => {});
      };

      return (
        <>
          {/*
            * 프리셋이 무엇을 바꾸는지 보여준다.
            *
            * ★ 버튼만 늘어놓았더니 재입력 값이 안 보였다.
            *   프리셋은 입력지점·해제지점만이 아니라 RT 재입력까지 바꾸는데, 그 값은
            *   다른 탭에 있어서 여기서는 아무 표시 없이 조용히 바뀌었다. 무엇이
            *   바뀌는지 모르는 버튼은 누르기 어렵다.
            */}
          {PRESETS.map((p) => (
            <ControlRow key={p.label}>
              <Label>
                <PresetButton onClick={() => applyPreset(p)}>
                  {t(p.label)}
                </PresetButton>
              </Label>
              <Detail>
                <PresetVals>
                  {t('Press')} {(p.press / 100).toFixed(2)}
                  {'  ·  '}
                  {t('Release')} {(p.release / 100).toFixed(2)}
                  {'  ·  '}
                  {t('Re-press')} {(p.rt / 100).toFixed(2)} mm
                </PresetVals>
              </Detail>
            </ControlRow>
          ))}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.live')}>{t('Live Depth')}</Hint>
            </Label>
            <Detail>
              <AccentSlider
                isChecked={tracking}
                onChange={(v: boolean) => (v ? start() : stop())}
              />
            </Detail>
          </ControlRow>
          {/*
            * 입력지점만 세로 자로 잡는다.
            *
            * 키가 위에서 아래로 내려가므로 눈금도 그 방향이어야 읽힌다. 그리고 옆에
            * 실제 깊이를 세워 두면 "1.00mm 가 내 손가락으로 어느 정도인가"를 눌러서
            * 바로 안다 — 숫자로는 알 수 없는 것이다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.press')}>{t('Press Point')}</Hint>
            </Label>
            <Detail>
              <DepthSlider
                value={num('pressUm', cfg?.pressUm ?? 100) ?? 100}
                travelUm={travel}
                depthUm={tracking ? deepest.um : null}
                pressed={deepest.pressed}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, pressUm: v} : c));
                  put('pressUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('pressUm', cfg?.pressUm ?? 100))}
              </Val>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.release')}>{t('Release Point')}</Hint>
            </Label>
            <Detail>
              <AccentRange
                min={10}
                max={travel}
                value={num('releaseUm', cfg?.releaseUm ?? 50) ?? 50}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, releaseUm: v} : c));
                  put('releaseUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('releaseUm', cfg?.releaseUm ?? 50))}
              </Val>
            </Detail>
          </ControlRow>
        </>
      );
    }

    if (section === 'rapid') {
      const flags = num('rtFlags', cfg?.rtFlags ?? 0) ?? 0;
      const setFlag = (bit: number, on: boolean) => {
        const next = on ? flags | bit : flags & ~bit;
        setCfg((c) => (c ? {...c, rtFlags: next} : c));
        put('rtFlags', next).catch(() => {});
      };

      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.rt')}>{t('Rapid Trigger')}</Hint>
            </Label>
            <Detail>
              <AccentSlider
                isChecked={(flags & HE_RT_ON) !== 0}
                onChange={(v: boolean) => setFlag(HE_RT_ON, v)}
              />
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.cont')}>{t('Continuous')}</Hint>
            </Label>
            <Detail>
              <AccentSlider
                isChecked={(flags & HE_RT_CONT) !== 0}
                onChange={(v: boolean) => setFlag(HE_RT_CONT, v)}
              />
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.rtRelease')}>{t('Release Distance')}</Hint>
            </Label>
            <Detail>
              <AccentRange
                min={10}
                max={100}
                value={num('rtReleaseUm', cfg?.rtReleaseUm ?? 50) ?? 50}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, rtReleaseUm: v} : c));
                  put('rtReleaseUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('rtReleaseUm', cfg?.rtReleaseUm ?? 50))}
              </Val>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.rtPress')}>{t('Re-press Distance')}</Hint>
            </Label>
            <Detail>
              <AccentRange
                min={10}
                max={100}
                value={num('rtPressUm', cfg?.rtPressUm ?? 50) ?? 50}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, rtPressUm: v} : c));
                  put('rtPressUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('rtPressUm', cfg?.rtPressUm ?? 50))}
              </Val>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.bottom')}>{t('Bottom Protection')}</Hint>
            </Label>
            <Detail>
              <AccentSlider
                isChecked={(flags & HE_RT_BOTTOM) !== 0}
                onChange={(v: boolean) => setFlag(HE_RT_BOTTOM, v)}
              />
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.bottomZone')}>{t('Bottom Zone')}</Hint>
            </Label>
            <Detail>
              <AccentRange
                min={0}
                max={50}
                value={num('bottomUm', cfg?.bottomUm ?? 10) ?? 10}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, bottomUm: v} : c));
                  put('bottomUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('bottomUm', cfg?.bottomUm ?? 10))}
              </Val>
            </Detail>
          </ControlRow>
        </>
      );
    }

    if (section === 'deadzone') {
      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.dead')}>{t('Dead Zone')}</Hint>
            </Label>
            <Detail>
              <AccentRange
                min={0}
                max={50}
                value={num('deadUm', cfg?.deadUm ?? 0) ?? 0}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, deadUm: v} : c));
                  put('deadUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('deadUm', cfg?.deadUm ?? 0))}
              </Val>
            </Detail>
          </ControlRow>
        </>
      );
    }

    if (section === 'switch') {
      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.switch')}>{t('Type')}</Hint>
            </Label>
            <Detail>
              {/*
                * ★ width 는 감싸는 상자가 아니라 이 prop 이 정한다.
                *   AccentSelect 안쪽 control 스타일이
                *   width: state.selectProps.width || 250 이라 부모 폭을 무시한다.
                *   상자로 감싸도 250px 로 잘리던 이유다.
                */}
              <AccentSelect
                width={selRowW}
                value={switchOptions(switches)[cfg?.switchType ?? 0]}
                options={switchOptions(switches)}
                onChange={(o: any) => {
                  const v = o?.value ?? 0;
                  setCfg((c) => (c ? {...c, switchType: v} : c));
                  heSetSwitch(send, v).catch(() => {});
                }}
              />
            </Detail>
          </ControlRow>
        </>
      );
    }

    return null;
  };

  /*
   * ★ 굽는 동안에는 장치가 사라지는 것이 정상이다.
   *
   *   앱 -> 부트로더로 넘어가면 USB 가 다시 열거되므로 VIA 의 장치 목록에서
   *   잠깐 빠진다. 그때 "키보드를 연결하세요" 로 되돌아가면 **굽는 중인 화면이
   *   통째로 사라진다.** 실제로 그렇게 되어 장치가 부트로더에 남았다.
   *
   *   굽기가 도는 동안에는 그 화면을 붙잡아 둔다. 끝나면 장치가 다시 잡힌다.
   */
  if ((!device || !api) && !busy) {
    return (
      <Content>
        <Note>{t('he.noDevice')}</Note>
      </Content>
    );
  }

  return (
    <ConfigureBasePane>
      <Grid style={{pointerEvents: 'none'}}>
        <MenuCell style={{pointerEvents: 'all'}}>
          <MenuContainer>
            {RAILS.map((r) => (
              <Row
                key={r.key}
                $selected={rail === r.key}
                onClick={() => {
                  setRail(r.key);
                  /* 갈래를 바꾸면 그 갈래의 첫 항목으로 간다 */
                  const first = SECTIONS.find((x) => x.rail === r.key);
                  if (first) setSection(first.key);
                }}
              >
                <IconContainer>
                  <FontAwesomeIcon icon={r.icon} />
                  <MenuTooltip>{t(r.title)}</MenuTooltip>
                </IconContainer>
              </Row>
            ))}
          </MenuContainer>
        </MenuCell>
        <SubmenuOverflowCell style={{pointerEvents: 'all'}}>
          <MenuContainer>
            {SECTIONS.filter((s) => s.rail === rail).map((s) => (
              <SubmenuRow
                key={s.key}
                $selected={section === s.key}
                onClick={() => setSection(s.key)}
                style={{opacity: (s as {todo?: string}).todo ? 0.5 : 1}}
              >
                {t(s.label)}
              </SubmenuRow>
            ))}
          </MenuContainer>
        </SubmenuOverflowCell>
        <OverflowCell style={{pointerEvents: 'all'}}>
          <Content>
            {/*
              * 선택 도구는 섹션 위에 공통으로 둔다. 어느 탭에서든 "지금 몇 개를
              * 고쳤는가"가 보여야 실수가 줄어든다.
              */}
            {/*
              * ★ 보정 갈래에서는 감춘다.
              *
              *   보정은 언제나 전 키가 대상이고 펌웨어 굽기는 키와 무관하다.
              *   남겨 두면 "보정도 고른 키만 하나" 로 읽힌다.
              */}
            {rail === 'tune' && (
            <ControlRow>
              <Label>
                <Hint tip={t('he.tip.selection')}>
                  {selectedKeys.length === 0
                    ? t('All keys')
                    : `${selectedKeys.length} ${t('keys selected')}`}
                </Hint>
              </Label>
              <Detail>
                <SelBtnGroup ref={selRowRef}>
                <SelBtn onClick={() => dispatch(setKeys(allKeyIndexes))}>
                  {t('Select All')}
                </SelBtn>
                <SelBtn
                  onClick={() =>
                    dispatch(
                      setKeys(
                        allKeyIndexes.filter((i) => !selectedKeys.includes(i)),
                      ),
                    )
                  }
                >
                  {t('Invert')}
                </SelBtn>
                <SelBtn onClick={() => dispatch(clearKeys())}>
                  {t('Clear')}
                </SelBtn>
                </SelBtnGroup>
              </Detail>
            </ControlRow>
            )}
            {renderSection()}
          </Content>
        </OverflowCell>
      </Grid>
    </ConfigureBasePane>
  );
};
