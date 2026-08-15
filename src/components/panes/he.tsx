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
 * ★ 화면 구조는 Test 탭을 따른다.
 *
 *   Configure 탭 위의 키보드 그림은 그 탭 안에 있는 게 아니라 전역 렌더 레이어다
 *   (그래서 ConfigureBasePane 이 투명하고 pointer-events 가 none 이다). 여기로
 *   끌어오려면 렌더 레이어의 라우트 게이팅을 건드려야 하고, 끌어와도 우리가 그리는
 *   깊이 배치와 겹친다. 그래서 전체 높이 그리드인 Test 탭 구조를 쓴다.
 *
 *   3단이다 — 아이콘 레일 / 하위 메뉴 / 내용. 지금은 트래킹·액추에이션·스위치뿐이지만
 *   래피드 트리거·데드존·보정이 뒤따르므로 SECTIONS 에 한 줄 더하면 늘어난다.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import styled from 'styled-components';
import {useAppSelector} from 'src/store/hooks';
import {getSelectedRawLayer} from 'src/store/keymapSlice';
import {getSelectedKeyDefinitions} from 'src/store/definitionsSlice';
import {getBasicKeyToByte} from 'src/store/definitionsSlice';
import {getLabelForByte} from 'src/utils/key';
import {useTranslation} from 'react-i18next';
import {getSelectedTheme} from 'src/store/settingsSlice';
import {getDarkenedColor} from 'src/utils/color-math';
import {KeyColorType} from '@the-via/reader';
import {
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {Pane} from './pane';
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
  faRulerVertical,
  faToggleOn,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';
import {AccentButton} from '../inputs/accent-button';
import {AccentSlider} from '../inputs/accent-slider';
import {MenuTooltip} from '../inputs/tooltip';
import {AccentRange} from '../inputs/accent-range';
import {AccentSelect} from '../inputs/accent-select';
import {MenuContainer} from './configure-panes/custom/menu-generator';
import {
  HE_SWITCH_NAMES,
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
} from 'src/utils/he-api';

/* 1 키유닛을 픽셀로. geo 는 1/4 유닛이라 4로 나눈다. */
const U = 62;

/*
 * 하위 메뉴. 아직 펌웨어 로직이 없는 것은 disabled 로 두되 **보이게** 한다 —
 * 앞으로 무엇이 오는지 알 수 있고, 로직이 생기면 플래그만 내리면 된다.
 */
const SECTIONS = [
  {key: 'tracking', label: 'LIVE TRACKING', icon: faWaveSquare},
  {key: 'actuation', label: 'ACTUATION', icon: faArrowDownUpAcrossLine},
  {key: 'switch', label: 'SWITCH', icon: faToggleOn},
  {
    key: 'rapid',
    label: 'RAPID TRIGGER',
    icon: faBolt,
    todo: 'firmware logic comes first',
  },
  {
    key: 'deadzone',
    label: 'DEAD ZONE',
    icon: faCircleHalfStroke,
    todo: 'firmware logic comes first',
  },
  {
    key: 'calibrate',
    label: 'CALIBRATION',
    icon: faRulerVertical,
    todo: 'porting the CLI keys cal flow',
  },
] as const;

/*
 * 아이콘 레일은 큰 갈래를, 가운데 열은 그 안의 항목을 고른다. 지금은 갈래가
 * 하나(HE)뿐이라 레일에 항목 하나를 두고, 갈래가 늘면 여기에 더한다.
 */
const RAILS = [{key: 'he', title: 'Hall Effect', icon: faWaveSquare}] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

const SWITCH_OPTIONS = HE_SWITCH_NAMES.map((label, value) => ({label, value}));

/*
 * 프리셋. 슬라이더 세 개를 모르는 사람도 바로 쓸 수 있게 한다.
 *
 * 첫 줄은 8편에서 정한 펌웨어 기본값과 같다 — 상용 웹툴의 "처음 사용자용" 과도
 * 같은 값이라 기준으로 삼기 좋다.
 */
const PRESETS = [
  {label: 'Beginner', press: 100, release: 50},
  {label: 'Adaptive', press: 50, release: 20},
  {label: 'Advanced', press: 30, release: 10},
] as const;

/*
 * Test 탭과 같은 전체 높이 판.
 *
 * 키보드 이름 뱃지는 두지 않는다. Configure 의 뱃지는 공유 캔버스 위에 떠 있는데,
 * 그건 ConfigureBasePane 이 캔버스 영역까지 덮고 있어서 가능하다. 우리 판은 그
 * 아래에서 시작하므로 같은 뱃지를 넣으면 화면 한가운데에 떠서 어색하다.
 */
const HeBasePane = styled(Pane)`
  position: relative;
  flex-direction: column;
`;

/*
 * 배치 영역의 배경.
 *
 * 다른 탭은 공유 캔버스가 그리는 그라데이션 위에 키보드를 얹는다. HE 탭은 그
 * 캔버스를 숨기므로(우리 배치와 겹친다) 같은 그라데이션을 여기서 직접 그린다.
 *
 * 한때 이걸 뺐는데, 겹쳐 보였던 원인은 그라데이션이 아니라 케이스였다 — 스플릿
 * 백스페이스 소켓까지 다 그리느라 케이스 오른쪽에 빈 공간이 크게 남았다. 레이아웃
 * 옵션을 반영하면서 케이스가 키에 딱 맞게 되어 겹쳐 보이지 않는다.
 */
const BoardArea = styled.div<{$accent: string}>`
  align-self: stretch;
  margin: -18px -24px 4px;
  padding: 24px;
  display: flex;
  justify-content: center;
  overflow-x: auto;
  background: ${(p) =>
    `linear-gradient(30deg, rgba(150,150,150,1) 10%, ${getDarkenedColor(
      p.$accent,
    )} 50%, rgba(150,150,150,1) 90%)`};
`;

/* 키보드 케이스 */
const Case = styled.div<{$accent: string}>`
  display: inline-block;
  border-radius: 8px;
  padding: 9px;
  background: ${(p) => p.$accent};
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
`;

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

const Board = styled.div`
  position: relative;
  margin: 20px auto;
`;

const KeyBox = styled.div<{$pressed: boolean; $bg: string}>`
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 5px;
  background: ${(p) => p.$bg};
  overflow: hidden;
  padding: 4px 6px;
  color: var(--color_label);
  /*
   * 눌림은 테두리로 알린다.
   *
   * 처음에는 막대와 같은 강조색이라 둘이 겹쳐 보였다. 막대를 초록으로 바꾸면서
   * 색이 갈렸고, 그래서 테두리는 "눌렸다", 막대는 "얼마나 눌렸다" 로 역할이
   * 나뉜다.
   */
  outline: ${(p) => (p.$pressed ? '2px solid var(--color_accent)' : 'none')};
  outline-offset: -2px;
`;

/*
 * 키캡 채움. 위에서 아래로 차오른다 — 키가 내려가는 방향과 같다.
 */
const Fill = styled.div<{$ratio: number}>`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: ${(p) => Math.min(100, p.$ratio * 100)}%;
  background: rgba(86, 224, 90, 0.55);
`;

/*
 * 입력지점 눈금.
 *
 * 기본으로 끈다 — 64키에 전부 선이 그어지면 배치가 지저분해진다. 액추에이션을
 * 맞출 때만 켜서 본다.
 */
const Tick = styled.div<{$at: number}>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${(p) => Math.min(100, p.$at * 100)}%;
  height: 1px;
  background: rgba(255, 209, 102, 0.9);
`;

/* 글자는 채움 위에 얹는다 */
const KeyText = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
`;

/* 이름은 좌상단, 값은 우하단 — 상용 웹툴과 같은 배치다 */
const Name = styled.div`
  font-size: 13px;
  line-height: 1.1;
  color: var(--color_label-highlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Val = styled.div`
  align-self: flex-end;
  font-size: 13px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--color_label-highlighted);
