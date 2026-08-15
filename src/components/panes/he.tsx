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
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import styled from 'styled-components';
import {useAppSelector} from 'src/store/hooks';
import {
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {Pane} from './pane';
import {AccentButton} from '../inputs/accent-button';
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
const U = 54;

const Container = styled(Pane)`
  padding: 16px 24px;
  overflow: auto;
`;

const Board = styled.div`
  position: relative;
  margin: 24px auto;
`;

const KeyBox = styled.div<{$pressed: boolean}>`
  position: absolute;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid var(--color_dark-grey);
  background: var(--bg_control);
  overflow: hidden;
  font-size: 11px;
  line-height: 1.25;
  color: var(--color_label);
  padding: 3px 5px;
  outline: ${(p) => (p.$pressed ? '2px solid var(--color_accent)' : 'none')};
`;

/*
 * 깊이 막대. 상용 디버깅 화면이 키 왼쪽에 세로 막대를 두는 것과 같은 모양이다.
 * 값 두 줄(mm / 원시값)은 오른쪽 정렬로 겹치지 않게 둔다.
 */
const Bar = styled.div<{$ratio: number}>`
  position: absolute;
  left: 0;
  bottom: 0;
  width: 5px;
  height: ${(p) => Math.min(100, p.$ratio * 100)}%;
  background: var(--color_accent);
  transition: height 40ms linear;
`;

const Val = styled.div`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const Dim = styled(Val)`
  opacity: 0.5;
`;

const Bar2 = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const Section = styled.div`
  border-top: 1px solid var(--color_dark-grey);
  margin-top: 20px;
  padding-top: 14px;
`;

const Title = styled.div`
  font-size: 13px;
  letter-spacing: 0.08em;
  opacity: 0.7;
  margin-bottom: 10px;
`;

const Field = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 14px;

  > span:first-child {
    width: 120px;
    opacity: 0.8;
  }
  > input[type='range'] {
    width: 260px;
  }
  > b {
    font-variant-numeric: tabular-nums;
    width: 70px;
  }
`;

const Note = styled.div`
  opacity: 0.6;
  font-size: 13px;
  margin-top: 8px;
`;

export const HePane: React.FC = () => {
  const device = useAppSelector(getSelectedConnectedDevice);
  const api = useAppSelector(getSelectedKeyboardAPI);

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
      if (!api) throw new Error('장치가 없다');
      return api.hidCommand(cmd, bytes);
    },
    [api],
  );

  /* 배치는 장치에서 읽는다 — 정의 파일이 없어도 그려진다 */
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
        setErr('스트리밍 채널 접근이 거부됐다 (usage page 0xFF61)');
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

  if (!device || !api) {
    return (
      <Container>
        <Note>키보드를 연결하면 여기에 홀이펙트 화면이 나온다.</Note>
      </Container>
    );
  }

  const travel = info?.travel ?? 400;
  const width = Math.max(...layout.map((k) => k.x + k.w), 0) * (U / 4);
  const height = Math.max(...layout.map((k) => k.y + k.h), 0) * (U / 4);

  return (
    <Container>
      <Bar2>
        {tracking ? (
          <AccentButton onClick={stop}>트래킹 정지</AccentButton>
        ) : (
          <AccentButton onClick={start}>라이브 트래킹</AccentButton>
        )}
        {info && (
          <Note>
            키 {info.keyCount}개 · 전 행정 {(travel / 100).toFixed(2)}mm
            {tracking && ` · ${fps} 스냅샷/s`}
          </Note>
        )}
      </Bar2>

      {err && <Note style={{color: 'var(--color_error)'}}>{err}</Note>}

      <Section>
        <Title>액추에이션</Title>
        <Field>
          <span>입력지점</span>
          <input
            type="range"
            min={10}
            max={travel}
            value={cfg?.pressUm ?? 100}
            onChange={(e) => {
              const v = +e.target.value;
              setCfg((c) => (c ? {...c, pressUm: v} : c));
              heSetPress(send, v).catch(() => {});
            }}
          />
          <b>{((cfg?.pressUm ?? 100) / 100).toFixed(2)} mm</b>
        </Field>
        <Field>
          <span>해제지점</span>
          <input
            type="range"
            min={10}
            max={travel}
            value={cfg?.releaseUm ?? 50}
            onChange={(e) => {
              const v = +e.target.value;
              setCfg((c) => (c ? {...c, releaseUm: v} : c));
              heSetRelease(send, v).catch(() => {});
            }}
          />
          <b>{((cfg?.releaseUm ?? 50) / 100).toFixed(2)} mm</b>
        </Field>
        <Field>
          <span>스위치</span>
          <select
            value={cfg?.switchType ?? 0}
            onChange={(e) => {
              const v = +e.target.value;
              setCfg((c) => (c ? {...c, switchType: v} : c));
              heSetSwitch(send, v).catch(() => {});
            }}
          >
            {HE_SWITCH_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Note>
          해제지점은 입력지점보다 얕아야 한다 — 펌웨어가 그렇게 되도록 잘라낸다.
          지금은 전 키 공통이고, 키별 조정은 13편에서 붙인다.
        </Note>
      </Section>

      <Board style={{width, height}}>
        {layout.map((k) => {
          const i = k.row * 8 + k.col;
          const s = state[i];
          const ratio = s ? s.depth / travel : 0;
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
              <Bar $ratio={ratio} />
              <Val>{s ? (s.depth / 100).toFixed(2) : '—'}</Val>
              <Dim>{s ? s.raw : ''}</Dim>
            </KeyBox>
          );
        })}
      </Board>

      {!layout.length && (
        <Note>
          배치를 읽지 못했다. 이 화면은 펌웨어가 들고 있는 배치를 그대로 쓴다
          (명령 0xC2).
        </Note>
      )}
    </Container>
  );
};
