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
  getConnectedDevices,
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {ConfigureBasePane} from './pane';
import {
  Grid,
  MenuCell,
  CenteredOverflowCell,
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
  faStethoscope,
  faCircleInfo,
  faSliders,
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
import {badgeColor} from 'src/utils/color-math';
import {DepthSlider} from './he-depth';
import TextInput from 'src/components/inputs/text-input';
import {NumberInput} from './configure-panes/submenus/macros/keycode-sequence-components';
import {HeGraph} from './he-graph';
import {heMakeCurve, heCurveToMm} from 'src/utils/he-curve';
import type {KeyboardAPI} from 'src/utils/keyboard-api';
import {ProfileSelect} from 'src/components/menus/profile-select';
import {loadKeymapFromDevice} from 'src/store/keymapSlice';
import {Badge} from './configure-panes/badge';
import {
  fwBoards,
  fwFetch,
  fwList,
  iapEnterBoot,
  iapFlash,
  iapRequest,
  iapSpecOf,
  type FwBoard,
  type FwEntry,
  type IapProgress,
} from 'src/utils/he-iap';
import {
  clearKeys,
  getHeSelectedKeys,
  getHeBootloaderSeen,
  getHeHoverKey,
  setHoverKey,
  setOverlayKeys,
  setOverlayBadge,
  setOverlayText,
  setOverlayBars,
  setOverlayPressed,
  setOverlayLive,
  setFlashing,
  setProfile,
  getHeProfile,
  setKeys,
} from 'src/store/heSlice';
import {useAppDispatch} from 'src/store/hooks';
import {
  reloadConnectedDevices,
  selectConnectedDeviceByPath,
} from 'src/store/devicesThunks';
import {useBootConnect} from './he-boot-connect';
import {
  heReadSwitches,
  heSwCustomAll,
  heSwCustomSet,
  heSwBadgeColor,
  heSwIsCustom,
  heSwSlotOf,
  heSwTypeOf,
  heReadInfo,
  heCalStart,
  heCalStatus,
  heCalStrokes,
  heCalSave,
  heCalCancel,
  type HeCalState,
  type HeSwitchTable,
  type HeSwCustom,
  HeKeyGeo,
  HeKeyState,
  HeProf,
  HeStat,
  HeHwInfo,
  HeTrackChannel,
  HeTrackInfo,
  heReadLayout,
  heSetTracking,
  heReadKeyCfg,
  heWriteKeyCfg,
  heCheckBackup,
  heReadStat,
  heReadHwInfo,
  heLock,
  heReadBackup,
  heWriteBackup,
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
  /* 자주 만지는 것부터. 스위치는 한 번 정하면 끝이라 뒤에 둔다. */
  {rail: 'tune', key: 'actuation', label: 'PRESS POINT', icon: faArrowDownUpAcrossLine},
  {rail: 'tune', key: 'rapid', label: 'RAPID TRIGGER', icon: faBolt},
  {rail: 'tune', key: 'deadzone', label: 'DEAD ZONE', icon: faCircleHalfStroke},

  /*
   * ★ 보정은 갈래가 다르다.
   *
   *   위엣것들은 **취향을 정하는** 설정이라 자주 만지고 값이 바로 반영된다.
   *   보정은 **장치를 재는** 일이라 한 번 하고 잊는다. 성격이 다른 것을 같은
   *   목록에 두면 "이것도 매번 만져야 하나" 로 읽힌다.
   *
   *   그리고 보정은 하나가 아니다 — 바닥값(지금)에 이어 비선형 보정이 온다.
   */
  {rail: 'switch', key: 'switch', label: 'SELECT', icon: faToggleOn},

  /*
   * 표에 없는 스위치를 사용자가 정의하는 자리.
   *
   * ★ SELECT 와 하는 일이 다르다. 여기는 **스위치의 제원**을 정하고, SELECT 는
   *   그 제원을 어느 키에 얹을지 정한다. 예전에 행정 슬라이더가 SELECT 에 붙어
   *   있었더니 "이 슬라이더가 무엇을 바꾸나" 가 매번 헷갈렸다.
   */
  {rail: 'switch', key: 'swcustom', label: 'CUSTOM', icon: faSliders},

  {rail: 'cal', key: 'calibrate', label: 'BOTTOM-OUT', icon: faRulerVertical},

  /*
   * 장치 자체를 다루는 것들. 프로파일·내보내기도 앞으로 여기 붙는다.
   *
   * ★ 이름을 "Settings" 로 하지 않았다. VIA 에 이미 전역 Settings 탭이 있어
   *   같은 말을 두 군데 쓰면 어느 쪽인지 헷갈린다.
   */
  {rail: 'device', key: 'firmware', label: 'FIRMWARE', icon: faMicrochip},

  /*
   * ★ 프로파일은 설정이 아니라 **장치의 상태**다.
   *
   *   처음에는 설정 갈래 맨 위에 뒀다. "아래 화면들이 어느 프로파일 안의 값인지"
   *   를 먼저 보여야 한다고 봤는데, 고르는 자리가 키보드 이름 옆으로 올라가면서
   *   그 몫이 사라졌다. 여기 남은 것은 복사·이름 같은 **손보는 일**이라, 펌웨어나
   *   백업과 같은 부류다.
   */
  {rail: 'device', key: 'profile', label: 'PROFILE', icon: faLayerGroup},
  {rail: 'device', key: 'backup', label: 'BACKUP', icon: faFileArrowDown},

  /*
   * ★ 진단은 설정이 아니다.
   *
   *   여기 있는 값은 고칠 수 있는 것이 아니라 **재는 것**이다. 설정 갈래에 두면
   *   "이것도 만져야 하나" 로 읽힌다. 펌웨어·백업과 같은 부류다 — 장치 자체를
   *   다루는 자리.
   */
  {rail: 'device', key: 'debug', label: 'DEBUG', icon: faStethoscope},

  /*
   * 맨 끝이다. 여기 값은 **안 바뀌는 것**이라 한 번 보고 잊는다 — 자주 여는 것을
   * 앞에 두는 순서를 지킨다.
   */
  {rail: 'device', key: 'info', label: 'INFO', icon: faCircleInfo},
] as const;

/*
 * 아이콘 레일은 큰 갈래를, 가운데 열은 그 안의 항목을 고른다.
 */
const RAILS = [
  {key: 'tune', title: 'Hall Effect', icon: faWaveSquare},
  {key: 'cal', title: 'Calibration', icon: faRulerVertical},
  /*
   * ★ 스위치가 갈래를 갖는다.
   *
   *   설정 갈래에 한 줄로 있던 것을 뺐다. 스위치를 고르는 것은 "취향" 이 아니라
   *   **이 보드에 무엇이 꽂혀 있나** 를 알려주는 일이고, 그 답이 아래 모든 mm 값의
   *   기준이 된다. 그리고 곧 곡선·커스텀 프로파일이 붙을 자리라 한 줄로는 좁다.
   *
   *   보정 다음에 둔다 — 보정과 스위치가 둘 다 "이 하드웨어가 무엇인가" 를 정하는
   *   일이라 나란히 있는 편이 읽힌다. 장치(펌웨어·백업)는 그 뒤다.
   */
  {key: 'switch', title: 'Switch', icon: faToggleOn},
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
/*
 * ★ 일반형에는 행정을 안 적는다.
 *
 *   제품은 행정이 제원이라 목록에 적어 두면 고를 때 도움이 된다. 그런데 일반형은
 *   사용자가 슬라이더로 정하는 값이라, 목록의 숫자와 실제 값이 달라진다 —
 *   "GENERIC (4.0 mm)" 라고 적혀 있는데 실제로는 3.4mm 인 상황이 생긴다.
 *
 *   고칠 수 있는 값을 두 군데에 보여주면 반드시 한쪽이 거짓말을 한다. 바로 아래
 *   전 행정 줄이 진짜 값을 들고 있으므로 목록에서는 뺀다.
 */
/*
 * ★ 커스텀 슬롯은 늘 넷 다 보인다.
 *
 *   비어 있어도 "CUSTOM 1" 로 자리를 지킨다. 안 보이면 사용자가 그런 것이 있는지
 *   모르고, 보이면 골랐다가 CUSTOM 탭으로 가면 된다.
 *
 *   이름을 붙였으면 이름을 같이 적는다 — 슬롯 번호만으로는 무엇을 넣었는지 기억이
 *   안 난다.
 */
const swCustomLabel = (slot: number, c: HeSwCustom | undefined) =>
  c && c.name ? `CUSTOM ${slot + 1} — ${c.name}` : `CUSTOM ${slot + 1}`;

const switchOptions = (
  tbl: HeSwitchTable | null,
  cust: HeSwCustom[],
) => [
  /*
   * ★ 커스텀이 **앞**이다.
   *
   *   내장 표는 우리가 아는 스위치이고, 커스텀은 사용자가 자기 보드를 보고 넣은
   *   것이다. 자기가 넣은 것을 목록 바닥에서 찾게 할 이유가 없다.
   */
  ...cust.map((c, slot) => ({
    label: swCustomLabel(slot, c),
    value: heSwTypeOf(slot),
  })),
  ...(tbl?.list ?? []).map((s, value) => ({
    label: `${s.name}  (${(s.travelUm / 100).toFixed(1)} mm)`,
    value,
  })),
];

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
/*
 * 숫자를 직접 치는 칸. 자속은 0~2000 Gs 범위라 슬라이더로는 못 맞춘다 —
 * 데이터시트를 보고 옮겨 적는 값이라 타이핑이 맞다.
 */
/* 키캡 배지와 같은 색을 이름 옆에 찍는다 — 색과 이름을 이어 주는 유일한 자리다 */
/*
 * 자 옆의 "지금" 줄. 눌리면 색이 선다 — 숫자만으로는 판정 여부가 안 보인다.
 */

const SwDot = styled.span<{$c: string}>`
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  margin-right: 8px;
  vertical-align: middle;
  background: ${(p) => p.$c};
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
`;

const NumBox = styled(NumberInput)`
  width: 72px;
  color: var(--color_label_highlighted);
`;

const TextBox = styled(TextInput)`
  width: 200px;
  margin-bottom: 0;
`;

const fmtMm = (v: number | null) =>
  v === null ? '—' : `${(v / 100).toFixed(2)} mm`;

/* 이 항목을 바꾸면 장치가 계산하는 값(travelUm·strokeCnt)도 따라 바뀐다 */
const REFRESH_KEYS: (keyof HeKeyCfg)[] = ['switchType'];

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
/*
 * 굽는 동안의 상태 한 줄.
 *
 * ★ 폭을 잡아 둔다.
 *
 *   퍼센트가 "9%" 에서 "10%" 로 갈 때 글자 수가 늘면서 줄 전체가 좌우로 흔들렸다.
 *   이 자리는 오른끝에 붙어 있어서 늘어난 만큼 왼쪽으로 밀린다.
 *
 *   숫자 폭을 고정(tabular-nums)하고 칸을 넉넉히 잡아 오른쪽으로 정렬한다 —
 *   자릿수가 바뀌어도 오른끝이 안 움직인다. 다른 문구("부트로더로 넘어가는 중")가
 *   들어올 자리라 min-width 로 바닥만 준다.
 */
const FwStat = styled.span`
  margin-left: 12px;
  white-space: nowrap;
  display: inline-block;
  min-width: 64px;
  text-align: right;
  font-variant-numeric: tabular-nums;
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

/*
 * 안 눌림으로 볼 문턱 (0.01mm).
 *
 * ★ 안 누른 키도 깊이가 딱 0 이 아니다.
 *
 *   잡음이 몇 카운트 떠 있어 0 과 1~2 를 오간다. 그대로 "눌렸나" 로 쓰면 키캡 숫자도
 *   그래프의 점도 깜빡인다 — 실제로 둘 다 그랬다.
 *
 * ★ **자르는 일은 장치가 한다.** 여기는 0 인지만 본다.
 *
 *   한동안 여기서 0.10mm 로 잘랐는데 자리가 틀렸다. 장치의 데드존이 이미 "쉬는 위치
 *   근처는 안 본다" 를 정하고 있고, 판정도 그걸 따른다. 화면이 따로 자르면 **둘이
 *   다른 것을 말하게 된다** — 장치는 눌렸다는데 화면은 안 그리는 일이 생긴다.
 *
 *   장치가 데드존 아래를 0 으로 주기 시작한 뒤로(R28) 여기서 할 일은 "0 이 아닌가"
 *   뿐이다. 데드존을 0 으로 두고 잡음까지 보겠다는 것도 사용자의 선택이라, 그때
 *   화면이 임의로 가리면 안 된다.
 */
const HE_MM_MIN = 1;

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

/*
 * 릴리즈 노트 — 네 줄까지만 보이고 나머지는 스크롤한다.
 *
 *   일곱 줄짜리가 오자 펌웨어 화면을 통째로 잡아먹었다. 노트는 "무엇이 바뀌는지"를
 *   훑는 것이지 정독하는 것이 아니고, 그 아래의 **굽기 버튼이 화면 밖으로 밀려나는**
 *   쪽이 훨씬 나쁘다.
 *
 * ★ 높이를 px 로 박지 않는다.
 *
 *   Note 의 line-height 가 1.6 이라 한 줄이 곧 1.6em 이다. 6.4em 은 정확히 네 줄이고,
 *   글자 크기를 바꾸면 같이 따라온다. px 로 박으면 그때 조용히 어긋난다.
 *
 * ★ 끝에서 바깥으로 넘기지 않는다.
 *
 *   overscroll-behavior 가 없으면 노트를 다 내린 순간 스크롤이 패널로 넘어가 화면이
 *   통째로 따라 움직인다. 노트를 읽으려던 것뿐인데 자리가 바뀐다.
 *
 * ★ 오른쪽 여백은 스크롤 막대 자리다. 막대가 글자를 덮는 환경이 있다.
 *   이 저장소에는 box-sizing 전역 설정이 없어 (ControlRow 도 제 자리에서 켠다)
 *   여기서도 켜 준다 — 안 켜면 width:100% 에 여백이 더해져 8px 넘친다.
 */
const ReleaseNotes = styled(Note)`
  box-sizing: border-box;
  max-height: 6.4em;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 8px;
`;

export const HePane: React.FC = () => {
  const {t} = useTranslation();
  const device = useAppSelector(getSelectedConnectedDevice);
  const api = useAppSelector(getSelectedKeyboardAPI);

  /*
   * ★ 굽는 중에는 여기서 화면을 옮기지 않는다.
   *
   *   busy 를 이 자리에서 선언하는 이유가 그것이다 (원래는 fw 상태들과 같이
   *   아래에 있었다). 아래 bootOnly 가 busy 를 봐야 하고, rail/section 의
   *   useState 초기값이 다시 bootOnly 를 본다.
   */
  const [busy, setBusy] = useState(false);
  const bootSeen = useAppSelector(getHeBootloaderSeen);

  /*
   * 부트로더만 물려 있으면 **펌웨어 화면에서 시작한다.**
   *
   * 그 상태에서 할 수 있는 일이 굽는 것 하나뿐이다. 입력지점 화면을 열어 두면
   * "값이 왜 안 뜨나" 가 되므로, 시작 자리도 고르는 자리도 거기 하나로 좁힌다.
   *
   * ★ 굽는 동안(busy)에는 거짓으로 둔다.
   *
   *   굽기는 앱 -> 부트로더 -> 앱 이라 그 사이 api 가 잠깐 없다. 그때 갈래를
   *   접으면 굽기가 끝나고도 그 화면에 갇힌다 — 실제로 그랬다. 굽는 중 화면은
   *   이미 busy 로 붙잡고 있으니(아래 "장치 없음" 벽) 여기까지 접을 이유가 없다.
   */
  const bootOnly = bootSeen && !api && !busy;

  const [rail, setRail] = useState<RailKey>(bootOnly ? 'device' : 'tune');
  const [section, setSection] = useState<SectionKey>(
    bootOnly ? 'firmware' : 'actuation',
  );
  const [layout, setLayout] = useState<HeKeyGeo[]>([]);
  const [info, setInfo] = useState<HeTrackInfo | null>(null);
  const [state, setState] = useState<HeKeyState[]>([]);
  const [tracking, setTracking] = useState(false);
  /*
   * ★ **키를 만지는 갈래인가.** 흩어진 rail 조건을 여기 하나로 모은다.
   *
   *   스위치를 별도 갈래로 빼면서 `rail === 'tune'` 을 보는 자리를 네 군데 빠뜨렸다 —
   *   선택 표시, 선택 줄, 키별 설정 읽기, 키캡 값 표시. 네 번에 나눠 발견됐다.
   *
   *   조건이 흩어져 있으면 갈래를 늘릴 때마다 같은 일이 반복된다. 뜻으로 이름을
   *   붙여 두면 다음에는 이 한 줄만 고치면 된다.
   *
   *   기준은 "그 화면이 **키별 값**을 다루나" 다. 설정 갈래는 입력지점·RT·데드존이,
   *   스위치 갈래는 종류·전 행정이 전부 키별이다. 보정과 장치 갈래는 아니다.
   */
  const keyRail = rail === 'tune' || rail === 'switch';

  /*
   * ★ 프로파일 전역값(HeSettings)은 이 화면이 더 이상 들고 있지 않다.
   *
   *   그건 "고른 키가 없을 때 보여줄 값" 이었다. 이제 고른 키가 없으면 보여줄 값도
   *   없으므로, 읽어 봐야 아무도 안 읽는 상태만 남는다. 게다가 슬라이더를 끌 때마다
   *   낙관적으로 그 상태를 갱신하고 있어서, 화면 전체가 스텝마다 한 번 더 그려졌다.
   *
   *   화면의 값은 전부 keyCfgs(키별) 에서 나온다 — 출처가 하나다.
   */
  const [switches, setSwitches] = useState<HeSwitchTable | null>(null);
  /* 커스텀 슬롯 정의 — 장치가 준다. 목록과 SELECT 표시가 같이 본다 */
  const [swCust, setSwCust] = useState<HeSwCustom[]>([]);
  const [cal, setCal] = useState<HeCalState | null>(null);
  /* 보정 화면에서 읽는 전 키 상태 — 어느 키가 이미 보정됐나 */
  const [calAll, setCalAll] = useState<HeKeyCfg[] | null>(null);
  const [fw, setFw] = useState<IapProgress | null>(null);
  const [fwErr, setFwErr] = useState<string | null>(null);
  const [fwList_, setFwList] = useState<FwEntry[] | null>(null);
  const [fwPick, setFwPick] = useState(0);
  /*
   * 어느 보드의 배포본을 볼 것인가.
   *
   * ★ 앱 모드에서는 물을 일이 없다 — 장치가 0xCA 로 자기 이름을 말한다. 아래
   *   effect 가 그걸로 골라 준다.
   *
   * ★ 부트로더에서는 **반드시 물어야 한다.** 벤더 IAP 라 VID/PID 가 보드와 무관하게
   *   늘 534B:4102 이고 이름을 물을 명령도 없다. 짐작으로 고르면 다른 보드의
   *   이미지를 굽게 된다.
   */
  const [fwBoards_, setFwBoards] = useState<FwBoard[] | null>(null);
  const [fwBoard, setFwBoard] = useState<FwBoard | null>(null);
  const [fwInfo, setFwInfo] = useState<{board: string; version: string} | null>(
    null,
  );
  const fwInput = useRef<HTMLInputElement>(null);

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
   * 백업 대상. -1 = 모든 프로파일, 0.. = 그 번호 하나.
   *
   * 저장과 불러오기가 같은 값을 본다. "1번만 저장" 해 놓고 "모두 불러오기" 를 하면
   * 뜻이 어긋나므로, 한 줄에서 정하고 두 버튼이 그것을 따른다.
   */
  const [bkScope, setBkScope] = useState(-1);

  /* 진단 통계 — 화면이 열려 있는 동안만 주기로 읽는다 */
  const [stat, setStat] = useState<HeStat | null>(null);

  /* 제원 — 안 바뀌는 값이라 한 번만 읽는다 */
  const [hw, setHw] = useState<HeHwInfo | null>(null);

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
    /*
     * ★ 그룹이 아니라 **버튼의 양 끝**을 잰다.
     *
     *   그룹 폭에는 첫 버튼의 margin-left 가 들어간다. 그 값을 그대로 쓰면 목록이
     *   왼쪽으로 그만큼 더 길어져 위 버튼 줄과 왼쪽 끝이 안 맞는다.
     *
     *   첫 버튼의 왼쪽부터 마지막 버튼의 오른쪽까지가 눈에 보이는 폭이다. 여백이
     *   바뀌어도 따라가므로 숫자를 빼는 방식보다 안전하다.
     */
    const ro = new ResizeObserver(() => {
      const first = el.firstElementChild;
      const last = el.lastElementChild;
      const w =
        first && last
          ? Math.round(
              last.getBoundingClientRect().right -
                first.getBoundingClientRect().left,
            )
          : Math.round(el.getBoundingClientRect().width);
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

  /* 부트로더 권한이 아직 없을 때 쓰는 길 — "장치 없음" 벽에 놓는다 */
  const bootConnect = useBootConnect();

  /*
   * 굽는 동안 "앱이 돌아왔나" 를 보는 창.
   *
   * 굽기 함수는 누른 순간의 값을 붙잡은 클로저라 그 안의 `api` 는 영영 굽기 전
   * 것이다. ref 로 지금 값을 들여다본다.
   */
  /*
   * 굽고 나서 **방금 구운 보드로 돌아오기** 위해 최신 목록을 들고 있는다.
   * 반복문 안에서 셀렉터를 다시 읽을 수 없으므로 ref 로 받는다.
   */
  const connected = useAppSelector(getConnectedDevices);
  const connectedRef = useRef(connected);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  /*
   * busy 를 ref 로도 든다. 위 effect 의 의존성에 busy 를 넣으면 **굽기가 끝나는
   * 순간에도 한 번 더 돌아** 방금 되돌린 선택을 다시 지운다. 읽기만 필요하다.
   */
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  /*
   * 보드 목록은 **장치와 무관하게** 읽는다.
   *
   * 부트로더로 붙었을 때가 이 목록이 가장 필요한 순간인데, 그때는 api 가 없다.
   * 예전에는 배포 목록을 api 가 있는 effect 안에서 읽어서, 정작 굽기만 할 수 있는
   * 상태에서 목록이 비어 있었다.
   */
  useEffect(() => {
    let alive = true;
    fwBoards()
      .then((b) => alive && setFwBoards(b))
      .catch(() => alive && setFwBoards([])); /* 목록이 없어도 파일로 굽는 길은 남는다 */
    return () => {
      alive = false;
    };
  }, []);

  const fwAuto = useRef<string | null>(null);

  /*
   * ★ **장치가 바뀌면 옛 정보를 버린다.**
   *
   *   두 보드를 같이 꽂아 두고 쓰는 자리다. 고른 키보드를 바꾸면 새 정보를 읽지만
   *   그게 도착하기 전까지는 **이전 보드의 이름이 그대로 남는다.** 그 값이 자동
   *   선택과 불일치 잠금을 굴리므로, 그 창 동안에는 "다른 보드를 고른 채 굽기가
   *   열려 있는" 상태가 만들어진다.
   *
   *   비워 두면 그동안 잠기는 쪽으로 기운다 — 굽기는 되돌리기 어려운 일이라
   *   모르는 동안은 막는 편이 맞다.
   *
   * ★ **굽는 중에는 그대로 둔다.** 그때는 대상이 부트로더로 사라져서 VIA 가 남은
   *   다른 보드를 고르는데, 그걸 따라가면 **wish61 을 굽는 중에 화면이 wish60 을
   *   가리킨다.** 굽고 나면 아래 반복문이 원래 보드로 되돌리므로, 그 사이에는
   *   손대지 않는 편이 맞다.
   */
  useEffect(() => {
    if (busyRef.current) return; /* 굽는 중 — 아래 주석 */
    setFwInfo(null);
    fwAuto.current = null;
  }, [device?.path]);

  /*
   * 장치가 자기 이름을 말했으면 그걸로 고른다 — 앱 모드에서는 물을 이유가 없다.
   *
   * ★ **장치가 바뀌면 다시 맞춘다.** 처음 한 번만 맞추면 안 된다.
   *
   *   예전에는 `fwBoard` 가 이미 있으면 그냥 돌아섰다. 그래서 wish60 을 붙였다가
   *   wish61 로 갈아 끼우면 **옛 선택이 그대로 남아** 빨간 불일치 경고만 뜬 채로
   *   있었다. 보드가 둘이 되고 나서야 드러난 자리다.
   *
   * ★ 그렇다고 매번 덮어쓰지도 않는다. 사람이 일부러 다른 보드를 고르는 길은
   *   남아 있어야 한다 (부트로더에 멈춘 보드를 되살릴 때 그 길로 간다). 그래서
   *   **"이 장치 이름에 맞춰 둔 적이 있는가" 를 기억**하고, 이름이 바뀐 순간에만
   *   따라간다.
   */
  useEffect(() => {
    const name = fwInfo?.board;
    if (busy) return; /* 굽는 중 — 아래 주석 */
    if (!fwBoards_ || !name || fwAuto.current === name) return;
    const hit = fwBoards_.find((b) => b.id === name);
    if (!hit) return;
    fwAuto.current = name;
    setFwBoard(hit);
  }, [fwBoards_, fwInfo?.board]);

  /*
   * 고른 보드의 배포 목록.
   *
   * ★ **바꾸는 즉시 비운다.** 새 목록이 도착할 때까지 옛 보드의 배포본이 화면에
   *   남아 있으면, 고른 보드와 눈앞의 버전 목록이 어긋난 창이 생긴다.
   */
  useEffect(() => {
    setFwList(null);
    if (!fwBoard) return;
    let alive = true;
    setFwPick(0);
    fwList(fwBoard.dir)
      .then((l) => alive && setFwList(l))
      .catch(() => alive && setFwList([]));
    return () => {
      alive = false;
    };
  }, [fwBoard]);

  /*
   * 부트로더로 넘어가면 **펌웨어 화면으로 옮긴다.**
   *
   * ★ useState 초기값만으로는 부족하다.
   *
   *   그건 이 화면을 **처음 그릴 때** 한 번만 본다. 그런데 흔한 쪽은 반대다 —
   *   HE 탭을 열어 둔 채 "Bootloader → Run" 을 눌러 넘어가는 것. 그때는 초기값이
   *   이미 지났으므로 아무도 안 옮겨 주고, 갈래만 하나로 접힌 채 내용은 다른
   *   화면이 남는다.
   *
   *   되돌리지는 않는다. 앱이 돌아오면 갈래가 다시 다 열리고, 그때 어디를 볼지는
   *   사용자가 정할 일이다.
   */
  useEffect(() => {
    if (bootOnly) {
      setRail('device');
      setSection('firmware');
    }
  }, [bootOnly]);


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
  const hoverKey = useAppSelector(getHeHoverKey);

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

  /* 키별 설정 — 화면의 모든 값이 여기서 나온다 */
  const [keyCfgs, setKeyCfgs] = useState<Record<number, HeKeyCfg>>({});

  /*
   * ★ **장치가 바뀌면 키별 캐시를 버린다.**
   *
   *   아래 읽기 effect 는 "캐시에 없는 키만" 읽는다. 그게 클릭마다 왕복이 없게
   *   해 주지만, 보드를 갈아 끼웠을 때는 **한 번도 안 읽는 결과**가 된다 —
   *   화면에는 이전 보드의 입력지점이 남고, 만져도 앞뒤가 안 맞는다. 창을
   *   새로고침해야 낫던 것이 이것이다.
   *
   *   layout·hw·switches 처럼 매번 통째로 덮어쓰는 것들은 스스로 낫는다.
   *   여기서 버릴 것은 **부분 갱신하는 것**뿐이다.
   *
   *   고른 키도 같이 버린다 — 키 번호는 보드마다 뜻이 다르다.
   *
   *   굽는 중이라고 예외를 두지 않는다. 캐시는 굽고 나면 어차피 다시 읽어야 한다.
   */
  useEffect(() => {
    setKeyCfgs({});
    setCalAll(null);
    dispatch(clearKeys());
  }, [device?.path, dispatch]);

  /*
   * 고른 키의 값은 반드시 갖고 있게 한다.
   *
   * ★ **덮어쓰지 않고 더한다.**
   *
   *   예전에는 고른 키만 읽어서 setKeyCfgs(out) 으로 통째로 갈아 끼웠다. 그러면 키를
   *   하나 고르는 순간 나머지 62개의 값이 캐시에서 사라진다 —
   *
   *     1. 키캡에서 숫자가 한꺼번에 없어진다 (= 온 판이 깜빡인다)
   *     2. 미리읽기가 62개를 하나씩 HID 로 다시 읽어 채운다
   *     3. 그 사이에 또 고르면 처음부터 되풀이된다
   *
   *   "키를 개별 선택할 때도 전체 키가 깜빡인다" 가 이것이었다. 고른 키를 알고
   *   싶었을 뿐인데 알고 있던 것까지 버렸다.
   *
   * ★ 이미 아는 키는 다시 읽지 않는다. 캐시가 차 있으면 클릭은 왕복이 아예 없다.
   */
  useEffect(() => {
    if (!api) return;
    const missing = selectedKeys.filter((i) => !keyCfgs[i]);
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
  }, [api, send, selectedKeys, keyCfgs]);

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

  /*
   * 고른 키들의 공통 값. 없거나 서로 다르면 null — 화면은 `—` 로 비운다.
   *
   * ★ 예전에는 선택이 비면 프로파일 전역값을 돌려줬다.
   *
   *   그때는 빈 선택이 곧 "전 키" 였으니 맞는 값이었다. 이제 빈 선택은 **대상이
   *   없다** 는 뜻이라, 전역값을 보여주면 그게 지금 걸려 있는 값인 것처럼 읽힌다.
   *   대상이 없으면 보여줄 값도 없다.
   */
  const num = (k: keyof HeKeyCfg) => {
    const v = pick(k);
    return typeof v === 'number' ? v : null;
  };

  /*
   * 목록과 정보 조회를 한 자리에서 만든다.
   *
   * 내장은 0xC6, 커스텀은 0xCB 로 따로 오지만 화면에서는 한 목록이다. 두 출처를
   * 쓰는 쪽마다 합치면 반드시 한쪽을 빠뜨린다.
   */
  const swOptions = useMemo(
    () => switchOptions(switches, swCust),
    [switches, swCust],
  );

  /*
   * CUSTOM 탭의 편집 상태.
   *
   * ★ 초안을 따로 든다. 타이핑할 때마다 장치에 쓰지 않는다.
   *
   *   자속을 "700" 으로 치는 동안 7, 70, 700 이 차례로 나간다. 그때마다 장치가
   *   곡선을 다시 만들고 임계값을 다시 굽는다 — 중간 값은 대개 근이 없어 곡선이
   *   사라졌다 나타났다 한다. 다 치고 나서 한 번 보낸다.
   */
  const [swSlot, setSwSlot] = useState(0);
  const [swDraft, setSwDraft] = useState<HeSwCustom>({
    name: '',
    travelUm: 400,
    fluxRestGs: 0,
    fluxBottomGs: 0,
    kind: 0,
  });
  const [swBusy, setSwBusy] = useState(false);
  const [swMsg, setSwMsg] = useState('');
  const swInput = useRef<HTMLInputElement>(null);

  /*
   * 화면을 옮기면 가리킨 키를 잊는다.
   *
   * 키캡에서 마우스가 빠져나가는 사건은 공유 렌더가 안 올려 주므로(내려오는 것은
   * PointerDown·PointerOver 뿐이다) 판을 벗어나도 마지막 키가 남는다. 최소한 화면을
   * 옮길 때는 지워야 "—" 가 제 뜻대로 보인다.
   */
  useEffect(() => {
    dispatch(setHoverKey(null));
  }, [rail, section, dispatch]);

  const swSlotOptions = useMemo(
    () =>
      swCust.map((c, i) => ({label: swCustomLabel(i, c), value: i})),
    [swCust],
  );

  /* 슬롯을 바꾸거나 장치에서 다시 읽으면 초안을 그 값으로 되돌린다 */
  useEffect(() => {
    const c = swCust[swSlot];

    if (c) setSwDraft({...c});
  }, [swSlot, swCust]);

  const swSave = useCallback(async () => {
    setSwBusy(true);
    setSwMsg('');
    try {
      /*
       * 장치가 실제로 담은 값을 받아 그대로 반영한다 — 이름이 잘렸거나 행정이
       * 잘렸으면 화면이 바로 안다.
       */
      const got = await heSwCustomSet(send, swSlot, swDraft);

      setSwCust((l) => l.map((c, i) => (i === swSlot ? got : c)));
      setSwDraft({...got});
      /* 행정이 바뀌면 키의 mm 환산 기준이 바뀐다 — 키캡 값을 다시 읽는다 */
      setKeyCfgs({});
      setSwMsg(t('Saved'));
    } catch (e) {
      setSwMsg(String(e));
    } finally {
      setSwBusy(false);
    }
  }, [send, swSlot, swDraft, t]);

  /*
   * ★ 스위치 정의 파일에는 **보드 이름을 안 넣는다.**
   *
   *   담긴 것이 전부 데이터시트에서 온 값이라 보드와 무관하다. 보드를 적어 두면
   *   검사하고 싶어지고, 검사하면 다른 모델과 나눌 수가 없다. 전체 백업이 보드를
   *   가리는 것과는 반대 이유다.
   */
  const swExport = useCallback(() => {
    const obj = {
      kind: 'wish60-he/switches',
      version: 1,
      switches: [
        {
          name: swDraft.name,
          travelUm: swDraft.travelUm,
          fluxRestGs: swDraft.fluxRestGs,
          fluxBottomGs: swDraft.fluxBottomGs,
        },
      ],
    };
    const a = document.createElement('a');

    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}),
    );
    a.download = `${(swDraft.name || `custom${swSlot + 1}`)
      .replace(/[^\w.-]+/g, '-')
      .toLowerCase()}.switch.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [swDraft, swSlot]);

  /*
   * 불러오면 **초안에만** 넣는다. 어느 칸에 넣을지는 이미 위에서 고른 상태이고,
   * 실제로 장치에 쓰는 것은 사용자가 저장을 누를 때다 — 파일 하나로 슬롯이 조용히
   * 바뀌면 곤란하다.
   */
  const swImport = useCallback(
    async (evt: React.ChangeEvent<HTMLInputElement>) => {
      const f = evt.target.files?.[0];

      evt.target.value = '';
      if (!f) return;
      try {
        const o = JSON.parse(await f.text());

        if (o?.kind !== 'wish60-he/switches') {
          setSwMsg(t('not a switch file'));
          return;
        }
        const one = Array.isArray(o.switches) ? o.switches[0] : null;

        if (!one) {
          setSwMsg(t('no switches in the file'));
          return;
        }
        setSwDraft({
          name: String(one.name ?? '').slice(0, 11),
          travelUm: Math.min(500, Math.max(200, one.travelUm | 0)),
          fluxRestGs: Math.max(0, one.fluxRestGs | 0),
          fluxBottomGs: Math.max(0, one.fluxBottomGs | 0),
          kind: 0,
        });
        setSwMsg(t('Loaded — press Apply to write it'));
      } catch (e) {
        setSwMsg(String(e));
      }
    },
    [t],
  );

  const swInfoOf = useCallback(
    (t: number) => {
      if (heSwIsCustom(t)) {
        const c = swCust[heSwSlotOf(t)];

        return c
          ? {
              name: swCustomLabel(heSwSlotOf(t), c),
              travelUm: c.travelUm,
              fluxRestGs: c.fluxRestGs,
              fluxBottomGs: c.fluxBottomGs,
            }
          : null;
      }
      return switches?.list[t] ?? null;
    },
    [switches, swCust],
  );

  /* 배치에 있는 키의 매트릭스 인덱스 — "모두 선택"과 "반전"의 모집단 */
  const allKeyIndexes = useMemo(
    () => layout.map((g) => g.row * MATRIX_COLS + g.col),
    [layout],
  );

  /*
   * 이 둘을 바꾸면 장치가 계산해 주는 값(travelUm·strokeCnt)이 같이 바뀐다.
   * 그때만 다시 읽어야 한다.
   */
  const refreshTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (refreshTimer.current !== undefined) {
        clearTimeout(refreshTimer.current);
      }
    },
    [],
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
   *
   * ★ 값이 나가는 길은 **이것 하나뿐이다.**
   *
   *   he-api 에 프로파일 전역 setter(heSetPress 등)가 아직 있지만 이 화면은 안 쓴다.
   *   두 길을 두면 하나는 반드시 낡는다 — 실제로 스위치 종류가 그렇게 됐다. 전역
   *   setter 를 부르면 선택을 무시하고 전 키에 뿌려진다.
   */
  const putMany = useCallback(
    async (patch: Partial<HeKeyCfg>) => {
      /*
       * ★ 고른 키가 없으면 **아무 데도 쓰지 않는다.**
       *
       *   예전에는 빈 선택을 "전부" 로 읽었다. 아무것도 안 고른 채로 슬라이더를
       *   건드리면 63키가 한꺼번에 바뀌었고, 그건 되돌릴 수도 없다.
       *
       *   화면에서만 막으면 반드시 하나가 샌다 — 값 컨트롤이 열두 개인데 전부 이
       *   한 길로 지나므로, 마지막 방어선은 여기다. 전 키에 쓰려면 "모두 선택" 을
       *   **명시해야** 한다.
       */
      if (selectedKeys.length === 0) return;

      const all =
        allKeyIndexes.length > 0 &&
        allKeyIndexes.every((i) => selectedKeys.includes(i));
      const targets = all ? [HE_KEY_ALL] : selectedKeys;
      const done: Record<number, HeKeyCfg> = {};

      /* 장치가 계산하는 값까지 흔드는 항목인가 */
      const derived = REFRESH_KEYS.some((k) => k in patch);

      for (const i of targets) {
        /*
         * 브로드캐스트는 키 0 을 대표로 삼는다 — 캐시에 있으면 그걸 쓴다.
         *
         * keyCfgs[HE_KEY_ALL] 은 있을 리가 없으므로, 그냥 keyCfgs[i] 로 찾으면
         * 브로드캐스트마다 왕복이 하나씩 더 붙는다. 슬라이더를 끌면 스텝마다다.
         */
        const rep = i === HE_KEY_ALL ? 0 : i;
        const base = keyCfgs[rep] ?? (await heReadKeyCfg(send, rep));
        const next = {...base, ...patch} as HeKeyCfg;

        /* 해제가 입력보다 깊으면 펌웨어가 잘라내지만, 화면 값도 맞춰 둔다 */
        if (next.releaseUm >= next.pressUm && next.pressUm > 0) {
          next.releaseUm = next.pressUm - 1;
        }
        await heWriteKeyCfg(send, i, next);

        /*
         * ★ 파생 값을 바꿨을 때만 다시 읽는다.
         *
         *   travelUm·strokeCnt 는 장치가 계산해 주는 읽기 전용이다. 그 둘이 낡는 것은
         *   스위치 종류나 전 행정을 바꿨을 때뿐이라(REFRESH_KEYS), 입력지점을 끌 때까지
         *   왕복을 하나씩 더 붙일 이유가 없다.
         *
         *   예전에는 늘 읽었다. 슬라이더 한 번 끌면 스텝마다 쓰기+읽기 두 왕복이고,
         *   키캡은 읽기가 돌아와야 움직였다.
         */
        if (i !== HE_KEY_ALL) {
          done[i] = derived
            ? await heReadKeyCfg(send, i).catch(() => next)
            : next;
        }
      }

      /*
       * 브로드캐스트였으면 **알고 있는 전 키**의 표시값을 맞춰 둔다.
       *
       * 장치에는 한 번만 썼지만 화면에는 63개가 걸려 있다. 여기서 같은 patch 를
       * 캐시에도 얹어 두면 다시 읽지 않고도 키캡이 맞는다.
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

      /*
       * ★ 캐시를 **버리지 않는다.**
       *
       *   예전에는 브로드캐스트 뒤에 setKeyCfgs({}) 로 통째로 비웠다. 바로 위에서
       *   전 키 값을 다 만들어 놓고 그걸 버린 셈인데, 그 대가가 컸다 —
       *
       *     1. 키캡이 값을 잃어 빈칸이 된다 (= 깜빡임)
       *     2. 미리읽기 effect 가 63키를 하나씩 HID 로 다시 읽는다
       *     3. 슬라이더는 끄는 동안 스텝마다 onChange 를 낸다. 스텝마다 1~2 가
       *        되풀이되고, effect 의 정리 함수가 매번 중간에 끊는다 — 끌고 있는
       *        내내 다 못 채운다 (= 느린 갱신)
       *     4. 캐시가 비면 pick 이 null 이라 슬라이더 값이 끌던 중에 기본값으로 튄다
       *
       *   "전체 선택하고 슬라이더를 끌면 키캡이 깜빡이며 느리게 따라온다" 가 이것이다.
       */
      if (Object.keys(done).length) setKeyCfgs((m) => ({...m, ...done}));

      /*
       * 파생 값만 예외다.
       *
       * travelUm·strokeCnt 는 장치가 계산한다. patch 를 그대로 얹으면 그 둘이 낡는데,
       * 낡는 경우는 스위치 종류나 전 행정을 바꿀 때뿐이다. 그때만 **손을 뗀 뒤 한 번**
       * 캐시를 비워 미리읽기가 채우게 한다 — 끄는 동안은 타이머가 계속 밀린다.
       */
      if (all && derived) {
        if (refreshTimer.current !== undefined) {
          clearTimeout(refreshTimer.current);
        }
        refreshTimer.current = window.setTimeout(() => setKeyCfgs({}), 250);
      }
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
    heSwCustomAll(send)
      .then((c) => alive && setSwCust(c))
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
     *     스위치 갈래       null(선택)      null(각인)   ← 종류·행정이 키별이다
     *     보정 (쉴 때)      안 된 키        보정된 키의 스트로크 mm
     *     보정 (도는 중)    끝난 키         null — 지금은 누르는 일에 집중한다
     *     장치 갈래        []              null
     *
     *   화면이 늘면 여기에 한 줄 더한다.
     *
     * ★ 스위치를 별도 갈래로 빼면서 이 줄을 빠뜨렸다. 선택 버튼은 보이는데 키를
     *   눌러도 색이 안 바뀌었다 — 고른 것이 화면에 안 나타나면 고를 수가 없다.
     */
    if (keyRail) {
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
    /*
     * ★ 스위치 갈래도 여기서 그린다.
     *
     *   OVERLAY_FIELDS 에 switch 항목은 처음부터 있었는데 조건에 막혀 안 나왔다.
     */
    if (!keyRail) return;

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

    /*
     * 같은 내용이면 안 보내지는 것은 **리듀서가** 맡는다 (heSlice 의 sameMap).
     *
     * 여기서 서명을 들고 비교했다가 당했다 — 이 값을 쓰는 자리가 넷인데 서명은
     * 하나뿐이라, 다른 셋이 바꾸면 서명이 낡아 필요한 갱신을 삼켰다.
     */
    dispatch(setOverlayText(text));
  }, [rail, section, keyCfgs, layout, dispatch]);

  /*
   * 래피드 트리거가 켜진 키를 키캡 우측 위에 표시한다.
   *
   * ★ 숫자로는 알 수 없는 것이다.
   *
   *   RT 화면의 키캡 숫자는 되돌림 거리(0.30 같은)를 보여준다. 그런데 그 값은 RT 를
   *   꺼 둔 키에도 저장되어 있어서, **숫자만 보면 어느 키에 실제로 걸려 있는지
   *   알 수 없다.** 켜짐/꺼짐은 값이 아니라 상태라 자리도 표현도 달라야 한다.
   *
   * ★ 세 플래그를 다 보여주지 않는다.
   *
   *   바닥 보호는 기본으로 켜져 있어 전 키에 붙는다 — 그러면 표시가 신호가 아니라
   *   배경이 된다. 켜짐(점 하나)과 연속(점 둘)만 남긴다.
   *
   * RT 화면에서만 그린다. 다른 화면에서는 지금 만지는 값과 관계없는 표시라 방해다.
   */
  useEffect(() => {
    /*
     * 스위치 화면은 **어느 종류가 걸렸나**를 색으로 찍는다.
     *
     * 키캡에는 행정만 들어가는데, 3.50mm 짜리가 둘이면 그것만으로는 못 가른다.
     * 색이 같으면 같은 스위치다 — 이름을 못 읽어도 무리는 보인다.
     */
    if (rail === 'switch' && section === 'switch') {
      const badge: Record<number, number> = {};

      for (const g of layout) {
        const i = g.row * MATRIX_COLS + g.col;
        const c = keyCfgs[i];

        if (!c) continue;
        badge[i] = 1 | (heSwBadgeColor(c.switchType) << 4);
      }
      dispatch(setOverlayBadge(badge));
      return;
    }

    if (rail !== 'tune' || section !== 'rapid') {
      dispatch(setOverlayBadge(null));
      return;
    }

    const badge: Record<number, number> = {};
    for (const g of layout) {
      const i = g.row * MATRIX_COLS + g.col;
      const f = keyCfgs[i]?.rtFlags ?? 0;

      if (!(f & HE_RT_ON)) continue;
      badge[i] = f & HE_RT_CONT ? 2 : 1;
    }

    /* 중복 제거는 리듀서가 한다 — 위와 같은 이유다 */
    dispatch(setOverlayBadge(badge));
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
   * ★ 장치 갈래에서는 끄고, **나올 때 돌려놓는다.**
   *
   *   거기서는 깊이를 볼 일이 없고, 굽는 동안 스트림이 열려 있으면 장치가
   *   재열거될 때 엉킨다. 보정 갈래에서는 켠 채로 둔다 — 거기도 깊이를 본다.
   *
   *   끄기만 하고 안 돌려놓던 것이 버그였다. 디버그를 한 번 보고 오면 켜져 있던
   *   라이브 깊이가 꺼진 채였고, autoTried 가 이미 서 있어 자동 시작도 안 걸렸다.
   *   **내가 끈 것은 내가 되살린다** — 사용자가 끈 것은 그대로 둬야 하므로 들어갈
   *   때의 상태를 적어 둔다.
   */
  const autoTried = useRef(false);
  const trackWas = useRef(false);

  /*
   * ★ **장치가 바뀌면 스트림을 놓는다.**
   *
   *   트래킹 채널은 **그 장치의 HID 엔드포인트**에 붙어 있다. 키보드를 갈아 끼워도
   *   `tracking` 이 참인 채로 남으면, 아래 자동 시작이 `if (tracking) return` 에서
   *   돌아서서 **새 장치에는 영영 스트림을 안 연다.** 화면에 깊이 표시가 통째로
   *   안 뜨던 것이 이것이다 — 창을 새로고침하면 나았던 이유이기도 하다.
   *
   *   autoTried 도 같이 내린다. 그것 하나만 남아도 자동 시작이 다시 안 걸린다.
   *
   *   옛 장치에 "꺼라" 를 보내지 않는다. 이미 사라졌거나 다른 장치이고, 채널을
   *   닫는 것만으로 우리 쪽은 정리된다.
   */
  useEffect(() => {
    chan.current?.close();
    chan.current = null;
    setTracking(false);
    setState([]);
    setInfo(null);
    setFps(0);
    autoTried.current = false;
    trackWas.current = false;
  }, [device?.path]);

  useEffect(() => {
    if (!api || !device || busy) return;

    if (rail === 'device') {
      if (tracking) {
        trackWas.current = true;
        stop();
      }
      return;
    }
    if (tracking) return;

    /* 장치 갈래에 들어가느라 내가 껐던 것이면 되살린다 */
    if (trackWas.current) {
      trackWas.current = false;
      start(true);
      return;
    }

    if (!keyRail || autoTried.current) return;

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
    /*
     * ★ 스위치 갈래도 설정 갈래와 똑같이 그린다.
     *
     *   거기서도 눌러 보면서 정하는 화면이다 (그래프가 지금 자리를 보여준다).
     *   막대·눌림 테두리·실시간 값이 같이 있어야 "이 스위치로 읽으면 내 손가락이
     *   어디쯤인가" 가 한 화면에서 끝난다. 키캡의 고정 숫자만 전 행정으로 다르다.
     */
    if (!keyRail || !tracking) {
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
     * ★ mm 는 **움직일 때만** 찍는다.
     *
     *   한 번 늘 찍어 봤다. 장치가 쉬는 구간을 딱 0 으로 주니(R29 스퀄치) 깜빡이지도
     *   않아서 문제가 없을 줄 알았는데, **63개가 전부 0.00 을 달고 있으니 판이
     *   꽉 차서 읽히지 않았다.** 깜빡임과 별개의 문제였다.
     *
     *   숫자가 뜬다는 것 자체가 신호다 — 지금 움직이는 키가 어느 것인지 판 전체에서
     *   한눈에 짚인다. 다 뜨면 그 신호가 사라진다.
     *
     *   자리마다 늘 값이 필요하면 그건 "지금" 줄이 맡는다. 거기는 튜닝 중인 키
     *   하나만 크게 보여주므로 꽉 차지 않는다.
     *
     * ★ mm 는 0.05 단위로 끊는다.
     *
     *   0.01 까지 보이면 끝자리가 쉼 없이 떨려 읽을 수가 없다. 원시값은 끊지
     *   않는다 — 그건 떨림 자체를 보려고 켜는 것이다.
     */
    const live: Record<number, string> = {};
    for (const g of layout) {
      const i = g.row * MATRIX_COLS + g.col;
      const k = state[i];
      if (!k) continue;
      if (showRaw) {
        live[i] = String(k.raw);
      } else if (k.depth >= HE_MM_MIN) {
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
  }, [api, prof?.active]);

  /*
   * 설정 갈래에 들어오면 전 키 값을 채운다.
   *
   * keyCfgs 는 원래 **고른 키**만 읽어 둔다 — 고치려는 키만 알면 됐기 때문이다.
   * 키캡에 얹으려면 전 키가 필요하다. 이미 있는 키는 건너뛰므로 갈래를 다시
   * 열어도 다시 읽지 않는다.
   */
  useEffect(() => {
    /*
     * ★ 스위치 갈래도 키별 설정이 필요하다.
     *
     *   스위치 종류와 전 행정이 키별이라(한 보드에 여러 종류를 꽂을 수 있다) 고른
     *   키의 값을 보여주려면 여기서 읽어 둬야 한다. 갈래를 늘릴 때 이 줄을 같이
     *   안 고치면 "선택은 되는데 값이 안 뜬다" 가 된다.
     */
    if (!api || !keyRail || layout.length === 0) return;

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
   * 진단 화면이 열려 있는 동안만 통계를 읽는다.
   *
   * ★ 화면을 닫으면 멈춘다.
   *
   *   진단은 늘 필요한 것이 아니다. 안 보는 동안에도 계속 물으면 USB 통로를
   *   차지하고, 그 통로는 라이브 깊이·보정과 같은 줄에 선다.
   *
   * 끝나면 다시 거는 방식이다 — setInterval 은 한 회차가 늦어지면 겹친다.
   */
  useEffect(() => {
    if (!api || section !== 'debug') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const v = await heReadStat(send);
        if (alive) setStat(v);
      } catch {
        /* 이 명령을 모르는 펌웨어일 수 있다 — 조용히 넘어간다 */
      }
      if (alive) timer = setTimeout(tick, 500);
    };
    tick();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, send, section]);

  /*
   * 제원은 화면을 처음 열 때 한 번만 읽는다.
   *
   * 클럭도 EEPROM 크기도 도중에 바뀌지 않는다. 주기로 읽으면 USB 통로만 차지한다.
   */
  useEffect(() => {
    if (!api || section !== 'info' || hw) return;
    let alive = true;
    heReadHwInfo(send)
      .then((v) => alive && setHw(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api, send, section, hw]);

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
    /*
     * 고를 것이 없으면 고칠 것도 없다.
     *
     * ★ 컨트롤마다 자기 disabled 를 받는다 — 감싸는 상자를 두지 않는다.
     *
     *   예전에 `pointer-events: none !important` 를 뿌리는 래퍼로 한 번에 막아 본
     *   적이 있다. 그물이 넓어서 다른 갈래의 컨트롤까지 먹었고, 그 그물은 DOM 검사기에
     *   안 보여서 "왜 아무것도 안 눌리지" 를 한참 찾았다. 게다가 `display: contents`
     *   래퍼가 바깥 flex 정렬과 줄 구분선까지 흔들었다.
     *
     *   컨트롤이 스스로 꺼지면 그런 일이 없다. 넷 중 셋(AccentRange·AccentSelect·
     *   AccentButton)은 이미 disabled 를 받고, 나머지 둘에만 prop 을 붙였다.
     *
     * ★ **보는 도구는 잠그지 않는다** — 라이브 깊이·원시 ADC 토글, Now 줄, 그래프,
     *   눈금과 라이브 막대. 선택이 없어도 눌러 보는 것은 되어야 한다.
     */
    const locked = selectedKeys.length === 0;

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

    if (section === 'info') {
      const kb = (v?: number) =>
        v === undefined ? '—' : `${(v / 1024).toFixed(1)} KB`;
      const hex = (v?: number) =>
        v === undefined ? '—' : `0x${v.toString(16).toUpperCase()}`;

      /*
       * 펌웨어 크기는 배포 목록에서 가져온다.
       *
       * 장치가 주는 값은 코드+상수의 끝 주소라 실제 파일보다 조금 작다. 사용자가
       * 견줄 대상은 자기가 구운 파일이므로, 그 버전의 배포 크기가 있으면 그걸 쓴다.
       */
      const rel = (fwList_ ?? []).find((f) => f.version === fwInfo?.version);

      const rows: [string, string][] = [
        [t('Board'), fwInfo?.board ?? '—'],
        [t('Firmware'), fwInfo?.version ?? '—'],
        [
          t('Firmware size'),
          rel ? `${rel.size.toLocaleString()} B` : kb(hw?.fwSize),
        ],
        [
          t('Flash region'),
          hw ? `${hex(hw.appBegin)} + ${kb(hw.appSize)}` : '—',
        ],
        [t('MCU'), hw?.mcu ?? '—'],
        [
          t('Core clock'),
          hw ? `${Math.round(hw.clockHz / 1000000)} MHz` : '—',
        ],
        [t('EEPROM'), kb(hw?.eepromSize)],
        [
          t('Stores'),
          hw ? `${t('calibration')} ${hex(hw.calAddr)} · ${t('settings')} ${hex(hw.setAddr)}` : '—',
        ],
        [
          t('Matrix'),
          hw ? `${hw.rows} x ${hw.cols}   ${hw.keyCount} ${t('keys')}` : '—',
        ],
        [t('Layers'), hw ? String(hw.layers) : '—'],
        [t('LEDs'), hw ? String(hw.ledCount) : '—'],
        [t('Profiles'), prof ? String(prof.count) : '—'],
        [t('Made by'), hw?.author ?? '—'],
      ];

      return (
        <>
          {rows.map(([label, value]) => (
            <ControlRow key={label}>
              <Label>{label}</Label>
              <Detail>
                <Summary>{value}</Summary>
              </Detail>
            </ControlRow>
          ))}
          <Note>{t('he.note.info')}</Note>
        </>
      );
    }

    if (section === 'debug') {
      /*
       * ★ 숫자 하나로는 아무것도 못 정한다.
       *
       *   "최대 650us" 만 보면 대응을 고를 수 없다. 861만 번 중 399번이면 부팅 잡음
       *   이고 5만 번이면 구조 문제인데, 최대치는 그 둘을 구분해 주지 않는다.
       *   그래서 최대치 옆에 **넘긴 횟수와 전체 횟수**를 같이 둔다.
       */
      const n = (v?: number) => (v === undefined ? '—' : v.toLocaleString());
      /* us 한 바퀴가 곧 주파수다. 1000/us = kHz */
      const khz = (v?: number) =>
        !v ? '—' : v >= 1000 ? `${(1000 / v).toFixed(2)} kHz` : `${(1000 / v).toFixed(1)} kHz`;
      const us = (v?: number) => (v === undefined ? '—' : `${v} us`);
      const rate = (over?: number, all?: number) =>
        over === undefined || !all
          ? '—'
          : `${over.toLocaleString()} / ${all.toLocaleString()}` +
            (over ? ` (${((over * 100) / all).toFixed(4)}%)` : '');

      const rows: [string, string, string][] = [
        /*
         * ★ 주파수도 같이 보인다.
         *
         *   30us 가 몇 kHz 인지 머릿속으로 나누게 하면 안 된다. 이 화면에서 정말
         *   알고 싶은 것은 "8kHz 가 나오나" 이고, 그건 us 가 아니라 kHz 로 물어야
         *   답이 바로 나온다. 최대 시간 쪽은 **최저** 주파수다 — 최악의 한 바퀴가
         *   곧 그 순간의 속도다.
         */
        [
          'he.dbg.scan',
          t('Scan'),
          stat
            ? `${us(stat.scanUs)} (${khz(stat.scanUs)})   ${t('max')} ${us(
                stat.scanUsMax,
              )} (${khz(stat.scanUsMax)})`
            : '—',
        ],
        ['he.dbg.scanOver', t('Scan over 60us'), rate(stat?.scanOver, stat?.scanCnt)],
        ['he.dbg.task', t('Keyboard task'), `${us(stat?.taskUs)}   ${t('avg')} ${us(stat?.taskUsAvg)}   ${t('max')} ${us(stat?.taskUsMax)}`],
        ['he.dbg.taskOver', t('Task over 125us'), rate(stat?.taskOver, stat?.taskCnt)],
        ['he.dbg.rgb', t('RGB frame'), `${t('avg')} ${us(stat?.rgbUsAvg)}   ${t('max')} ${us(stat?.rgbUsMax)}`],
        ['he.dbg.timeout', t('ADC timeout'), n(stat?.timeout)],
        ['he.dbg.boot', t('Boot calibration'), stat ? `${stat.calMs} ms   ${stat.calibrated ? t('done') : t('not done')}` : '—'],
        ['he.dbg.fps', t('Live frames'), tracking ? `${fps} / s` : t('off')],
      ];

      /*
       * ★ 누적값을 지우는 버튼.
       *
       *   "최대 650us" 가 부팅 직후 한 번인지 지금도 나는지는 눌러 봐야 안다.
       *   무언가 고친 뒤 "나아졌나" 를 보려면 옛 기록이 지워져야 한다.
       *
       *   지금 값(마지막 한 바퀴)은 안 지운다 — 누적이 아니라서 지워도 다음 스캔에
       *   바로 채워지고, 0 으로 잠깐 보이는 것이 오히려 거짓말이다.
       */
      const doClear = async () => {
        try {
          setStat(await heReadStat(send, true));
        } catch (e) {
          setErr(String(e));
        }
      };

      return (
        <>
          {rows.map(([tip, label, value]) => (
            <ControlRow key={label}>
              <Label>
                <Hint tip={t(tip)}>{label}</Hint>
              </Label>
              <Detail>
                <Summary>{value}</Summary>
              </Detail>
            </ControlRow>
          ))}
          <ControlRow>
            <Label>
              <Hint tip={t('he.dbg.clear')}>{t('Counters')}</Hint>
            </Label>
            <Detail>
              <SelBtn onClick={doClear}>{t('Clear')}</SelBtn>
            </Detail>
          </ControlRow>

          <Note>{t('he.note.debug')}</Note>
        </>
      );
    }

    if (section === 'backup') {
      /*
       * ★ 한 파일에 다 담는다.
       *
       *   프로파일 네 벌의 HE 설정·키맵·조명, 그리고 프로파일을 안 따르는 매크로와
       *   QMK 설정까지. 담는 곳이 흩어지면 사용자는 무엇을 어디서 받아 뒀는지
       *   기억해야 하고, 하나를 빠뜨린 채 복원하면 어긋난 상태가 된다.
       *
       *   보정값만 빼놓는다 — 이 보드의 스위치를 잰 값이라 다른 보드에서는 틀리다.
       *
       *   VIA 의 키맵 저장/불러오기는 그대로 둔다. 그쪽은 키맵만 다루는 도구라 뜻이
       *   분명하고 이미 쓰던 파일이 있다.
       */
      const keymapIo = async () => {
        const kb = api as KeyboardAPI;
        const layers = await heLock(() => kb.getLayerCount(), 'layer count');
        const m = {rows: MATRIX_COLS, cols: MATRIX_COLS};   /* 8 x 8 */
        return {
          layers,
          read: (l: number) => kb.readRawMatrix(m, l) as Promise<number[]>,
          write: (km: number[][]) => kb.writeRawMatrix(m, km),
          /*
           * ★ 버퍼 크기로 자른다.
           *
           *   VIA 의 getMacroBytes 는 28바이트씩 끊어 읽으면서 **마지막 조각을 통째로**
           *   붙인다. 그래서 버퍼 크기의 배수로 올림된 값이 나온다 (예: 1000 짜리
           *   버퍼에서 1008 바이트). 그걸 그대로 되돌려 쓰면 setMacroBytes 가
           *   "Macro size exceeds buffer size" 로 튕긴다 — 방금 자기가 읽은 것을
           *   자기가 거부하는 셈이다.
           *
           *   읽을 때 잘라 두면 파일도 정확한 크기로 남고, 되돌릴 때도 걸리지 않는다.
           */
          readMacros: async () => {
            const size = await kb.getMacroBufferSize();
            return (await kb.getMacroBytes()).slice(0, size);
          },
          writeMacros: async (d: number[]) => {
            const size = await kb.getMacroBufferSize();
            await kb.setMacroBytes(d.slice(0, size));
          },
        };
      };

      const allIdx = layout.map((g) => g.row * MATRIX_COLS + g.col);

      const doExport = async () => {
        setBkBusy(true);
        setBkMsg(null);
        try {
          const board = fwInfo?.board ?? 'wish60-he';
          const stamp = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const day = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
            stamp.getDate(),
          )}`;

          /*
           * 프로파일 네 벌을 오가며 읽으므로 몇 초 걸린다. 아무 말 없이 버튼만
           * 회색이면 멈춘 것과 구분이 안 된다 — 어디까지 갔는지 보인다.
           */
          const b = await heReadBackup(
            send,
            await keymapIo(),
            allIdx,
            {board, firmware: fwInfo?.version ?? '', date: stamp.toISOString()},
            (m) => setBkMsg(`${t('Reading')} ${m}`),
            bkScope < 0 ? undefined : [bkScope],
          );

          const blob = new Blob([JSON.stringify(b, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          /* 파일 이름에 대상을 적는다 — 나중에 무엇이 든 파일인지 열어 보지 않아도 안다 */
          a.download =
            bkScope < 0
              ? `${board}-${day}.json`
              : `${board}-p${bkScope + 1}-${day}.json`;
          a.click();
          URL.revokeObjectURL(url);

          setBkMsg(`${t('Saved')} — ${b.profiles.length} ${t('profiles')}`);
        } catch (e) {
          setBkMsg(String(e));
        } finally {
          /*
           * ★ 어떤 길로 끝나든 푼다.
           *
           *   중간에 멈추면 버튼이 회색으로 굳은 채 아무 말도 없다. 사용자는 다시
           *   눌러 볼 수조차 없다 — 실패했다고 말해 주는 편이 낫다.
           */
          setBkBusy(false);
        }
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

          const n = await heWriteBackup(
            send,
            await keymapIo(),
            allIdx,
            obj,
            (m) => setBkMsg(`${t('Writing')} ${m}`),
            bkScope < 0 ? undefined : bkScope,
          );

          /*
           * 읽어 둔 것이 전부 낡았다 — 키 설정도, 앱이 들고 있는 키맵도.
           * 키맵은 버리지 않고 덮어쓴다 (버리면 화면이 그릴 것이 없어진다).
           */
          setKeyCfgs({});
          /* 스위치 정의도 덮였다 — 목록과 CUSTOM 탭이 그걸 보고 있다 */
          await heSwCustomAll(send)
            .then(setSwCust)
            .catch(() => {});
          if (device) await dispatch(loadKeymapFromDevice(device, true));

          setBkMsg(`${t('Applied')} — ${n} ${t('keys')}`);
        } catch (e) {
          setBkMsg(String(e));
        } finally {
          setBkBusy(false);
        }
      };

      return (
        <>
          {/*
            * ★ 대상을 먼저 고른다.
            *
            *   "전부" 와 "하나" 는 뜻이 다른 일이다. 전부는 이 키보드를 통째로 되돌리는
            *   것이고, 하나는 프로파일 한 벌만 옮기는 것이다 — 다른 보드의 1번을 이
            *   보드 3번에 붓는 식으로도 쓴다.
            *
            *   하나만 담을 때는 매크로와 QMK 설정을 안 넣는다. 프로파일 하나를
            *   불러오면서 그것들까지 바뀌면 고른 것보다 많은 것이 바뀐다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.bkScope')}>{t('Target')}</Hint>
            </Label>
            <Detail>
              <AccentSelect
                width={selRowW}
                value={
                  bkScope < 0
                    ? {label: t('All profiles'), value: -1}
                    : {label: `${t('Profile')} ${bkScope + 1}`, value: bkScope}
                }
                options={[
                  {label: t('All profiles'), value: -1},
                  ...Array.from({length: prof?.count ?? 4}, (_, i) => ({
                    label: `${t('Profile')} ${i + 1}`,
                    value: i,
                  })),
                ]}
                onChange={(o: any) => setBkScope(o?.value ?? -1)}
              />
            </Detail>
          </ControlRow>

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
         *
         * ★ **없으면 0 으로 둔다. 여기서 돌아서면 안 된다.**
         *
         *   부트로더에 멈춘 보드로 앱을 켜면 device 도 없고 ref 도 비어 있다.
         *   예전에는 그때 그냥 return 해서 **굽기 버튼이 아무 일도 안 했다** —
         *   되살리려고 온 사람이 정확히 그 상태다.
         *
         *   이 값은 "앱을 부트로더로 넘기는" 단계에만 쓰인다. 이미 부트로더면
         *   iapFlash 가 그 단계를 통째로 건너뛰므로 쓰이지 않는다.
         */
        const vid = device?.vendorId ?? fwVid.current ?? 0;
        const pid = device?.productId ?? fwPid.current ?? 0;
        fwVid.current = vid;
        fwPid.current = pid;

        setFwErr(null);
        setBusy(true);
        /* 전역 장치 선택이 이 사이에 다른 보드로 갈아타지 않게 한다 */
        dispatch(setFlashing(true));
        try {
          /*
           * ★ **부트로더 서술자를 고른 보드에서 가져온다.**
           *
           *   예전에는 wish60 의 부트로더가 상수로 박혀 있었다. 그 상태로 wish61 을
           *   꽂고 누르면 진입 명령만 먹고 **부트로더에 갇혔다** — 점프는 통해서
           *   App1 헤더를 지우는데, 그 뒤로 영영 없는 장치를 기다렸다.
           */
          await iapFlash(iapSpecOf(fwBoard), vid, pid, image, setFw, () => {
            /*
             * 부트로더를 못 찾았다. 사용자가 버튼을 누를 때까지 기다린다 —
             * requestDevice() 는 사용자 제스처 안에서만 부를 수 있다.
             */
            return new Promise<HIDDevice | null>((res) => {
              fwPermit.current = res;
            });
          });
          /*
           * 앱이 **다시 잡힐 때까지** 장치 목록을 훑는다.
           *
           * ★ VIA 혼자서는 못 잡는다.
           *
           *   USB 연결/해제 이벤트에만 반응하고, 그때도 500ms·1000ms 두 번 훑고
           *   만다 (Home.tsx 의 timeoutRepeater). 보드가 재열거된 뒤 프로토콜
           *   질의까지 그 1초 안에 못 끝내면 selectDevice(null) 로 끝나고, 다음
           *   이벤트가 없으니 영영 안 잡힌다.
           *
           * ★ **여기서 장치에 말을 걸면 안 된다.**
           *
           *   원래는 버전을 다시 물었다. 그런데 이 자리의 `send` 는 **굽기 전
           *   장치**를 가리키고 그 장치는 이미 사라졌다. 그 왕복은 실패하는 게
           *   아니라 **답이 영영 안 온다** — 반복문이 첫 바퀴에서 멈추고
           *   `finally` 가 안 돌아 busy 가 참으로 굳었다. 굽기는 끝났는데 버튼이
           *   전부 죽어 보이던 것이 이것이다.
           *
           *   버전은 물을 필요도 없다. 새 api 가 잡히면 위쪽 effect(`[api, send]`)가
           *   알아서 다시 읽는다.
           */
          /*
           * ★ **방금 구운 보드로 돌아온다.**
           *
           *   두 보드를 같이 꽂아 두면, 굽는 동안 대상이 사라진 사이에 VIA 가
           *   **다른 보드로 선택을 옮긴다.** 그대로 두면 wish61 을 굽고 났는데
           *   화면은 wish60 을 보여준다 — 방금 한 일과 눈앞이 어긋난다.
           *
           *   그래서 "아무 장치나 돌아왔다" 가 아니라 **그 vid/pid 가 돌아왔는가**
           *   를 기다리고, 선택이 딴 데 가 있으면 되돌린다.
           *
           *   vid/pid 를 모르는 경우(부트로더에 멈춘 보드를 되살리는 길)에는
           *   예전처럼 아무 장치나 잡히면 끝낸다 — 되살아난 것이 곧 목적이다.
           */
          for (let i = 0; i < 12; i++) {
            await new Promise((r) => setTimeout(r, 1000));

            if (vid && pid) {
              const hit = Object.values(connectedRef.current).find(
                (d) => d.vendorId === vid && d.productId === pid,
              );
              if (hit) {
                if (deviceRef.current?.path !== hit.path) {
                  dispatch(selectConnectedDeviceByPath(hit.path));
                }
                break;
              }
            } else if (apiRef.current) {
              break; /* 돌아왔다 */
            }
            dispatch(reloadConnectedDevices());
          }
        } catch (x) {
          setFwErr(String(x));
        } finally {
          dispatch(setFlashing(false));
          setBusy(false);
        }
      };

      const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';   /* 같은 파일을 다시 골라도 이벤트가 오게 */
        if (f) await flash(new Uint8Array(await f.arrayBuffer()));
      };

      const boards = fwBoards_ ?? [];

      /*
       * ★ **보드를 먼저 고른다.**
       *
       *   부트로더는 자기가 무슨 보드인지 말해 주지 않는다 — 벤더 IAP 라 VID/PID 가
       *   보드와 무관하게 늘 534B:4102 이고, 이름을 물을 명령도 없다. 앱이 돌 때만
       *   0xCA 로 알 수 있는데, 굽는 것이 가장 절실한 상황이 바로 앱이 안 도는
       *   상태다.
       *
       *   그래서 여기서는 짐작하지 않고 묻는다. 고르기 전에는 배포 목록도 굽기
       *   버튼도 안 보인다 — 목록만 먼저 보여 주면 그게 어느 보드 것인지 모르는 채
       *   누르게 된다.
       */
      /*
       * ★ **어긋나면 말하는 데서 그치지 않고 막는다.**
       *
       *   장치는 앱 모드에서 0xCA 로 자기 이름을 말한다. 그 이름과 고른 보드가
       *   다르면 **다른 보드의 이미지를 굽는 것**이고, 부트로더 계약이 보드마다
       *   달라서 진입만 하고 못 돌아오는 상태가 된다. 경고만 띄우고 버튼을 열어
       *   두었더니 그대로 누를 수 있었다 — 눌러서 갇히는 길은 남겨 둘 이유가 없다.
       *
       *   부트로더에 멈춘 보드를 되살릴 때는 fwInfo 가 없다(장치가 말을 못 한다).
       *   그때는 막지 않는다 — 사람이 골라야 하고, 그러라고 있는 화면이다.
       */
      const mismatch = !!fwInfo?.board && fwInfo.board !== fwBoard?.id;

      const boardRow = (
        <ControlRow>
          <Label>
            <Hint tip={t('he.tip.fwBoard')}>{t('Keyboard')}</Hint>
          </Label>
          <Detail>
            <AccentSelect
              width={330}
              value={
                fwBoard
                  ? {label: fwBoard.name, value: fwBoard.dir}
                  : (null as any)
              }
              placeholder={t('Pick your keyboard')}
              options={boards.map((b) => ({label: b.name, value: b.dir}))}
              onChange={(o: any) =>
                setFwBoard(boards.find((b) => b.dir === o?.value) ?? null)
              }
            />
          </Detail>
        </ControlRow>
      );

      /*
       * 보드를 아직 안 골랐으면 **여기서 멈춘다.** 굽기 말고 할 수 있는 일이 없는
       * 화면이라, 고르기 전에 다른 것을 늘어놓아 봐야 읽을 이유가 없다.
       */
      if (!fwBoard) {
        return (
          <>
            {boardRow}
            <Note>
              {boards.length === 0
                ? t('he.note.fwNoBoards')
                : t('he.note.fwPickBoard')}
            </Note>
          </>
        );
      }

      return (
        <>
          {boardRow}

          <ControlRow>
            <Label>{t('Current version')}</Label>
            <Detail>{cur}</Detail>
          </ControlRow>

          {/*
            * ★ 장치가 말한 이름과 고른 보드가 다르면 **말하고 막는다.**
            *
            *   앱 모드에서는 자동으로 맞춰지지만, 사람이 일부러 다른 것을 고를 수
            *   있다. 그대로 구우면 다른 보드의 이미지가 올라가고, 부트로더 계약이
            *   보드마다 달라 **진입만 하고 못 돌아온다.** 그래서 경고에서 그치지
            *   않고 굽기 버튼을 잠근다 (mismatch).
            */}
          {mismatch && (
            <Note style={{color: '#d66'}}>
              {t('he.note.fwBoardMismatch', {
                device: fwInfo?.board ?? '',
                picked: fwBoard.name,
              })}
            </Note>
          )}

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
                <ReleaseNotes>
                  {sel.notes.map((n, i) => (
                    <div key={i}>· {n}</div>
                  ))}
                </ReleaseNotes>
              ) : null}

              <ControlRow>
                <Label>{t('Update')}</Label>
                <Detail>
                  <FwBtn
                    disabled={busy || !sel || mismatch}
                    onClick={async (e: React.MouseEvent) => {
                      (e.currentTarget as HTMLElement).blur();
                      if (!sel) return;
                      setFwErr(null);
                      try {
                        await flash(await fwFetch(fwBoard.dir, sel));
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
                disabled={busy || mismatch}
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
            * 앱이 이상해졌을 때 손으로 넘겨 놓거나, 부트로더 쪽 길을 확인할 때 쓴다.
            *
            * ★ **넘기기만 한다.** 예전에는 넘긴 뒤 permit 화면을 띄웠는데, 그 화면의
            *   "Allow" 는 굽는 중에만 채워지는 resolver(fwPermit)를 부르므로 여기서는
            *   눌러도 아무 일이 안 나는 막다른 자리였다.
            *
            *   넘어간 뒤는 이제 알아서 이어진다 — 부트로더가 열거되면 Home 의 주기
            *   확인이 그걸 보고, 이 화면이 펌웨어 갈래로 옮겨 간다. 권한이 아직
            *   없으면 "장치 없음" 벽의 연결 버튼이 받는다.
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
            *   굽기는 사용자가 가장 무서워하는 버튼이다. 그걸 알면 누를 수 있다.
            *
            * ★ **근거가 보드마다 다르다.** 한 문장으로 뭉뚱그리면 한쪽에는 거짓말이다.
            *
            *     wish60  부트로더가 기록 주소를 하드코딩해 자기 자신을 못 덮는다.
            *             끊겨도 업데이트 모드로 남는다
            *     wish61  굽기 전에 원래 펌웨어를 따로 백업해 두고, 이미지가 깨져
            *             있으면 다음에 꽂을 때 거기서 되살린다
            */}
          <Note>
            {iapSpecOf(fwBoard).id === 'wish61'
              ? t(
                  'Your current firmware is backed up before the update. If the new one is broken, the board restores it the next time you plug it in.',
                )
              : t(
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

          {/*
            * ★ **"끝까지" 만 말하면 안 된다.**
            *
            *   보정할 때의 손힘이 곧 그 키의 mm 눈금을 정한다. 평소보다 세게 누르면
            *   눈금이 늘어나고, 그러면 정작 평소 타건이 전 행정에 못 미치는 것으로
            *   읽힌다. 실제로 그렇게 안내했다가 61키 스트로크가 10% 부풀었다.
            *
            *   그리고 칸이 찼다고 그 키가 끝난 것도 아니다 — 채워지는 문턱이 실측
            *   스트로크의 60% 안팎이다. "done" 이라고 부르면 대충 치고 넘어가게 된다.
            */}
          <Note>
            {active
              ? t(
                  'Press every key once, with your normal typing force. Do not press harder than usual — that depth becomes the millimetre scale. Keys that light up on the board above have been measured.',
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
                <PresetButton disabled={locked} onClick={() => applyPreset(p)}>
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
                value={num('pressUm') ?? 100}
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
                blank={locked}
                onChange={(v: number) => {
                  put('pressUm', v).catch(() => {});
                }}
                value2={num('releaseUm') ?? 50}
                onChange2={(v: number) => {
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

          {/*
            * 지금 눌린 거리 — 늘 보인다.
            *
            * ★ 키캡 숫자와 **역할이 다르다.**
            *
            *   키캡 쪽은 63개가 한꺼번에 보이는 지도라, 어느 키가 얼마나 눌렸는지를
            *   훑는 데 쓴다. 이 줄은 지금 튜닝 중인 키 하나를 **자와 같은 자리에서**
            *   읽는다 — 손잡이를 옮겨 가며 "1.00mm 가 내 손가락으로 어느 정도인가"를
            *   맞춰 보는 것이 이 화면의 일이다.
            *
            * ★ 고른 키가 있으면 그 키들만 본다 (deepest 가 선택을 따른다). 튜닝
            *   중인 키가 아니라 옆 키를 눌러서 값이 뜨면 헷갈린다.
            *
            * ★ 눌림 여부를 같이 찍는다. 거리만 보면 "이 깊이에서 실제로 입력이
            *   됐나" 를 모르는데, 입력지점을 맞추는 화면에서는 그게 핵심이다.
            *
            * 장치가 쉬는 구간을 0 으로 주므로 여기서 따로 자르지 않는다.
            */}
          <ControlRow>
            <Label>{t('Now')}</Label>
            <Detail>
              <Summary>
                {!tracking
                  ? t('press a key with live depth on')
                  : `${(deepest.um / 100).toFixed(2)} mm` +
                    (deepest.pressed ? `   ${t('pressed')}` : '')}
              </Summary>
            </Detail>
          </ControlRow>





        </>
      );
    }

    if (section === 'rapid') {
      const flags = num('rtFlags') ?? 0;
      const setFlag = (bit: number, on: boolean) => {
        const next = on ? flags | bit : flags & ~bit;
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
                disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
                value={num('rtReleaseUm') ?? 50}
                onChange={(v: number) => {
                  put('rtReleaseUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('rtReleaseUm'))}
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
                disabled={locked}
                value={num('rtPressUm') ?? 50}
                onChange={(v: number) => {
                  put('rtPressUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('rtPressUm'))}
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
                disabled={locked}
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
                disabled={locked}
                value={num('bottomUm') ?? 10}
                onChange={(v: number) => {
                  put('bottomUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('bottomUm'))}
              </Val>
            </Detail>
          </ControlRow>

          {/*
            * 키캡 표시가 무슨 뜻인지 한 줄 적어 둔다.
            *
            * 점 하나는 설명 없이 못 읽는다 — 글자 대신 모양을 고른 값을 여기서
            * 치른다. 대신 한 번 읽으면 63개를 한눈에 훑을 수 있다.
            */}
          <Note>{t('he.note.rtBadge')}</Note>
        </>
      );
    }

    if (section === 'deadzone') {
      /*
       * ★ 해제지점 위로는 못 올린다.
       *
       *   데드존은 "이보다 얕으면 안 본 걸로 친다" 는 규칙이라, 해제지점보다 깊어지면
       *   해제지점이 할 일이 없어진다 — 깊이가 이미 0 이 되어 그 전에 떼져 버린다.
       *   입력지점까지 넘기면 이번엔 입력지점을 덮어쓴다.
       *
       *   그러면 **화면의 숫자가 거짓이 된다.** 해제 0.50 이라고 적혀 있는데 실제로는
       *   데드존에서 떼지고, 입력 1.00 이라는데 데드존에서 눌린다. 값을 조용히 고치는
       *   대신 **애초에 그 자리에 못 가게** 막는다.
       *
       *   순서는 늘 이렇다 —  0 ≤ 데드존 ≤ 해제지점 < 입력지점
       *
       *   더 큰 데드존이 필요하면 해제지점을 먼저 올리면 된다. 두 값의 관계가 화면에서
       *   그대로 보이므로 무엇을 해야 하는지도 같이 보인다.
       */
      const deadMax = num('releaseUm') ?? 50;

      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.dead')}>{t('Dead Zone')}</Hint>
            </Label>
            <Detail>
              <AccentRange
                min={0}
                max={deadMax}
                disabled={locked}
                value={Math.min(num('deadUm') ?? 0, deadMax)}
                onChange={(v: number) => {
                  put('deadUm', v).catch(() => {});
                }}
              />
              <Val>
                {fmtMm(num('deadUm'))}
              </Val>
            </Detail>
          </ControlRow>

          <Note>{t('he.note.dead', {max: (deadMax / 100).toFixed(2)})}</Note>
        </>
      );
    }

    /*
     * CUSTOM — 스위치의 제원을 정하는 자리.
     *
     * ★ 키 선택과 무관하다. `locked` 를 안 건다.
     *
     *   여기서 고치는 것은 "이 슬롯이 어떤 스위치인가" 지 "이 키를 어떻게 할까" 가
     *   아니다. 키를 안 골랐다고 스위치 정의를 못 고칠 이유가 없다.
     */
    if (section === 'swcustom') {
      const cur = swDraft;
      const mm = cur.travelUm / 100;

      /*
       * 미리보기는 앱이 계산하지만, 장치도 같은 계산을 정수로 한다 (keysCurveBuild).
       * 실측으로 대조해 마디마다 32767 대비 17 안쪽 — 거리로 1.8µm 다.
       */
      const preview = heMakeCurve(cur.fluxRestGs, cur.fluxBottomGs, mm);

      const setDraft = (patch: Partial<HeSwCustom>) =>
        setSwDraft((d) => ({...d, ...patch}));

      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.swslot')}>{t('Slot')}</Hint>
            </Label>
            <Detail>
              <AccentSelect
                width={selRowW}
                value={
                  swSlotOptions.find((o) => o.value === swSlot) ?? null
                }
                options={swSlotOptions}
                onChange={(o: any) => setSwSlot(o?.value ?? 0)}
              />
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>{t('Name')}</Label>
            <Detail>
              <TextBox
                value={cur.name}
                maxLength={11}
                placeholder={`CUSTOM ${swSlot + 1}`}
                onChange={(e: any) => setDraft({name: e.target.value})}
              />
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>{t('Travel')}</Label>
            <Detail>
              <AccentRange
                min={200}
                max={500}
                value={cur.travelUm}
                onChange={(v: number) => setDraft({travelUm: v})}
              />
              <Val>{mm.toFixed(2)} mm</Val>
            </Detail>
          </ControlRow>

          {/*
            * 데이터시트 두 점.
            *
            * ★ 이 둘이면 곡선이 결정된다. 축상 자기장 식의 미지수가 둘인데 두 점의
            *   비를 잡으면 자석 세기가 약분되어 하나만 남는다. 그래서 심을 끼워
            *   재지 않아도 된다.
            *
            * ★ 모르면 0 으로 둔다. 짐작한 값을 넣으면 그게 실측인 척한다 — 그때는
            *   그 행정의 직선으로 읽는다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.fluxRest')}>{t('Initial Flux')}</Hint>
            </Label>
            <Detail>
              <NumBox
                value={cur.fluxRestGs}
                min={0}
                max={5000}
                onChange={(e: any) =>
                  setDraft({fluxRestGs: Math.max(0, +e.target.value | 0)})
                }
              />
              <Summary>&nbsp;Gs</Summary>
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.fluxBottom')}>{t('Bottom Flux')}</Hint>
            </Label>
            <Detail>
              <NumBox
                value={cur.fluxBottomGs}
                min={0}
                max={5000}
                onChange={(e: any) =>
                  setDraft({fluxBottomGs: Math.max(0, +e.target.value | 0)})
                }
              />
              <Summary>&nbsp;Gs</Summary>
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.curve')}>{t('ADC to distance')}</Hint>
            </Label>
            <Detail>
              <HeGraph curve={preview} travelMm={mm} u={null} />
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>{t('Save')}</Label>
            <Detail>
              <FwBtn disabled={swBusy} onClick={() => swSave()}>
                {t('Apply')}
              </FwBtn>
              <FwBtn onClick={() => swExport()}>{t('Export')}</FwBtn>
              <FwBtn onClick={() => swInput.current?.click()}>
                {t('Import')}
              </FwBtn>
              <input
                ref={swInput}
                type="file"
                accept=".json,application/json"
                style={{display: 'none'}}
                onChange={swImport}
              />
            </Detail>
          </ControlRow>

          {swMsg && <Note>{swMsg}</Note>}

          <Note>
            {preview
              ? t('he.note.curveOn', {err: preview.maxErrMm.toFixed(2)})
              : t('he.note.swLinear')}
          </Note>
        </>
      );
    }

    if (section === 'switch') {
      /*
       * ★ 종류도 **고른 키의 값**이다.
       *
       *   한 보드에 여러 종류를 꽂을 수 있어 sw_type 은 키별 값인데, 여기서만
       *   프로파일 전역값(cfg.switchType)을 직접 읽고 있었다 — 다른 줄은 다 선택을
       *   따르는데 이 줄만 아니어서, 한 키를 골라도 전역값이 뜬다.
       *
       *   고른 키가 없거나 서로 다르면 null 이다. 그때는 고를 것을 모르는 것이므로
       *   빈 칸으로 두고 행정도 `—` 로 둔다.
       */
      const swType = num('switchType');
      const known = swType !== null;
      const sw = known ? swInfoOf(swType) : null;

      /*
       * ★ 여기는 **고르고 보는 자리**다.
       *
       *   예전에는 일반형을 고르면 행정 슬라이더가 여기 붙었다. 그런데 스위치의
       *   제원을 정하는 일과 키에 스위치를 배정하는 일은 다른 일이다. 한 화면에
       *   섞여 있으니 "지금 이 슬라이더가 무엇을 바꾸나" 가 매번 헷갈렸다.
       *
       *   정하는 것은 CUSTOM 탭으로 옮겼다. 여기는 배정과 표시만 한다.
       */
      const travelUm = sw?.travelUm || travel;
      const travelMm = travelUm / 100;

      /*
       * 곡선은 데이터시트 두 점에서 계산한다. 두 점을 모르면 null 이고, 그때는
       * 그림에 직선만 그려진다 — 짐작한 곡선을 그려 두면 그게 실측인 척한다.
       *
       * ★ 장치도 같은 계산을 한다 (keysCurveBuild). 실측으로 대조해 두 마디마다
       *   32767 대비 17 안쪽, 거리로 1.8µm 다.
       */
      const curve = sw
        ? heMakeCurve(sw.fluxRestGs, sw.fluxBottomGs, travelMm)
        : null;

      /* 펌웨어의 깊이는 직선 환산이라 u 를 그대로 되돌릴 수 있다 (u = depth / travel) */
      /*
       * 문턱을 넘어야 "눌렸다" 로 본다. 안 그러면 손을 뗀 상태에서도 잡음이 0 과
       * 1~2 를 오가며 점과 글자가 깜빡인다.
       */
      const u =
        tracking && deepestAll.um >= HE_MM_MIN
          ? Math.min(1, deepestAll.um / travelUm)
          : null;

      const mmLin = u === null ? null : u * travelMm;
      const mmMod = u === null || !curve ? null : heCurveToMm(curve, u);

      return (
        <>
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.switch')}>{t('Type')}</Hint>
            </Label>
            <Detail>
              <AccentSelect
                width={selRowW}
                isDisabled={locked}
                /*
                 * ★ 배열 인덱스로 찾지 않는다.
                 *
                 *   커스텀은 비트 7 이 선 번호(0x80~)라 목록의 자리와 값이 다르다.
                 *   예전처럼 options[swType] 로 집으면 커스텀에서 엉뚱한 칸을 집는다.
                 */
                value={
                  known
                    ? (swOptions.find((o) => o.value === swType) ?? null)
                    : null
                }
                options={swOptions}
                onChange={(o: any) => {
                  const v = o?.value ?? 0;
                  put('switchType', v).catch(() => {});
                }}
              />
            </Detail>
          </ControlRow>

          {/*
            * 설정된 값을 보여주기만 한다 — 고치는 것은 CUSTOM 탭이다.
            */}
          <ControlRow>
            <Label>{t('Travel')}</Label>
            <Detail>
              <Summary>{known ? `${travelMm.toFixed(2)} mm` : '—'}</Summary>
            </Detail>
          </ControlRow>

          {/*
            * 가리킨 키에 무엇이 걸려 있나.
            *
            * ★ 키캡에는 행정만 찍는다. 1u 폭에 "Gateron Jade Pro" 가 안 들어가고,
            *   줄여 넣으면 7px 이 되어 안 읽힌다. 대신 판을 쓸면 여기서 읽힌다.
            */}
          <ControlRow>
            <Label>{t('Under cursor')}</Label>
            <Detail>
              <Summary>
                {hoverKey === null
                  ? '—'
                  : (() => {
                      const c = keyCfgs[hoverKey];

                      if (!c) return '—';
                      const s = swInfoOf(c.switchType);

                      if (!s) return `0x${c.switchType.toString(16)}`;
                      return (
                        <>
                          <SwDot
                            $c={badgeColor(
                              heSwBadgeColor(c.switchType) << 4,
                            )}
                          />
                          {s.name}
                          {'   '}
                          {(s.travelUm / 100).toFixed(2)} mm
                        </>
                      );
                    })()}
              </Summary>
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.flux')}>{t('Flux')}</Hint>
            </Label>
            <Detail>
              <Summary>
                {!known
                  ? '—'
                  : sw && sw.fluxRestGs > 0
                    ? `${sw.fluxRestGs} / ${sw.fluxBottomGs} Gs`
                    : t('he.flux.none')}
              </Summary>
            </Detail>
          </ControlRow>

          {/*
            * ★ 그림이 이 화면의 본론이다.
            *
            *   스위치를 고르는 것은 곧 "이 보드의 mm 를 무엇으로 재나" 를 정하는 일이다.
            *   숫자 한 줄로만 보여주면 고른 뜻이 안 드러난다. 눌러 보면서 점이 두 선
            *   사이에서 벌어지는 것을 보면 바로 안다.
            */}
          <ControlRow>
            <Label>
              <Hint tip={t('he.tip.curve')}>{t('ADC to distance')}</Hint>
            </Label>
            <Detail>
              <HeGraph curve={curve} travelMm={travelMm} u={u} />
            </Detail>
          </ControlRow>

          <ControlRow>
            <Label>{t('Now')}</Label>
            <Detail>
              <Summary>
                {/*
                  * ★ 곡선이 있는 종류면 **곡선 값이 곧 펌웨어 값**이다.
                  *
                  *   예전에는 펌웨어가 직선이라 "펌웨어 A / 모델 B" 로 나란히 놨다.
                  *   이제 펌웨어가 곡선을 쓰므로 그 이름이 거짓말이 된다. 지금 값을
                  *   앞에 두고, 직선은 얼마나 어긋나 있었는지 보여주는 참고로 뒤에 둔다.
                  */}
                {u === null
                  ? t('press a key with live depth on')
                  : mmMod === null
                    ? `u ${u.toFixed(3)}   ${mmLin!.toFixed(2)} mm`
                    : `u ${u.toFixed(3)}   ${mmMod.toFixed(2)} mm` +
                      `   (${t('he.curve.old')} ${mmLin!.toFixed(2)}, ` +
                      `${(mmLin! - mmMod).toFixed(2)})`}
              </Summary>
            </Detail>
          </ControlRow>

          <Note>
            {curve
              ? t('he.note.curveOn', {err: curve.maxErrMm.toFixed(2)})
              : t('he.note.curveOff')}
          </Note>
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
  if ((!device || !api) && !busy && !bootOnly) {
    return (
      <Content>
        <Note>{t('he.noDevice')}</Note>
        {/*
          * 여기 온 이유가 **부트로더에 멈춰 있어서**일 수 있다. 그런데 권한이 없으면
          * 그 보드는 어느 목록에도 안 나오므로, 앱은 "장치가 없다" 와 구분할 길이
          * 없다. 그래서 묻지 않고 길만 놓아 둔다.
          */}
        <Note>{t('he.bootConnect.hint')}</Note>
        <ControlRow>
          <Label>{t('Bootloader')}</Label>
          <Detail>
            <FwBtn onClick={() => bootConnect.connect()}>
              {t('Connect')}
            </FwBtn>
          </Detail>
        </ControlRow>
        {bootConnect.err && (
          <Note style={{color: '#d66'}}>{bootConnect.err}</Note>
        )}
      </Content>
    );
  }

  return (
    <ConfigureBasePane>
      {/*
        * ★ 여기서도 같은 자리에 띄운다.
        *
        *   프로파일은 어느 탭에 있든 "지금 몇 번" 이 보여야 한다. 이 탭에서 값을
        *   만지는 동안 그 값이 어느 프로파일에 들어가는지가 특히 중요하다 —
        *   정작 여기서만 안 보이면 앞뒤가 안 맞는다.
        *
        *   키맵 탭과 같은 좌표(오른끝에서 220px, 맨 위)를 쓰므로 탭을 오가도
        *   자리가 안 움직인다.
        */}
      <div style={{position: 'absolute', top: 50, left: 0, right: 0, pointerEvents: 'none'}}>
        <div style={{pointerEvents: 'all'}}>
          {/*
            * 키보드 이름 배지도 같이 둔다 — 어느 보드를 보고 있는지는 여기서도
            * 유효한 물음이고, 장치를 바꾸는 길이 탭마다 다르면 찾아 헤맨다.
            *
            * 레이어 버튼은 안 가져온다. HE 설정은 레이어와 무관하다 — 입력지점은
            * 스위치의 성질이지 그 키가 무슨 글자를 내느냐와 상관이 없다.
            */}
          <Badge />
          <ProfileSelect />
        </div>
      </div>
      <Grid style={{pointerEvents: 'none'}}>
        <MenuCell style={{pointerEvents: 'all'}}>
          <MenuContainer>
            {RAILS.filter((r) => !bootOnly || r.key === 'device').map((r) => (
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
            {SECTIONS.filter(
              (s) => s.rail === rail && (!bootOnly || s.key === 'firmware'),
            ).map((s) => (
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
        <CenteredOverflowCell style={{pointerEvents: 'all'}}>
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
            {/*
              * ★ 스위치 갈래도 키를 고른다.
              *
              *   스위치를 별도 갈래로 빼면서 이 줄이 같이 빠졌다. 그런데 스위치 종류와
              *   전 행정은 **키별 설정**이라(한 보드에 여러 종류를 꽂을 수 있다) 고를
              *   수단이 없으면 전 키에만 쓸 수 있다.
              */}
            {keyRail && section !== 'profile' && (
            <ControlRow>
              <Label>
                <Hint tip={t('he.tip.selection')}>
                  {/*
                    * 예전 라벨은 "전체 키" 였다. 빈 선택이 곧 전 키였을 때는 맞는
                    * 말이었지만, 이제는 **거짓말**이다 — 그 상태에서는 아무 데도
                    * 안 쓴다.
                    */}
                  {selectedKeys.length === 0
                    ? t('No keys selected')
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
            {bootOnly && <Note>{t('he.bootOnly')}</Note>}
            {renderSection()}
          </Content>
        </CenteredOverflowCell>
      </Grid>
    </ConfigureBasePane>
  );
};