`;

const Dim = styled(Val)`
  font-size: 10px;
  opacity: 0.4;
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

  const [section, setSection] = useState<SectionKey>('tracking');
  const [layout, setLayout] = useState<HeKeyGeo[]>([]);
  const [info, setInfo] = useState<HeTrackInfo | null>(null);
  const [state, setState] = useState<HeKeyState[]>([]);
  const [tracking, setTracking] = useState(false);
  const [cfg, setCfg] = useState<HeSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  /*
   * 임계값 눈금은 기본으로 끈다.
   *
   * 64키에 전부 선이 그어지면 배치가 지저분해진다. 액추에이션을 실제로 맞출 때만
   * 켜서 보면 되는 정보다.
   */
  const [showTick, setShowTick] = useState(false);

  /*
   * 키 이름은 키맵에서 온다 — 숫자만 있으면 어느 키인지 세어봐야 한다.
   *
   * ★ getSelectedKeymap 이 아니라 원본 레이어를 쓴다.
   *   그쪽은 **키 정의 순서**로 늘어놓은 배열이라 (row, col) 로 못 찾는다.
   *   원본 레이어는 EEPROM 배치 그대로라 row * cols + col 이 통한다.
   */
  const rawLayer = useAppSelector(getSelectedRawLayer);

  /*
   * ★ 배치는 VIA 의 키 정의를 쓴다.
   *
   *   펌웨어에서도 읽을 수 있지만(0xC2), 그건 소켓을 전부 담고 있어 스플릿
   *   백스페이스처럼 "둘 중 하나만 끼우는" 자리가 다 보인다. VIA 의 정의는 선택한
   *   레이아웃 옵션에 맞는 키만 주고 위치도 제자리로 옮겨준다.
   *
   *   펌웨어 읽기는 정의가 없을 때의 대비책으로 남겨둔다.
   */
  const viaKeys = useAppSelector(getSelectedKeyDefinitions);

  /* 배경·케이스 색을 다른 탭과 같은 테마에서 가져온다 */
  const theme = useAppSelector(getSelectedTheme);
  const accentColor = (theme as any)[KeyColorType.Accent].c;
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
    return () => {
      alive = false;
    };
  }, [api, send]);

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

  const label = (i: number) => {
    const byte = rawLayer?.keymap?.[i];
    if (byte === undefined) return '';
    return getLabelForByte(byte, 300, basicKeyToByte, byteToKey) ?? '';
  };

  const renderBoard = () => {
    /*
     * VIA 정의가 있으면 그걸 쓰고, 없으면 펌웨어에서 읽은 배치로 돌아간다.
     * VIA 쪽은 레이아웃 옵션(스플릿 백스페이스 등)을 이미 반영한 좌표를 준다.
     */
    const keys = viaKeys.length
      ? viaKeys.map((k: any) => ({
          x: k.x,
          y: k.y,
          w: k.w,
          h: k.h,
          row: k.row,
          col: k.col,
        }))
      : layout.map((k) => ({
          x: k.x / 4,
          y: k.y / 4,
          w: k.w / 4,
          h: k.h / 4,
          row: k.row,
          col: k.col,
        }));

    if (!keys.length) return <Note>{t('he.layout.error')}</Note>;

    const width = Math.max(...keys.map((k) => k.x + k.w)) * U;
    const height = Math.max(...keys.map((k) => k.y + k.h)) * U;

    return (
      <BoardArea $accent={accentColor}>
        <Case $accent={accentColor}>
          <Board style={{width, height}}>
          {keys.map((k) => {
            const i = k.row * 8 + k.col;
            const s = state[i];
            return (
              <KeyBox
                key={`${k.row},${k.col}`}
                $pressed={!!s?.pressed}
                $bg={(theme as any)[KeyColorType.Alpha].c}
                style={{
                  left: k.x * U,
                  top: k.y * U,
                  width: k.w * U - 4,
                  height: k.h * U - 4,
                }}
              >
                {/*
                  * 키캡 전체가 게이지다.
                  *
                  * 옆에 가는 막대를 두면 64키를 한눈에 훑을 때 잘 안 보인다.
                  * 키캡이 통째로 차오르면 멀리서도 어느 키가 얼마나 눌렸는지
                  * 바로 읽힌다.
                  */}
                <Fill $ratio={s ? s.depth / travel : 0} />
                {showTick && cfg && <Tick $at={cfg.pressUm / travel} />}
                <KeyText>
                  <Name>{label(i)}</Name>
                  <Val>{s ? (s.depth / 100).toFixed(2) : '—'}</Val>
                  <Dim>{s ? s.raw : ''}</Dim>
                </KeyText>
              </KeyBox>
            );
            })}
          </Board>
        </Case>
      </BoardArea>
    );
  };

  const renderSection = () => {
    const todo = SECTIONS.find((s) => s.key === section) as {todo?: string};
    if (todo?.todo) {
      return <Note>{t('Not yet')} — {t(todo.todo)}</Note>;
    }

    if (section === 'tracking') {
      return (
        <>
          <ControlRow>
            <Label>{t('Live Depth')}</Label>
            <Detail>
              <AccentButton onClick={tracking ? stop : start}>
                {tracking ? t('Stop') : t('Start')}
              </AccentButton>
            </Detail>
          </ControlRow>
          {info && (
            <ControlRow>
              <Label>{t('Status')}</Label>
              <Detail>
                {info.keyCount} {t('keys')} · {(travel / 100).toFixed(2)} mm{' '}
                {t('travel')}
                {tracking && ` · ${fps} ${t('snapshots/s')}`}
              </Detail>
            </ControlRow>
          )}
          <ControlRow>
            <Label>{t('Show Actuation Line')}</Label>
            <Detail>
              <AccentSlider
                isChecked={showTick}
                onChange={setShowTick}
              />
            </Detail>
          </ControlRow>
          {err && <Err>{err}</Err>}
          <Note>
            {t('he.tracking.note')}
          </Note>
        </>
      );
    }

    if (section === 'actuation') {
      const applyPreset = (p: (typeof PRESETS)[number]) => {
        setCfg((c) => (c ? {...c, pressUm: p.press, releaseUm: p.release} : c));
        /* 해제가 입력보다 얕아야 하므로 해제를 먼저 내린다 */
        heSetRelease(send, p.release)
          .then(() => heSetPress(send, p.press))
          .catch(() => {});
      };

      return (
        <>
          <ControlRow>
            <Label>{t('Preset')}</Label>
            <Detail>
              {PRESETS.map((p) => (
                <AccentButton
                  key={p.label}
                  style={{marginLeft: 8}}
                  onClick={() => applyPreset(p)}
                >
                  {t(p.label)}
                </AccentButton>
              ))}
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Actuation Point')}</Label>
            <Detail>
              <AccentRange
                min={10}
                max={travel}
                value={cfg?.pressUm ?? 100}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, pressUm: v} : c));
                  heSetPress(send, v).catch(() => {});
                }}
              />
              <span style={{marginLeft: 12}}>
                {((cfg?.pressUm ?? 100) / 100).toFixed(2)} mm
              </span>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Release Point')}</Label>
            <Detail>
              <AccentRange
                min={10}
                max={travel}
                value={cfg?.releaseUm ?? 50}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, releaseUm: v} : c));
                  heSetRelease(send, v).catch(() => {});
                }}
              />
              <span style={{marginLeft: 12}}>
                {((cfg?.releaseUm ?? 50) / 100).toFixed(2)} mm
              </span>
            </Detail>
          </ControlRow>
          <Note>
            {t('he.actuation.note')}
          </Note>
        </>
      );
    }

    if (section === 'switch') {
      return (
        <>
          <ControlRow>
            <Label>{t('Type')}</Label>
            <Detail>
              <AccentSelect
                value={SWITCH_OPTIONS[cfg?.switchType ?? 0]}
                options={SWITCH_OPTIONS}
                onChange={(o: any) => {
                  const v = o?.value ?? 0;
                  setCfg((c) => (c ? {...c, switchType: v} : c));
                  heSetSwitch(send, v).catch(() => {});
                }}
              />
            </Detail>
          </ControlRow>
          <Note>
            {t('he.switch.note')}
          </Note>
        </>
      );
    }

    return null;
  };

  if (!device || !api) {
    return (
      <Content>
        <Note>{t('he.noDevice')}</Note>
      </Content>
    );
  }

  return (
    <HeBasePane>
      <Grid style={{minHeight: 0}}>
        <MenuCell style={{pointerEvents: 'all'}}>
          <MenuContainer>
            {RAILS.map((r) => (
              <Row key={r.key} $selected={true}>
                <IconContainer>
                  <FontAwesomeIcon icon={r.icon} />
                  <MenuTooltip>{t(r.title)}</MenuTooltip>
                </IconContainer>
              </Row>
            ))}
          </MenuContainer>
        </MenuCell>
        <SubmenuOverflowCell>
          <MenuContainer>
            {SECTIONS.map((s) => (
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
        <OverflowCell>
          <Content>
            {/*
              * 배치는 어느 하위 메뉴를 보든 위에 있다. 액추에이션을 조정하면서
              * 결과를 바로 봐야 하기 때문이다.
              *
              * ★ 그리드 밖으로 빼지 않는다. 밖에 두면 좌우 메뉴가 그만큼 짧아져
              *   다른 탭과 높이가 어긋난다.
              */}
            {renderBoard()}
            {renderSection()}
          </Content>
        </OverflowCell>
      </Grid>
    </HeBasePane>
  );
};
