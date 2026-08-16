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
  faFileArrowDown,
  faLayerGroup,
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
  setOverlayText,
  setOverlayBars,
  setOverlayPressed,
  setOverlayLive,
  setProfile,
  getHeProfile,
  setKeys,
} from 'src/store/heSlice';
import {useAppDispatch} from 'src/store/hooks';
import {
  heReadSwitches,
  heReadInfo,
  heCalStart,
  heCalStatus,
  heCalStrokes,
  heCalSave,
  heCalCancel,
  type HeCalState,
  type HeSwitchTable,
  HeKeyGeo,
  HeKeyState,
  HeProf,
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
  heMakeBackup,
  heCheckBackup,
  heMakeSend,
  heProfGet,
  heProfCopy,
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
/*
 * 화면별로 키캡에 얹을 값.
 *
 * ★ 그 화면이 다루는 값을 **다** 얹는다.
 *
 *   입력지점만 얹었더니 해제지점이 어디인지는 키캡에서 알 수 없었다. 한 자에서
 *   둘을 같이 잡게 해 놓고 키캡에는 하나만 보이면 앞뒤가 안 맞는다.
 *
 *   순서는 화면의 줄 순서와 같다 — 화면에서 위에 있는 것이 앞에 온다.
 *
 * 여기 없는 화면은 값을 안 얹는다. 화면이 늘면 한 줄 더한다.
 */
const OVERLAY_FIELDS: Record<string, (keyof HeKeyCfg)[] | undefined> = {
  actuation: ['releaseUm', 'pressUm'],
  rapid: ['rtReleaseUm', 'rtPressUm'],
  deadzone: ['deadUm'],
  /*
   * 스위치 화면은 그 키에 걸린 **전 행정**을 보인다.
   *
   * 이 화면에서 고르는 것은 종류이고, 종류가 바꾸는 것이 이 값이다. 종류 이름은
   * 목록에 이미 있으므로 키캡에 또 적을 것이 아니다 — 고른 결과가 무엇인지가
   * 알고 싶은 것이다. 보정된 키는 실측이 이 값을 대신하지만, 그건 보정 화면이
   * 카운트로 보여준다.
   */
  switch: ['travelUm'],
};

const SECTIONS = [
  /*
   * ★ 프로파일이 맨 위다.
   *
   *   아래 화면들이 정하는 값이 전부 **어느 프로파일 안의** 값이다. 그걸 모르고
   *   값을 만지면 나중에 "내가 맞춰 둔 게 어디 갔나" 가 된다. 무엇을 고치는지 먼저
   *   보여야 한다.
   */
  {rail: 'tune', key: 'profile', label: 'PROFILE', icon: faLayerGroup},

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
  {rail: 'device', key: 'backup', label: 'BACKUP', icon: faFileArrowDown},
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

/*
 * 한 줄짜리 요약값.
 *
 * ★ Val 을 쓰면 안 된다.
 *
 *   Val 은 슬라이더 옆에 붙는 자리라 96px 고정폭이다. 슬라이더가 값에 따라 왔다
 *   갔다 하지 않게 하려고 그렇게 둔 것인데, 요약처럼 긴 문장을 넣으면 그 폭에서
 *   네 줄로 접힌다. 실제로 그렇게 나갔다.
 */
const Summary = styled.span`
  margin-left: 12px;
  white-space: nowrap;
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

/*
 * 한 줄이 값을 둘 다룰 때 아래에 붙는 둘째 이름.
 *
 * 자 하나에 손잡이가 둘이므로 이름도 둘이어야 한다. 행을 나누면 자가 두 개인 줄
 * 안다 — 같은 행에 둔다.
 *
 * ★ 글자 크기는 첫째 이름과 같다.
 *
 *   작게 줄였더니 덜 중요한 값으로 읽혔다. 둘은 대등한 값이다 — 하나는 들어갈 때,
 *   하나는 나올 때를 정할 뿐이다.
 */
const SecondLabel = styled.div`
  margin-top: 14px;
`;

/*
 * 프로파일 버튼.
 *
 * 지금 것을 색으로 나타낸다 — 넷이 나란히 있으면 어느 것이 켜져 있는지가 가장 먼저
 * 알고 싶은 것이다.
 */
const ProfBtn = styled(AccentButton)<{$on: boolean}>`
  margin-left: 8px;
  min-width: 52px;
  opacity: ${(p) => (p.$on ? 1 : 0.55)};
  border-width: ${(p) => (p.$on ? 2 : 1)}px;
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
   * 키캡 아래에 **원시 ADC 값**을 같이 보일지.
   *
   * 평소에는 mm 만 보면 된다. 원시값은 센서가 실제로 무엇을 보고 있는지 확인할 때
   * 쓰는 것이라 늘 켜 두면 숫자만 많아진다 — 옵션으로 둔다.
   *
   * 값은 이미 스트림에 실려 온다 (프레임의 키당 4바이트 중 앞 2바이트). 펌웨어에
   * 더할 것이 없다.
   */
  const [showRaw, setShowRaw] = useState(false);

  /* 내보내기·가져오기 진행 상황 한 줄 */
  /*
   * 지금 프로파일 — 리덕스에서 본다.
   *
   * 키보드 이름 배지 옆에서도 바꿀 수 있다. 이 화면이 자기 상태로 들고 있으면
   * 거기서 바꾼 것을 모르고, 옛 프로파일의 숫자를 새 것인 척 보여주다가 그 위에
   * 덮어쓴다.
   */
  const prof = useAppSelector(getHeProfile);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const [bkMsg, setBkMsg] = useState<string | null>(null);
  const [bkBusy, setBkBusy] = useState(false);
  const bkInput = useRef<HTMLInputElement>(null);

  /*
   * 선택 버튼 줄의 실제 폭. 스위치 목록이 이 폭을 따른다.
   *
   * 처음 그려질 때와 언어가 바뀔 때 값이 달라지므로 ResizeObserver 로 따라간다.
   * 없으면(구형) 잰 값 없이 기본값으로 둔다 — 어긋날 뿐 깨지지는 않는다.
   */
  /*
   * 값 읽기 명령을 이 보드가 아는가. 한 번 실패하면 이번 연결 동안 안 묻는다.
   * (펌웨어를 새로 구우면 장치가 다시 잡히면서 되살아난다)
   */
  const strokesOk = useRef(true);

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

  /*
   * HID 왕복은 한 줄로 세운다 — 줄 세우기는 he-api 가 앱 전체 몫으로 들고 있다.
   * (상단 프로파일 선택처럼 이 화면 밖에서 말하는 자리가 있다)
   */
  const send = useCallback(
    async (cmd: number, bytes: number[]) => {
      if (!api) throw new Error('no device');
      return heMakeSend(api)(cmd, bytes);
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

      /*
       * 브로드캐스트였으면 **알고 있는 전 키**의 표시값을 맞춰 둔다.
       *
       * ★ 고른 키만 맞추면 안 된다.
       *
       *   선택이 비어 있을 때가 곧 브로드캐스트다 — 그때 고른 키는 하나도 없다.
       *   그 자리에서 고른 키만 돌면 아무것도 안 맞춰지고, 장치는 바뀌었는데
       *   키캡의 숫자는 옛 값으로 남는다.
       */
      if (all) {
        for (const k of Object.keys(keyCfgs)) {
          const i = Number(k);
          done[i] = {...keyCfgs[i], ...patch} as HeKeyCfg;
          if (done[i].releaseUm >= done[i].pressUm && done[i].pressUm > 0) {
            done[i].releaseUm = done[i].pressUm - 1;
          }
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
    heProfGet(send)
      .then((p) => alive && dispatch(setProfile(p)))
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
     *                     칠하기          키캡 글자
     *     설정 갈래        null(선택)      null(각인)
     *     보정 (쉴 때)      안 된 키        보정된 키의 스트로크 mm
     *     보정 (도는 중)    끝난 키         null — 지금은 누르는 일에 집중한다
     *     장치 갈래        []              null
     *
     *   화면이 늘면 여기에 한 줄 더한다.
     */
    if (rail === 'tune') {
      dispatch(setOverlayKeys(null));
      return;                    /* 값은 아래 효과가 따로 맡는다 */
    }
    dispatch(setOverlayKeys([]));
    dispatch(setOverlayText(null));
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

      /*
       * 보정된 키에는 **잰 스트로크를 카운트로** 찍는다.
       *
       * ★ mm 로 찍으면 안 된다 — 전부 같은 값이 나온다.
       *
       *   처음에 travelUm 을 mm 로 바꿔 찍었는데 한 글자도 다르지 않았다.
       *   travelUm 은 스위치 **표의 공칭 행정**이라 같은 스위치면 전 키가 같다
       *   (keys.c 의 keys_switch[type].travel_um).
       *
       *   그리고 펌웨어의 깊이 환산이 `d * travel / stroke` 다. 즉 **mm 는 공칭
       *   행정에 묶여 있다** — 보정된 키는 정의상 전부 3.40mm 다. 키마다 다른 것은
       *   그 3.40mm 를 몇 카운트로 나누느냐이고, 실측 13% 편차가 바로 이 카운트의
       *   편차다. mm 로는 애초에 볼 수 없는 값이다.
       *
       *   안 된 키는 빈칸이 아니라 각인을 그대로 둔다 — 어차피 칠해져 있어 구분이
       *   되고, 전부 숫자로 덮으면 어느 키인지 알 수 없어진다.
       */
      const text: Record<number, string> = {};
      for (const g of layout) {
        const i = g.row * MATRIX_COLS + g.col;
        const c = out[i];
        if (c?.calibrated && c.strokeCnt > 0) {
          text[i] = String(c.strokeCnt);
        }
      }
      dispatch(setOverlayText(text));
    })();
    return () => {
      alive = false;
    };
  }, [api, send, rail, section, cal?.active, layout, dispatch]);

  /*
   * 설정 갈래 — 지금 화면이 **다루는 값**을 키캡에 얹는다.
   *
   * ★ 화면마다 얹는 값이 다르다.
   *
   *   입력지점 화면에서는 입력지점을, RT 화면에서는 해제 거리를 보여야 한다.
   *   한 가지로 고정하면 지금 만지는 값과 키캡의 숫자가 어긋나 오히려 헷갈린다.
   *
   *   스위치 화면은 비운다 — 거기서 정하는 것은 키별 값이 아니라 종류다.
   *
   * 읽기는 없다. 이미 읽어 둔 keyCfgs 에서 뽑을 뿐이라 화면을 옮겨도 공짜다.
   * 슬라이더로 값을 바꾸면 putMany 가 keyCfgs 를 갱신하므로 키캡도 같이 따라간다.
   */
  useEffect(() => {
    if (rail !== 'tune') return;

    const fields = OVERLAY_FIELDS[section];
    if (!fields) {
      dispatch(setOverlayText(null));
      return;
    }

    const text: Record<number, string> = {};
    for (const g of layout) {
      const i = g.row * MATRIX_COLS + g.col;
      const c = keyCfgs[i];
      if (!c) continue;
      /*
       * 값이 둘이면 **줄을 나눈다.**
       *
       * 한 줄에 "1.00/0.50" 으로 붙였더니 1u 키캡 폭에 맞추느라 글자가 7px 까지
       * 줄어 읽히지 않았다. 가로는 더 못 늘리지만 세로는 남아 있다 — 위가 입력,
       * 아래가 해제로 자가 세워진 방향과도 맞는다.
       */
      text[i] = fields
        .map((f) => (((c[f] as number) ?? 0) / 100).toFixed(2))
        .join('\n');
    }
    dispatch(setOverlayText(text));
  }, [rail, section, keyCfgs, layout, dispatch]);

  /*
   * 설정 갈래에서는 라이브 깊이를 **알아서 켠다.**
   *
   * ★ 이 화면의 값은 전부 "얼마나 눌렀을 때" 를 정하는 것이다.
   *
   *   입력지점을 1.5mm 로 놓고도 그게 손끝에서 어디쯤인지 모르면 숫자를 옮겨 볼
   *   근거가 없다. 켜 두면 키캡 막대가 그 자리를 바로 보여준다. 매번 켜는 버튼을
   *   누르게 할 이유가 없다 — 버튼은 끄고 싶을 때를 위해 남겨 둔다.
   *
   * ★ 권한은 묻지 않는다.
   *
   *   처음 한 번은 사용자가 버튼으로 켜서 허락해야 한다. 화면을 열었을 뿐인데
   *   장치 선택 창이 뜨면 놀란다. 한 번 허락하면 그다음부터 저절로 열린다.
   *
   * ★ 장치 갈래에서는 끈다.
   *
   *   거기서는 깊이를 볼 일이 없고, 굽는 동안 스트림이 열려 있으면 장치가
   *   재열거될 때 엉킨다. 보정 갈래에서는 켠 채로 둔다 — 거기도 깊이를 본다.
   */
  const autoTried = useRef(false);

  useEffect(() => {
    if (!api || !device || busy) return;

    if (rail === 'device') {
      if (tracking) stop();
      return;
    }
    if (rail !== 'tune' || tracking || autoTried.current) return;

    autoTried.current = true;
    start(true);
  }, [api, device, rail, tracking, busy]);

  /*
   * 라이브 깊이를 키캡 막대로 보낸다.
   *
   * ★ 단계로 끊어서 보낸다.
   *
   *   깊이는 화면 주사율마다 들어온다. 그대로 흘려보내면 63개 키캡이 초당 60번씩
   *   다시 그려진다 — 키캡 하나가 캔버스 하나라(3D 는 텍스처 업로드까지) 그 값을
   *   치를 이유가 없다.
   *
   *   20단계로 끊으면 **실제로 움직인 키만** 다시 그린다. 가만히 있는 키는 값이
   *   안 바뀌므로 아예 안 그린다. 0.2mm 마다 한 칸이라 눈으로는 연속으로 보인다.
   *
   * 트래킹이 꺼져 있거나 다른 갈래면 막대를 치운다.
   */
  const barsSig = useRef('');

  useEffect(() => {
    const clear = () => {
      if (barsSig.current !== '') {
        barsSig.current = '';
        dispatch(setOverlayBars(null));
        dispatch(setOverlayPressed(null));
        dispatch(setOverlayLive(null));
      }
    };
    if (rail !== 'tune' || !tracking) {
      clear();
      return;
    }

    /* travel 은 아래에서 선언되므로 여기서는 원본을 본다 (같은 값이다) */
    const full = info?.travel ?? 400;
    const bars: Record<number, number> = {};
    for (const g of layout) {
      const i = g.row * MATRIX_COLS + g.col;
      const d = state[i]?.depth ?? 0;
      const q = Math.max(0, Math.min(20, Math.round((d / full) * 20)));
      bars[i] = q / 20;
    }

    /*
     * 입력으로 잡힌 키. 막대와 **같은 프레임에서** 뽑는다 — 따로 돌면 막대가
     * 찬 프레임과 테두리가 켜지는 프레임이 어긋나 깜빡이는 것처럼 보인다.
     */
    const pressed: number[] = [];
    for (const g of layout) {
      const i = g.row * MATRIX_COLS + g.col;
      if (state[i]?.pressed) pressed.push(i);
    }

    /*
     * 키캡 아래 줄.
     *
     * ★ 원시값은 옵션이 켜져 있으면 **늘** 보인다.
     *
     *   센서가 지금 무엇을 보고 있는지 확인하려고 켜는 것이라, 안 누른 키의 값이
     *   오히려 알고 싶은 것이다 — 기준선이 키마다 얼마나 다른지가 거기서 보인다.
     *   눌린 키만 찍으면 켜 놓고도 대부분 빈 화면이다.
     *
     * ★ mm 는 **실제로 움직일 때만** 찍는다.
     *
     *   안 누른 키도 깊이가 딱 0 이 아니다. 잡음이 몇 카운트 떠 있어 0.00 이
     *   붙었다 떨어지기를 반복했다 — 옵션을 꺼 둔 화면에서 온 키캡이 깜빡였다.
     *   잡음 폭(실측 p-p 40 카운트, 0.06mm 쯤)보다 위에서 자른다.
     *
     * ★ mm 는 0.05 단위로 끊는다.
     *
     *   0.01 까지 보이면 끝자리가 쉼 없이 떨려 읽을 수가 없다. 원시값은 끊지
     *   않는다 — 그건 떨림 자체를 보려고 켜는 것이다.
     */
    const MM_MIN = 10;      /* 0.10mm — 잡음 위 */
    const live: Record<number, string> = {};
    for (const g of layout) {
      const i = g.row * MATRIX_COLS + g.col;
      const k = state[i];
      if (!k) continue;
      if (showRaw) {
        live[i] = String(k.raw);
      } else if (k.depth >= MM_MIN) {
        live[i] = ((Math.round(k.depth / 5) * 5) / 100).toFixed(2);
      }
    }

    const sig =
      JSON.stringify(bars) + '|' + pressed.join(',') + '|' + JSON.stringify(live);
    if (sig === barsSig.current) return;
    barsSig.current = sig;
    dispatch(setOverlayBars(bars));
    dispatch(setOverlayPressed(pressed));
    dispatch(setOverlayLive(live));
  }, [state, tracking, rail, layout, info?.travel, showRaw, dispatch]);

  /*
   * 프로파일이 바뀌면 읽어 둔 것을 전부 버린다.
   *
   * ★ 어디서 바뀌든 여기서 받는다.
   *
   *   배지 옆에서 바꿀 수도 있고 이 화면에서 바꿀 수도 있다. 바꾼 자리마다 치우게
   *   하면 한쪽을 빠뜨린다 — 그러면 옛 프로파일의 숫자가 새 것인 척 남고, 그
   *   상태에서 슬라이더를 건드리면 옛 값이 새 프로파일에 써진다.
   */
  useEffect(() => {
    if (!api || prof === null) return;
    setKeyCfgs({});
    let alive = true;
    heGetSettings(send)
      .then((c) => alive && setCfg(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api, send, prof?.active]);

  /*
   * 설정 갈래에 들어오면 전 키 값을 채운다.
   *
   * keyCfgs 는 원래 **고른 키**만 읽어 둔다 — 고치려는 키만 알면 됐기 때문이다.
   * 키캡에 얹으려면 전 키가 필요하다. 이미 있는 키는 건너뛰므로 갈래를 다시
   * 열어도 다시 읽지 않는다.
   */
  useEffect(() => {
    if (!api || rail !== 'tune' || layout.length === 0) return;

    const missing = layout
      .map((g) => g.row * MATRIX_COLS + g.col)
      .filter((i) => !keyCfgs[i]);
    if (missing.length === 0) return;

    let alive = true;
    (async () => {
      const out: Record<number, HeKeyCfg> = {};
      for (const i of missing) {
        try {
          out[i] = await heReadKeyCfg(send, i);
        } catch {
          /* 한 키가 실패해도 나머지는 읽는다 */
        }
        if (!alive) return;
      }
      if (alive && Object.keys(out).length) {
        setKeyCfgs((m) => ({...m, ...out}));
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, send, rail, layout, keyCfgs]);

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
    /*
     * ★ setInterval 이 아니라 **끝나면 다시 거는** 방식이다.
     *
     *   한 회차가 HID 왕복 네 번(상태 1 + 값 3)으로 늘었다. 250ms 안에 못 끝내면
     *   다음 회차가 겹쳐 들어가고, 같은 통로에 요청이 섞이면 응답이 엇갈려
     *   VIA 가 "Receiving incorrect response" 로 잡는다. 끝난 뒤에 거는 방식이면
     *   겹칠 수가 없다.
     */
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const c = await heCalStatus(send);
        if (!alive) return;
        setCal(c);
        dispatch(setOverlayKeys(c.keys));

        /*
         * 누르는 대로 값이 갱신되는 것을 보여준다.
         *
         * ★ 아직 못 잰 키는 빈칸으로 둔다.
         *
         *   0 을 찍으면 "0 카운트로 측정됨" 으로 읽힌다. 저장돼 있던 옛 값을 대신
         *   찍는 것도 안 된다 — 지금 잰 값인 척한다.
         *
         * ★ 이 명령을 모르는 펌웨어가 있다.
         *
         *   값 읽기는 나중에 생긴 명령이라, 그 전 펌웨어가 올라간 보드는 엉뚱한
         *   응답을 준다. VIA 는 그것을 오류로 잡아 로그에 쌓는다 — 250ms 마다
         *   쌓이면 오류 표시가 뜨고 진짜 오류를 못 본다. 한 번 실패하면 이 회차
         *   동안 다시 묻지 않는다. 진행 상황은 상태 명령만으로도 나온다.
         */
        if (strokesOk.current) {
          try {
            const v = await heCalStrokes(send);
            if (!alive) return;
            const text: Record<number, string> = {};
            for (const g of layout) {
              const i = g.row * MATRIX_COLS + g.col;
              if (v[i] > 0) text[i] = String(v[i]);
            }
            dispatch(setOverlayText(text));
          } catch {
            strokesOk.current = false;
          }
        }
      } catch {
        /* 한 회차 실패는 넘어간다 — 다음에 다시 묻는다 */
      }
      if (alive) timer = setTimeout(tick, 250);
    };

    timer = setTimeout(tick, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, send, cal?.active, layout, dispatch]);

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

  /*
   * silent 면 권한을 **묻지 않는다**.
   *
   * 자동으로 켤 때 쓴다. requestDevice() 는 사용자 제스처 안에서만 부를 수 있어
   * 자동 시작에서는 애초에 못 부르고, 부를 수 있다 해도 화면을 열었을 뿐인데
   * 장치 선택 창이 뜨면 놀란다. 이미 허락된 장치면 find() 만으로 열린다.
   */
  const start = async (silent = false) => {
    if (!device || !api) return;
    if (!silent) setErr(null);
    try {
      let hid = await HeTrackChannel.find(device.vendorId, device.productId);
      if (!hid && !silent) {
        /* 권한이 없다 — 이 클릭이 사용자 제스처라 여기서 물어볼 수 있다 */
        hid = await HeTrackChannel.request(device.vendorId, device.productId);
      }
      if (!hid) {
        if (!silent) setErr(t('he.streamDenied'));
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
      if (!silent) setErr(String(e));
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

    if (section === 'profile') {
      const cnt = prof?.count ?? 4;
      const now = prof?.active ?? 0;

      /*
       * ★ 바꾼 뒤에는 읽어 둔 것을 전부 버린다.
       *
       *   프로파일이 바뀌면 전역 설정도 키별 설정도 통째로 다른 값이 된다. 화면이
       *   들고 있던 것을 그대로 두면 옛 프로파일의 숫자가 새 프로파일의 것인 척
       *   남는다 — 그 상태에서 슬라이더를 건드리면 옛 값이 새 프로파일에 써진다.
       */
      /*
       * ★ 되돌릴 수 없으므로 한 번 묻는다.
       *
       *   대상 프로파일에 맞춰 둔 값이 통째로 사라진다. 숫자 버튼 하나가 그런 일을
       *   하는데 아무 말 없이 끝나면, 누른 사람은 무슨 일이 일어났는지도 모른다.
       */
      const copyTo = async (i: number) => {
        const ask = t('Overwrite profile {{n}} with profile {{cur}}?', {
          n: i + 1,
          cur: now + 1,
        });
        if (!window.confirm(ask)) return;

        try {
          dispatch(setProfile(await heProfCopy(send, i)));
          setCopyMsg(t('Copied to profile {{n}}', {n: i + 1}));
        } catch (e) {
          setErr(String(e));
        }
      };

      return (
        <>
          {/*
            * ★ 여기서는 **고르지 않는다.**
            *
            *   고르는 자리는 키보드 이름 옆의 배지다. 프로파일은 어느 탭에 있든
            *   바꿀 수 있어야 하고, 늘 보이는 자리에 이미 있는 것을 화면 안에 또
            *   두면 어느 쪽이 진짜인지 헷갈린다. 여기는 **손대는 일**만 맡는다 —
            *   복사, 그리고 앞으로 이름 붙이기·초기화가 붙을 자리다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.prof')}>{t('Profile')}</Hint>
            </Label>
            <Detail>
              <Summary>
                {now + 1} / {cnt}
              </Summary>
            </Detail>
          </ControlRow>

          {/*
            * 네 벌을 처음부터 손으로 채우면 지겨워서 안 쓴다. 잘 맞춰 둔 한 벌을
            * 복사해 놓고 한두 값만 바꾸는 것이 실제로 쓰는 방식이다.
            */}
          <ControlRow>
            <Label>
              {/*
                * ★ 지금 번호를 이름에 넣는다.
                *
                *   "복사 대상" 만 적어 두었더니 무엇을 어디로 옮기는지가 안 보였다.
                *   같은 1~4 버튼이 두 줄로 놓여 위는 고르기, 아래는 복사라는 것도
                *   구분되지 않았다. 이름에 출처를 넣으면 줄 하나로 읽힌다.
                */}
              <Hint tip={t('he.tip.profCopy')}>
                {t('Copy {{cur}} to', {cur: now + 1})}
              </Hint>
            </Label>
            <Detail>
              {Array.from({length: cnt}, (_, i) => (
                <ProfBtn
                  key={i}
                  $on={false}
                  disabled={i === now}
                  onClick={() => copyTo(i)}
                >
                  {i + 1}
                </ProfBtn>
              ))}
            </Detail>
          </ControlRow>

          {copyMsg && (
            <ControlRow>
              <Label>{t('Result')}</Label>
              <Detail>
                <Summary>{copyMsg}</Summary>
              </Detail>
            </ControlRow>
          )}

          <Note>{t('he.note.prof')}</Note>
        </>
      );
    }

    if (section === 'backup') {
      /*
       * ★ 내보낼 때 장치에서 다시 읽는다.
       *
       *   화면이 들고 있는 값을 쓰면, 이 갈래에 바로 들어온 경우 읽어 둔 것이
       *   없거나 낡았을 수 있다. 파일은 **장치에 실제로 들어 있는 것**이어야 한다.
       */
      const doExport = async () => {
        setBkBusy(true);
        setBkMsg(null);
        try {
          const keys: Record<number, HeKeyCfg> = {};
          for (const g of layout) {
            const i = g.row * MATRIX_COLS + g.col;
            keys[i] = await heReadKeyCfg(send, i);
          }

          const board = fwInfo?.board ?? 'wish60-he';
          const stamp = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const day = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
            stamp.getDate(),
          )}`;

          const blob = new Blob(
            [
              JSON.stringify(
                heMakeBackup(
                  board,
                  fwInfo?.version ?? '',
                  stamp.toISOString(),
                  keys,
                ),
                null,
                2,
              ),
            ],
            {type: 'application/json'},
          );

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${board}-${day}.json`;
          a.click();
          URL.revokeObjectURL(url);

          setBkMsg(`${t('Saved')} — ${Object.keys(keys).length} ${t('keys')}`);
        } catch (e) {
          setBkMsg(String(e));
        }
        setBkBusy(false);
      };

      const doImport = async (file: File) => {
        setBkBusy(true);
        setBkMsg(null);
        try {
          const obj = JSON.parse(await file.text());
          const bad = heCheckBackup(obj, fwInfo?.board ?? '');
          if (bad) {
            setBkMsg(bad);
            setBkBusy(false);
            return;
          }

          /*
           * 파일에 있는 키만 쓴다.
           *
           * 배치가 조금 다른 판(옵션 소켓)에서 만든 파일이라도 겹치는 키는 살린다.
           * 없는 키를 기본값으로 덮으면 사용자가 잃는 쪽이 더 크다.
           */
          let n = 0;
          for (const g of layout) {
            const i = g.row * MATRIX_COLS + g.col;
            const c = obj.keys[i] ?? obj.keys[String(i)];
            if (!c) continue;
            await heWriteKeyCfg(send, i, c as HeKeyCfg);
            n++;
          }

          /* 읽어 둔 것이 낡았다 — 다음 렌더에서 다시 읽는다 */
          setKeyCfgs({});
          heGetSettings(send)
            .then((c) => setCfg(c))
            .catch(() => {});

          setBkMsg(`${t('Applied')} — ${n} ${t('keys')}`);
        } catch (e) {
          setBkMsg(String(e));
        }
        setBkBusy(false);
      };

      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.backup')}>{t('Settings file')}</Hint>
            </Label>
            <Detail>
              <FwBtn disabled={bkBusy} onClick={doExport}>
                {t('he.bk.save')}
              </FwBtn>
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label />
            <Detail>
              <FwBtn
                disabled={bkBusy}
                onClick={(e: React.MouseEvent) => {
                  (e.currentTarget as HTMLElement).blur();
                  setBkMsg(null);
                  bkInput.current?.click();
                }}
              >
                {t('he.bk.load')}
              </FwBtn>
              <input
                ref={bkInput}
                type="file"
                accept=".json,application/json"
                style={{display: 'none'}}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) doImport(f);
                }}
              />
            </Detail>
          </ControlRow>

          {bkMsg && (
            <ControlRow>
              <Label>{t('Result')}</Label>
              <Detail>
                <Summary>{bkMsg}</Summary>
              </Detail>
            </ControlRow>
          )}

          <Note>{t('he.note.backup')}</Note>
        </>
      );
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
            * 저장돼 있는 보정을 요약한다.
            *
            * ★ 흩어진 정도가 여기서 처음 숫자로 보인다.
            *
            *   키캡의 값은 하나씩 읽어야 하지만 최소~최대는 한눈에 들어온다.
            *   이 폭이 곧 보정을 안 했을 때 나는 오차다 — 그게 보정을 하는 이유다.
            *
            *   단위는 카운트다. mm 는 공칭 행정에 묶여 있어(keys.c 의 깊이 환산)
            *   보정된 키가 전부 같은 mm 로 나온다 — 편차는 카운트로만 보인다.
            */}
          {!active && calAll && (
            <ControlRow>
              <Label>
                <Hint tip={t('he.tip.calDone')}>{t('Calibrated')}</Hint>
              </Label>
              <Detail>
                <Summary>
                  {(() => {
                    const cnt = layout
                      .map((g) => calAll[g.row * MATRIX_COLS + g.col])
                      .filter((c) => c?.calibrated && c.strokeCnt > 0)
                      .map((c) => c.strokeCnt);
                    if (cnt.length === 0) return `0 / ${layout.length}`;
                    const lo = Math.min(...cnt);
                    const hi = Math.max(...cnt);
                    /* 폭을 최소값 기준 %로 — "13% 흩어져 있다" 가 바로 읽힌다 */
                    const spread = Math.round(((hi - lo) / lo) * 100);
                    /* 단위를 적는다 — mm 로 오해할 자리다 */
                    return `${cnt.length} / ${layout.length}  ·  ${lo} ~ ${hi} ADC  (${spread}%)`;
                  })()}
                </Summary>
              </Detail>
            </ControlRow>
          )}

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
                  'Optional. Without it the nominal switch travel is used; with it each key is measured, so the mm values are accurate. Calibrated keys show their measured stroke in mm; the rest are painted on the board above.',
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
            * 입력지점과 해제지점을 **한 자에** 잡는다.
            *
            * 키가 위에서 아래로 내려가므로 눈금도 그 방향이어야 읽힌다. 그리고 옆에
            * 실제 깊이를 세워 두면 "1.00mm 가 내 손가락으로 어느 정도인가"를 눌러서
            * 바로 안다 — 숫자로는 알 수 없는 것이다.
            *
            * ★ 해제지점을 가로 슬라이더로 따로 두지 않는다.
            *
            *   둘은 같은 축 위의 두 점이고 사이 거리가 곧 이력이다. 따로 두면 그
            *   거리가 안 보이고, "해제는 입력보다 얕아야 한다"는 제약조차 화면에서
            *   읽히지 않았다 — 넘겨 보고 나서야 펌웨어가 잘라 준다는 걸 알았다.
            *   한 자에 올리면 두 손잡이 사이가 그대로 그 거리이고, 순서도 눈으로
            *   지켜진다.
            */}
          <ControlRow>
            {/*
              * ★ 얕은 것이 위다 — 자와 같은 순서로.
              *
              *   같은 두 값이 자에서는 해제가 위, 이름과 키캡에서는 입력이 위로
              *   나왔다. 볼 때마다 머릿속에서 뒤집어야 한다.
              *
              *   기준은 자다. 이 화면의 전제가 "자가 사실이고 숫자는 거기서 읽는
              *   것" 이고, 자의 순서는 고를 수 있는 것이 아니다 — 해제는 입력보다
              *   얕아야 하므로 물리적으로 위에 있을 수밖에 없다. 고를 수 있는 쪽을
              *   고정된 쪽에 맞춘다.
              */}
            <Label>
              <Hint tip={t('he.tip.release')}>{t('Release Point')}</Hint>
              <SecondLabel>
                <Hint tip={t('he.tip.press')}>{t('Press Point')}</Hint>
              </SecondLabel>
            </Label>
            <Detail>
              <DepthSlider
                value={num('pressUm', cfg?.pressUm ?? 100) ?? 100}
                travelUm={travel}
                /*
                 * 눈금은 온전한 mm 로 끝나게 올려 잡는다.
                 *
                 * 전 행정이 3.4 라 눈금이 3.4 에서 끊기면 읽기 나쁘고, 키가 공칭보다
                 * 깊이 들어가는 것도 꼭대기에 붙어 안 보인다. 잡히는 범위는 그대로
                 * 전 행정까지다 — 슬라이더가 알아서 자른다.
                 */
                scaleUm={Math.max(400, Math.ceil(travel / 100) * 100)}
                depthUm={tracking ? deepest.um : null}
                pressed={deepest.pressed}
                showValues
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, pressUm: v} : c));
                  put('pressUm', v).catch(() => {});
                }}
                value2={num('releaseUm', cfg?.releaseUm ?? 50) ?? 50}
                onChange2={(v: number) => {
                  setCfg((c) => (c ? {...c, releaseUm: v} : c));
                  put('releaseUm', v).catch(() => {});
                }}
              />
            </Detail>
          </ControlRow>

          {/*
            * 키캡 아래 값은 늘 mm 다. 이 스위치를 켜면 원시 ADC 값으로 바뀐다.
            *
            * ★ 자리를 나누지 않고 **같은 자리에서 바꾼다.**
            *
            *   둘을 같이 찍으면 키캡 아래에 숫자가 두 개 붙어 어느 것이 무엇인지
            *   다시 설명해야 한다. 원시값을 볼 때는 mm 가 궁금하지 않다 — 센서가
            *   무엇을 보고 있는지 확인하려고 켜는 것이다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.raw')}>{t('Show raw ADC')}</Hint>
            </Label>
            <Detail>
              <AccentSlider isChecked={showRaw} onChange={setShowRaw} />
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
                  /*
                   * 키캡의 전 행정은 장치가 주는 값이라 여기서 못 고친다.
                   *
                   * 종류를 바꾸면 그 값도 바뀌므로 읽어 둔 것을 버린다 — 다음
                   * 렌더에서 전 키를 다시 읽어 채운다. 손으로 맞춰 넣으면 장치가
                   * 실제로 무엇을 쓰는지와 갈라진다.
                   */
                  heSetSwitch(send, v)
                    .then(() => setKeyCfgs({}))
                    .catch(() => {});
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
              * ★ 키와 무관한 화면에서는 감춘다.
              *
              *   보정은 언제나 전 키가 대상이고, 펌웨어 굽기는 키와 무관하며,
              *   프로파일은 **보드 전체**의 상태다. 남겨 두면 "프로파일도 고른
              *   키만 바뀌나" 로 읽힌다 — 실제로 그렇게 읽혔다.
              */}
            {rail === 'tune' && section !== 'profile' && (
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
