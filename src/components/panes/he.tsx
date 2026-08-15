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
import {MenuTooltip} from '../inputs/tooltip';
import {Badge} from './configure-panes/badge';
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
const U = 52;

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

/* Test 탭과 같은 전체 높이 판. 키보드 이름 뱃지가 위에 얹힌다. */
const HeBasePane = styled(Pane)`
  position: relative;
`;

/*
 * 내용은 가운데로 모은다. ControlRow 가 max-width 960px 이라 좁은 창에서는 꽉 차고
 * 넓은 창에서는 가운데 정렬된다 — Test 탭과 같은 모양이다.
 */
const Content = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 12px 12px 24px;
`;

const Board = styled.div`
  position: relative;
  margin: 20px auto;
`;

const KeyBox = styled.div<{$pressed: boolean}>`
  position: absolute;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid var(--border_color_cell);
  background: var(--bg_control);
  overflow: hidden;
  font-size: 11px;
  line-height: 1.2;
  color: var(--color_label);
  padding: 3px 5px 3px 9px;
  outline: ${(p) => (p.$pressed ? '2px solid var(--color_accent)' : 'none')};
`;

/*
 * 깊이 막대. 상용 디버깅 화면이 키 왼쪽에 세로 막대를 두는 것과 같은 모양인데,
 * 칸을 더 쓰지 않으려고 값 위에 겹쳐 그린다.
 */
const Bar = styled.div<{$ratio: number}>`
  position: absolute;
  left: 0;
  bottom: 0;
  width: 5px;
  height: ${(p) => Math.min(100, p.$ratio * 100)}%;
  background: var(--color_accent);
`;

const Val = styled.div`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const Dim = styled(Val)`
  opacity: 0.45;
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
        setErr('Streaming channel access denied (usage page 0xFF61)');
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

  const renderBoard = () => {
    const width = Math.max(...layout.map((k) => k.x + k.w), 0) * (U / 4);
    const height = Math.max(...layout.map((k) => k.y + k.h), 0) * (U / 4);

    if (!layout.length) {
      return (
        <Note>
          Could not read the layout. This view uses the layout the firmware
          holds, not the definition file (command 0xC2).
        </Note>
      );
    }

    return (
      <Board style={{width, height}}>
        {layout.map((k) => {
          const i = k.row * 8 + k.col;
          const s = state[i];
          return (
            <KeyBox
              key={`${k.row},${k.col}`}
              $pressed={!!s?.pressed}
              style={{
                left: (k.x * U) / 4,
                top: (k.y * U) / 4,
                width: (k.w * U) / 4 - 3,
                height: (k.h * U) / 4 - 3,
              }}
            >
              <Bar $ratio={s ? s.depth / travel : 0} />
              <Val>{s ? (s.depth / 100).toFixed(2) : '—'}</Val>
              <Dim>{s ? s.raw : ''}</Dim>
            </KeyBox>
          );
        })}
      </Board>
    );
  };

  const renderSection = () => {
    const todo = SECTIONS.find((s) => s.key === section) as {todo?: string};
    if (todo?.todo) {
      return <Note>Not yet — {todo.todo}</Note>;
    }

    if (section === 'tracking') {
      return (
        <>
          <ControlRow>
            <Label>Live Depth</Label>
            <Detail>
              <AccentButton onClick={tracking ? stop : start}>
                {tracking ? 'Stop' : 'Start'}
              </AccentButton>
            </Detail>
          </ControlRow>
          {info && (
            <ControlRow>
              <Label>Status</Label>
              <Detail>
                {info.keyCount} keys · {(travel / 100).toFixed(2)} mm travel
                {tracking && ` · ${fps} snapshots/s`}
              </Detail>
            </ControlRow>
          )}
          {err && <Err>{err}</Err>}
          {renderBoard()}
          <Note>
            Top number is press depth in mm, bottom is the raw ADC value. The
            left bar shows depth against full travel, and a highlighted border
            means the firmware has decided the key is pressed.
          </Note>
        </>
      );
    }

    if (section === 'actuation') {
      return (
        <>
          <ControlRow>
            <Label>Actuation Point</Label>
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
            <Label>Release Point</Label>
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
            Release must be shallower than actuation — the firmware clamps it.
            These are global for now; per-key values come with rapid trigger.
          </Note>
        </>
      );
    }

    if (section === 'switch') {
      return (
        <>
          <ControlRow>
            <Label>Type</Label>
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
            Nominal travel used to convert uncalibrated keys to mm. Once
            calibrated, the per-key measurement takes over.
          </Note>
        </>
      );
    }

    return null;
  };

  if (!device || !api) {
    return (
      <Content>
        <Note>Connect a keyboard to see hall effect controls.</Note>
      </Content>
    );
  }

  return (
    <HeBasePane>
      <Badge />
      <Grid>
        <MenuCell style={{pointerEvents: 'all'}}>
          <MenuContainer>
            {RAILS.map((r) => (
              <Row key={r.key} $selected={true}>
                <IconContainer>
                  <FontAwesomeIcon icon={r.icon} />
                  <MenuTooltip>{r.title}</MenuTooltip>
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
                {s.label}
              </SubmenuRow>
            ))}
          </MenuContainer>
        </SubmenuOverflowCell>
        <OverflowCell>
          <Content>{renderSection()}</Content>
        </OverflowCell>
      </Grid>
    </HeBasePane>
  );
};
