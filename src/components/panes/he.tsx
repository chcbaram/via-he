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
import React, {useCallback, useEffect, useRef, useState} from 'react';
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
  HE_SWITCHES,
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
  HE_RT_ON,
  HE_RT_BOTTOM,
  HE_RT_CONT,
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
  {key: 'rapid', label: 'RAPID TRIGGER', icon: faBolt},
  {key: 'deadzone', label: 'DEAD ZONE', icon: faCircleHalfStroke},
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

/*
 * 이름 뒤에 전 행정을 같이 찍는다. 자기 스위치를 아는 사람은 제품을 골라야 mm 가
 * 맞는다 — 일반형 4.0mm 로 두고 실제가 3.4mm 였을 때 모든 mm 가 18% 어긋났다.
 */
const SWITCH_OPTIONS = HE_SWITCHES.map((s, value) => ({
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
  min-width: 68px;
  flex: 0 0 auto;
  text-align: right;
  font-variant-numeric: tabular-nums;
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

  const [section, setSection] = useState<SectionKey>('tracking');
  const [layout, setLayout] = useState<HeKeyGeo[]>([]);
  const [info, setInfo] = useState<HeTrackInfo | null>(null);
  const [state, setState] = useState<HeKeyState[]>([]);
  const [tracking, setTracking] = useState(false);
  const [cfg, setCfg] = useState<HeSettings | null>(null);
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

  /*
   * 어느 키의 깊이를 보여줄 것인가.
   *
   * 키를 골라 설정하는 UI 가 아직 없으므로 **가장 깊이 눌린 키**를 쓴다. 아무 키나
   * 눌러도 막대가 서므로 눈금을 맞추는 데는 충분하다. 키 선택이 들어오면 고른 키로
   * 바꾼다.
   */
  const deepest = state.reduce(
    (best, k) => (k && k.depth > best.um ? {um: k.depth, pressed: k.pressed} : best),
    {um: 0, pressed: false},
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
          {err && <Err>{err}</Err>}
          <Note>
            {t('he.tracking.note')}
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
        /* 해제가 입력보다 얕아야 하므로 해제를 먼저 내린다 */
        heSetRelease(send, p.release)
          .then(() => heSetPress(send, p.press))
          .then(() => heSetRtPress(send, p.rt))
          .then(() => heSetRtRelease(send, p.rt))
          .catch(() => {});
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
                  {t('Actuation')} {(p.press / 100).toFixed(2)}
                  {'  ·  '}
                  {t('Release')} {(p.release / 100).toFixed(2)}
                  {'  ·  '}
                  {t('Re-press')} {(p.rt / 100).toFixed(2)} mm
                </PresetVals>
              </Detail>
            </ControlRow>
          ))}
          <ControlRow>
            <Label>{t('Live Depth')}</Label>
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
            <Label>{t('Actuation Point')}</Label>
            <Detail>
              <DepthSlider
                value={cfg?.pressUm ?? 100}
                travelUm={travel}
                depthUm={tracking ? deepest.um : null}
                pressed={deepest.pressed}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, pressUm: v} : c));
                  heSetPress(send, v).catch(() => {});
                }}
              />
              <Val>
                {((cfg?.pressUm ?? 100) / 100).toFixed(2)} mm
              </Val>
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
              <Val>
                {((cfg?.releaseUm ?? 50) / 100).toFixed(2)} mm
              </Val>
            </Detail>
          </ControlRow>
          <Note>
            {t('he.actuation.note')}
          </Note>
        </>
      );
    }

    if (section === 'rapid') {
      const flags = cfg?.rtFlags ?? 0;
      const setFlag = (bit: number, on: boolean) => {
        const next = on ? flags | bit : flags & ~bit;
        setCfg((c) => (c ? {...c, rtFlags: next} : c));
        heSetRtFlags(send, next).catch(() => {});
      };

      return (
        <>
          <ControlRow>
            <Label>{t('Rapid Trigger')}</Label>
            <Detail>
              <AccentSlider
                isChecked={(flags & HE_RT_ON) !== 0}
                onChange={(v: boolean) => setFlag(HE_RT_ON, v)}
              />
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Continuous')}</Label>
            <Detail>
              <AccentSlider
                isChecked={(flags & HE_RT_CONT) !== 0}
                onChange={(v: boolean) => setFlag(HE_RT_CONT, v)}
              />
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Re-press Distance')}</Label>
            <Detail>
              <AccentRange
                min={10}
                max={100}
                value={cfg?.rtPressUm ?? 50}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, rtPressUm: v} : c));
                  heSetRtPress(send, v).catch(() => {});
                }}
              />
              <Val>
                {((cfg?.rtPressUm ?? 50) / 100).toFixed(2)} mm
              </Val>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Release Distance')}</Label>
            <Detail>
              <AccentRange
                min={10}
                max={100}
                value={cfg?.rtReleaseUm ?? 50}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, rtReleaseUm: v} : c));
                  heSetRtRelease(send, v).catch(() => {});
                }}
              />
              <Val>
                {((cfg?.rtReleaseUm ?? 50) / 100).toFixed(2)} mm
              </Val>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Bottom Protection')}</Label>
            <Detail>
              <AccentSlider
                isChecked={(flags & HE_RT_BOTTOM) !== 0}
                onChange={(v: boolean) => setFlag(HE_RT_BOTTOM, v)}
              />
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Bottom Zone')}</Label>
            <Detail>
              <AccentRange
                min={0}
                max={50}
                value={cfg?.bottomUm ?? 10}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, bottomUm: v} : c));
                  heSetBottom(send, v).catch(() => {});
                }}
              />
              <Val>
                {((cfg?.bottomUm ?? 10) / 100).toFixed(2)} mm
              </Val>
            </Detail>
          </ControlRow>
          <Note>{t('he.rapid.note')}</Note>
          <Note>{t('he.bottom.note')}</Note>
        </>
      );
    }

    if (section === 'deadzone') {
      return (
        <>
          <ControlRow>
            <Label>{t('Dead Zone')}</Label>
            <Detail>
              <AccentRange
                min={0}
                max={50}
                value={cfg?.deadUm ?? 0}
                onChange={(v: number) => {
                  setCfg((c) => (c ? {...c, deadUm: v} : c));
                  heSetDead(send, v).catch(() => {});
                }}
              />
              <Val>
                {((cfg?.deadUm ?? 0) / 100).toFixed(2)} mm
              </Val>
            </Detail>
          </ControlRow>
          <Note>{t('he.deadzone.note')}</Note>
        </>
      );
    }

    if (section === 'switch') {
      return (
        <>
          <ControlRow>
            <Label>{t('Type')}</Label>
            <Detail>
              {/*
                * ★ width 는 감싸는 상자가 아니라 이 prop 이 정한다.
                *   AccentSelect 안쪽 control 스타일이
                *   width: state.selectProps.width || 250 이라 부모 폭을 무시한다.
                *   상자로 감싸도 250px 로 잘리던 이유다.
                */}
              <AccentSelect
                width={330}
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
    <ConfigureBasePane>
      <Grid style={{pointerEvents: 'none'}}>
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
        <SubmenuOverflowCell style={{pointerEvents: 'all'}}>
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
        <OverflowCell style={{pointerEvents: 'all'}}>
          <Content>
            {renderSection()}
          </Content>
        </OverflowCell>
      </Grid>
    </ConfigureBasePane>
  );
};
