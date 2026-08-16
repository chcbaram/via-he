/*
 * he-api.ts — 홀이펙트 확장 프로토콜
 *
 * 채널이 둘이다.
 *
 *   0xFF60  설정 채널. VIA 가 이미 열어 둔 장치를 그대로 쓴다 (KeyboardAPI.hidCommand)
 *   0xFF61  스트리밍. 장치가 트래킹 프레임만 밀어낸다. 여기서 따로 연다
 *
 * 나눈 이유는 VIA 가 "명령을 보내면 다음 IN 리포트가 그 응답"이라고 가정하기 때문이다.
 * 트래킹 프레임이 같은 채널로 나가면 그 사이에 끼어 짝이 어긋난다.
 */

/* 설정 채널 명령 — VIA 가 쓰지 않는 0xC0 대 */
export const HE_CMD_INFO = 0xc0;

/*
 * 보드 정보 — [1..] 이름, [16..] 버전. 둘 다 NUL 종료.
 *
 * 버전은 **고정 자리**다. 이름 뒤에 이어 붙이면 이름 길이가 바뀔 때 밀린다.
 */
const HE_INFO_VER_OFF = 16;

export async function heReadInfo(
  send: HidSender,
): Promise<{board: string; version: string}> {
  const r = await send(HE_CMD_INFO, []);
  const str = (from: number, to: number) => {
    let out = '';
    for (let i = from; i < to && r[i]; i++) out += String.fromCharCode(r[i]);
    return out;
  };
  return {board: str(1, HE_INFO_VER_OFF), version: str(HE_INFO_VER_OFF, r.length)};
}
export const HE_CMD_RESET = 0xc1;
export const HE_CMD_LAYOUT = 0xc2;
export const HE_CMD_TRACK = 0xc3;

/* 스트리밍 프레임 태그 */
export const HE_EVT_TRACK = 0xc4;

export const HE_TRACK_USAGE_PAGE = 0xff61;
export const HE_TRACK_USAGE = 0x61;

/* 트래킹 프레임 헤더 : [0]태그 [1]첫키 [2]개수 [3]전체 */
const HDR = 4;
/* 레이아웃 응답에서 항목이 시작하는 자리 : [0]명령 [1]에코 [2]개수 */
const LAYOUT_OFF = 3;
const PRESSED_BIT = 0x8000;

export type HeKeyGeo = {
  /* 1/4 키유닛 */
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  col: number;
};

export type HeKeyState = {
  raw: number;
  /* 0.01mm */
  depth: number;
  pressed: boolean;
};

export type HeTrackInfo = {
  keyCount: number;
  perFrame: number;
  /* 전 행정 (0.01mm). 막대를 몇 mm 짜리로 그릴지 정한다 */
  travel: number;
};

type HidSender = (command: number, bytes: number[]) => Promise<number[]>;

/*
 * 물리 배치를 장치에서 읽는다.
 *
 * 정의 JSON 에도 같은 정보가 있지만, 이쪽은 **펌웨어가 실제로 들고 있는 값**이다.
 * 정의 파일이 없거나 낡았어도 그려진다.
 *
 * 전체 개수를 응답에 싣지 않는다 — 끝을 넘겨 물으면 개수 0 이 오므로 그때까지
 * 인덱스를 늘린다.
 */
export async function heReadLayout(send: HidSender): Promise<HeKeyGeo[]> {
  const out: HeKeyGeo[] = [];
  let idx = 0;

  for (let guard = 0; guard < 64; guard++) {
    /* 응답: [0]=명령 [1]=시작 인덱스(에코) [2]=개수 [3..]=항목 */
    const r = await send(HE_CMD_LAYOUT, [idx]);
    const n = r[2];
    if (!n) break;

    for (let k = 0; k < n; k++) {
      const o = LAYOUT_OFF + k * 6;
      out.push({
        x: r[o],
        y: r[o + 1],
        w: r[o + 2],
        h: r[o + 3],
        row: r[o + 4],
        col: r[o + 5],
      });
    }
    idx += n;
  }
  return out;
}

/* 트래킹을 켜고 끈다. 켤 때 키 수와 전 행정을 같이 받는다. */
export async function heSetTracking(
  send: HidSender,
  on: boolean,
): Promise<HeTrackInfo> {
  const r = await send(HE_CMD_TRACK, [on ? 1 : 0]);
  return {
    keyCount: r[2],
    perFrame: r[3],
    travel: (r[4] | (r[5] << 8)) || 400,
  };
}

/*
 * 스트리밍 채널.
 *
 * VIA 의 장치 목록에는 없다 (usage page 가 다르다). WebHID 로 직접 연다.
 * 사용자 제스처 안에서 requestDevice() 를 부르거나, 이미 권한이 있으면
 * getDevices() 로 조용히 찾을 수 있다.
 */
export class HeTrackChannel {
  private device: HIDDevice | null = null;
  private state: HeKeyState[] = [];
  private onFrame: (() => void) | null = null;

  /* 이미 권한이 있는 장치 중에서 찾는다. 없으면 null */
  static async find(
    vendorId: number,
    productId: number,
  ): Promise<HIDDevice | null> {
    const devices = await navigator.hid.getDevices();
    return (
      devices.find(
        (d) =>
          d.vendorId === vendorId &&
          d.productId === productId &&
          d.collections.some(
            (c) =>
              c.usagePage === HE_TRACK_USAGE_PAGE && c.usage === HE_TRACK_USAGE,
          ),
      ) ?? null
    );
  }

  /* 권한이 없으면 사용자에게 묻는다. 반드시 클릭 같은 제스처 안에서 불러야 한다. */
  static async request(
    vendorId: number,
    productId: number,
  ): Promise<HIDDevice | null> {
    const got = await navigator.hid.requestDevice({
      filters: [
        {vendorId, productId, usagePage: HE_TRACK_USAGE_PAGE, usage: HE_TRACK_USAGE},
      ],
    });
    return got[0] ?? null;
  }

  async open(device: HIDDevice, keyCount: number) {
    this.device = device;
    this.state = new Array(keyCount).fill(null).map(() => ({
      raw: 0,
      depth: 0,
      pressed: false,
    }));

    if (!device.opened) await device.open();
    device.addEventListener('inputreport', this.handleReport);
  }

  async close() {
    if (!this.device) return;
    this.device.removeEventListener('inputreport', this.handleReport);
    this.device = null;
  }

  setOnFrame(fn: (() => void) | null) {
    this.onFrame = fn;
  }

  getState(): HeKeyState[] {
    return this.state;
  }

  /*
   * 프레임은 첫 키 인덱스를 달고 오므로 순서가 어긋나거나 몇 개 빠져도 제자리에
   * 들어간다. 호스트가 순서 맞추기용 상태를 들 필요가 없다.
   */
  private handleReport = (e: HIDInputReportEvent) => {
    const d = new DataView(e.data.buffer);
    if (d.byteLength < HDR) return;
    if (d.getUint8(0) !== HE_EVT_TRACK) return;

    const start = d.getUint8(1);
    const n = d.getUint8(2);

    for (let k = 0; k < n; k++) {
      const o = HDR + k * 4;
      if (o + 3 >= d.byteLength) break;

      const i = start + k;
      if (i >= this.state.length) continue;

      const raw = d.getUint16(o, true);
      const um = d.getUint16(o + 2, true);
      this.state[i] = {
        raw,
        depth: um & ~PRESSED_BIT,
        pressed: (um & PRESSED_BIT) !== 0,
      };
    }

    /* 한 바퀴 돌면 한 장이 완성된 것으로 본다 */
    if (start + n >= this.state.length) this.onFrame?.();
  };
}


/*
 * HE 설정 — VIA 의 커스텀 값 명령을 그대로 쓴다.
 *
 * 메뉴를 정의 JSON 에 두지 않았을 뿐, 프로토콜은 VIA 표준이다. 그래서 펌웨어
 * (via_port.c)는 메뉴를 어디에 그리든 똑같이 동작한다.
 */
export const VIA_CUSTOM_SET = 0x07;
export const VIA_CUSTOM_GET = 0x08;

export const HE_CHANNEL = 16;

/* 전부 0.01mm. 플래그와 스위치 종류만 8비트다. */
export const HE_VAL_PRESS = 1;
export const HE_VAL_RELEASE = 2;
export const HE_VAL_SWITCH = 3;
export const HE_VAL_RT_PRESS = 4;    /* RT 재입력 */
export const HE_VAL_RT_RELEASE = 5;  /* RT 입력 해제 */
export const HE_VAL_BOTTOM = 6;      /* 바닥 보호 */
export const HE_VAL_DEAD = 7;        /* 데드존 */
export const HE_VAL_RT_FLAGS = 8;

/* keys.c 의 KEYS_RT_* 와 같은 비트 */
export const HE_RT_ON = 1 << 0;
export const HE_RT_BOTTOM = 1 << 1;
export const HE_RT_CONT = 1 << 2;

export type HeSettings = {
  pressUm: number;
  releaseUm: number;
  switchType: number;
  rtPressUm: number;
  rtReleaseUm: number;
  bottomUm: number;
  deadUm: number;
  rtFlags: number;
};

export async function heGetSettings(send: HidSender): Promise<HeSettings> {
  const rd16 = async (id: number) => {
    const r = await send(VIA_CUSTOM_GET, [HE_CHANNEL, id]);
    return (r[3] << 8) | r[4];       /* VIA 는 빅엔디안 */
  };
  const rd8 = async (id: number) => {
    const r = await send(VIA_CUSTOM_GET, [HE_CHANNEL, id]);
    return r[3];
  };

  return {
    pressUm: await rd16(HE_VAL_PRESS),
    releaseUm: await rd16(HE_VAL_RELEASE),
    switchType: await rd8(HE_VAL_SWITCH),
    rtPressUm: await rd16(HE_VAL_RT_PRESS),
    rtReleaseUm: await rd16(HE_VAL_RT_RELEASE),
    bottomUm: await rd16(HE_VAL_BOTTOM),
    deadUm: await rd16(HE_VAL_DEAD),
    rtFlags: await rd8(HE_VAL_RT_FLAGS),
  };
}

/* 0.01mm 값 하나를 쓴다 — VIA 는 빅엔디안 */
async function wr16(send: HidSender, id: number, um: number) {
  await send(VIA_CUSTOM_SET, [HE_CHANNEL, id, (um >> 8) & 0xff, um & 0xff]);
}

export const heSetRtPress = (s: HidSender, um: number) =>
  wr16(s, HE_VAL_RT_PRESS, um);
export const heSetRtRelease = (s: HidSender, um: number) =>
  wr16(s, HE_VAL_RT_RELEASE, um);
export const heSetBottom = (s: HidSender, um: number) =>
  wr16(s, HE_VAL_BOTTOM, um);
export const heSetDead = (s: HidSender, um: number) =>
  wr16(s, HE_VAL_DEAD, um);

export async function heSetRtFlags(send: HidSender, flags: number) {
  await send(VIA_CUSTOM_SET, [HE_CHANNEL, HE_VAL_RT_FLAGS, flags & 0xff]);
}

export async function heSetPress(send: HidSender, um: number) {
  await send(VIA_CUSTOM_SET, [HE_CHANNEL, HE_VAL_PRESS, (um >> 8) & 0xff, um & 0xff]);
}

export async function heSetRelease(send: HidSender, um: number) {
  await send(VIA_CUSTOM_SET, [HE_CHANNEL, HE_VAL_RELEASE, (um >> 8) & 0xff, um & 0xff]);
}

export async function heSetSwitch(send: HidSender, type: number) {
  await send(VIA_CUSTOM_SET, [HE_CHANNEL, HE_VAL_SWITCH, type]);
}

/*
 * 스위치 종류표 — HID 0xC6. **장치에서 읽는다.**
 *
 * 앞의 genericCnt 개가 일반형이고 그 뒤가 제원을 아는 제품이다. 자기 스위치를
 * 알면 제품을 고르는 쪽이 언제나 낫다 — 전 행정이 정확해야 mm 표시가 맞는다.
 * 일반형 4.0mm 로 두고 실제가 3.4mm 였을 때 모든 mm 가 18% 어긋났다.
 *
 * ★ 여기 표를 박아 두면 안 된다.
 *
 *   설정은 **번호**로 저장된다. 펌웨어에 스위치를 하나 추가하면 그 뒤 번호가 전부
 *   밀리는데, 도구가 옛 목록을 들고 있으면 사용자가 고른 것과 다른 스위치가 걸린다.
 *   그러면 전 행정이 달라져 모든 mm 표시가 조용히 어긋난다.
 *
 *   응답 [1]=에코 [2]=전체 개수 [3]=일반형 개수 [4..5]=전 행정 [6..]=이름(NUL 종료)
 */
export const HE_CMD_SWITCH = 0xc6;

export type HeSwitch = {name: string; travelUm: number};

export type HeSwitchTable = {
  list: HeSwitch[];
  genericCnt: number;
};

export async function heReadSwitches(
  send: HidSender,
): Promise<HeSwitchTable> {
  const head = await send(HE_CMD_SWITCH, [0]);
  const total = head[2];
  const genericCnt = head[3];
  const list: HeSwitch[] = [];

  for (let i = 0; i < total && i < 64; i++) {
    const r = i === 0 ? head : await send(HE_CMD_SWITCH, [i]);
    /* NUL 까지가 이름이다. send 는 number[] 를 주므로 바이트를 직접 잇는다. */
    let name = '';
    for (let k = HE_SWITCH_NAME_OFF; k < r.length && r[k]; k++) {
      name += String.fromCharCode(r[k]);
    }
    list.push({name, travelUm: r[4] | (r[5] << 8)});
  }
  return {list, genericCnt};
}

const HE_SWITCH_NAME_OFF = 6;


/*
 * 키별 설정 — HID 0xC5.
 *
 * VIA 커스텀 채널은 [채널, 값 ID] 두 바이트뿐이라 키 인덱스를 실을 자리가 없다.
 * 그래서 전역은 그쪽으로, 키별은 이쪽으로 나눠 쓴다.
 *
 *   읽기  [C5] [00] [idx]            -> 머리 3바이트 + 값 19바이트
 *   쓰기  [C5] [01] [idx] [값 14바이트]
 *
 * idx 가 키 수를 넘으면 전 키에 적용된다 — "모두 선택"이 왕복 한 번이다.
 */
export const HE_CMD_KEYCFG = 0xc5;
export const HE_KEYCFG_GET = 0x00;
export const HE_KEYCFG_SET = 0x01;
export const HE_KEY_ALL = 0xff;

const KC_OFF = 3;

export type HeKeyCfg = {
  pressUm: number;
  releaseUm: number;
  rtPressUm: number;
  rtReleaseUm: number;
  bottomUm: number;
  deadUm: number;
  rtFlags: number;
  switchType: number;
  /* 읽기 전용 — 이 키의 mm 환산 기준 */
  strokeCnt: number;
  travelUm: number;
  calibrated: boolean;
};

const le16 = (r: number[], o: number) => r[o] | (r[o + 1] << 8);

export async function heReadKeyCfg(
  send: HidSender,
  idx: number,
): Promise<HeKeyCfg> {
  const r = await send(HE_CMD_KEYCFG, [HE_KEYCFG_GET, idx]);
  return {
    pressUm: le16(r, KC_OFF + 0),
    releaseUm: le16(r, KC_OFF + 2),
    rtPressUm: le16(r, KC_OFF + 4),
    rtReleaseUm: le16(r, KC_OFF + 6),
    bottomUm: le16(r, KC_OFF + 8),
    deadUm: le16(r, KC_OFF + 10),
    rtFlags: r[KC_OFF + 12],
    switchType: r[KC_OFF + 13],
    strokeCnt: le16(r, KC_OFF + 14),
    travelUm: le16(r, KC_OFF + 16),
    calibrated: (r[KC_OFF + 18] & 1) !== 0,
  };
}

export async function heWriteKeyCfg(
  send: HidSender,
  idx: number,
  c: HeKeyCfg,
): Promise<void> {
  const w = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  await send(HE_CMD_KEYCFG, [
    HE_KEYCFG_SET,
    idx,
    ...w(c.pressUm),
    ...w(c.releaseUm),
    ...w(c.rtPressUm),
    ...w(c.rtReleaseUm),
    ...w(c.bottomUm),
    ...w(c.deadUm),
    c.rtFlags,
    c.switchType,
  ]);
}


/*
 * 보정 — HID 0xC7.
 *
 * ★ 보정은 두 가지인데 여기서 다루는 것은 **바닥값 하나뿐이다.**
 *
 *   무압 기준값(안 누른 상태)은 펌웨어의 러닝 최대값이 늘 추적하므로 손댈 일이
 *   없다. 누른 채 전원을 넣어도 손을 떼면 제 값을 찾는다. 반면 바닥값은 실제로
 *   끝까지 눌러야만 알 수 있어서 사람이 한 번씩 눌러 줘야 한다.
 *
 *   안 해도 키보드는 동작한다 — 스위치 종류표의 공칭 행정으로 돈다. 하면 키별
 *   실측으로 바뀌어 mm 표시가 정확해진다 (이 보드 키별 편차가 13% 였다).
 */
export const HE_CMD_CAL = 0xc7;

export const HE_CAL_STATUS = 0;
export const HE_CAL_START = 1;
export const HE_CAL_SAVE = 2;
export const HE_CAL_CANCEL = 3;

export const HE_CAL_STROKE = 4;

const HE_CAL_MAP_OFF = 8;

/* 행정 응답의 값 자리. 펌웨어의 HID_CAL_STROKE_OFF 와 같아야 한다 */
const HE_CAL_STROKE_OFF = 4;

export type HeCalState = {
  active: boolean;
  done: number;
  total: number;
  saveOk: number;
  skipped: number;
  keys: number[];      /* 끝난 키의 매트릭스 인덱스 */
};

function parseCal(r: number[]): HeCalState {
  const keys: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (r[HE_CAL_MAP_OFF + (i >> 3)] & (1 << (i & 7))) keys.push(i);
  }
  return {
    active: r[2] === 1,
    done: r[3],
    total: r[4],
    saveOk: r[5],
    skipped: r[6],
    keys,
  };
}

/*
 * 지금까지 모인 행정을 키별로 읽는다 (카운트). 0 = 아직 못 잰 키.
 *
 * ★ 보정 중에는 keyCfg 를 읽어도 소용없다.
 *
 *   이번에 모으는 값은 저장할 때까지 펌웨어의 cfg 에 들어가지 않는다. keyCfg 로
 *   읽으면 **저장돼 있던 옛 값**이 나와서, 누르는 대로 갱신되는 것처럼 보이지도
 *   않고 옛 값이 새 값인 척한다. 전용 통로로 진행 중인 값을 받는다.
 *
 * 한 프레임에 다 안 들어가 나눠 묻는다. 프레임마다 몇 개를 채웠는지 알려주므로
 * 그만큼씩 전진한다 — 개수를 도구에 상수로 박으면 펌웨어와 갈라진다.
 */
export async function heCalStrokes(send: HidSender): Promise<number[]> {
  const out: number[] = [];

  for (let start = 0; start < 64; ) {
    const r = await send(HE_CMD_CAL, [HE_CAL_STROKE, start]);
    const n = r[3];
    if (!n) break;
    for (let i = 0; i < n; i++) {
      out[start + i] =
        r[HE_CAL_STROKE_OFF + i * 2] | (r[HE_CAL_STROKE_OFF + i * 2 + 1] << 8);
    }
    start += n;
  }
  return out;
}

export async function heCalStatus(send: HidSender): Promise<HeCalState> {
  return parseCal(await send(HE_CMD_CAL, [HE_CAL_STATUS]));
}

export async function heCalStart(send: HidSender): Promise<HeCalState> {
  return parseCal(await send(HE_CMD_CAL, [HE_CAL_START]));
}

export async function heCalCancel(send: HidSender): Promise<HeCalState> {
  return parseCal(await send(HE_CMD_CAL, [HE_CAL_CANCEL]));
}

/*
 * 저장은 플래시를 쓴다. 펌웨어가 ISR 이 아니라 메인 루프에서 처리하므로 요청 직후
 * 응답에는 결과가 아직 안 들어 있다 — 한 번 더 물어야 saveOk 가 채워진다.
 */
export async function heCalSave(send: HidSender): Promise<HeCalState> {
  await send(HE_CMD_CAL, [HE_CAL_SAVE]);
  await new Promise((r) => setTimeout(r, 60));
  return heCalStatus(send);
}


/*
 * 설정 내보내기·가져오기.
 *
 * ★ 키별 설정만 담는다. 보정값은 담지 않는다.
 *
 *   보정은 **이 보드의 이 스위치를 잰 값**이다. 다른 보드에 부어 넣으면 그 보드가
 *   자기 것이 아닌 기울기로 mm 를 계산한다 — 눈에 안 보이면서 모든 값이 틀어지는
 *   가장 나쁜 종류의 오류다. 보정은 그 보드에서 다시 해야 한다.
 *
 *   설정(입력지점·RT·데드존)은 취향이라 옮겨도 된다. 그것을 옮기려고 만드는 것이다.
 *
 * ★ 보드 이름을 같이 적는다.
 *
 *   키 인덱스가 곧 매트릭스 자리라 배치가 다른 보드에 부으면 엉뚱한 키에 들어간다.
 *   막을 수 있는 것은 막는다.
 */
export const HE_BACKUP_KIND = 'wish60-he/settings';
export const HE_BACKUP_VER = 1;

export type HeBackup = {
  kind: string;
  version: number;
  board: string;
  firmware: string;
  date: string;
  /* 매트릭스 인덱스 -> 그 키의 설정. 없는 키는 건드리지 않는다 */
  keys: Record<number, HeKeyCfg>;
};

export function heMakeBackup(
  board: string,
  firmware: string,
  date: string,
  keys: Record<number, HeKeyCfg>,
): HeBackup {
  return {kind: HE_BACKUP_KIND, version: HE_BACKUP_VER, board, firmware, date, keys};
}

/*
 * 받은 것이 우리 파일이 맞는지 본다.
 *
 * 틀리면 무엇이 틀렸는지 말한다 — "잘못된 파일" 하나로 뭉뚱그리면 사용자가 고칠
 * 길이 없다.
 */
export function heCheckBackup(o: any, board: string): string | null {
  if (!o || typeof o !== 'object') return 'not a settings file';
  if (o.kind !== HE_BACKUP_KIND) return 'not a settings file';
  if (o.version !== HE_BACKUP_VER) return `unsupported version ${o.version}`;
  if (board && o.board && o.board !== board) {
    return `saved from ${o.board}, this is ${board}`;
  }
  if (!o.keys || typeof o.keys !== 'object') return 'no keys in the file';
  return null;
}


/*
 * 프로파일 — HID 0xC8.
 *
 * 설정 한 벌을 통째로 갈아 끼운다. **보정값은 공유한다** — 보정은 보드를 잰 값이라
 * 프로파일마다 들고 있으면 63키를 네 번 눌러야 한다.
 */
export const HE_CMD_PROF = 0xc8;

export const HE_PROF_STATUS = 0;
export const HE_PROF_SET = 1;
export const HE_PROF_COPY = 2;

export type HeProf = {active: number; count: number};

const parseProf = (r: number[]): HeProf => ({active: r[2], count: r[3]});

export async function heProfGet(send: HidSender): Promise<HeProf> {
  return parseProf(await send(HE_CMD_PROF, [HE_PROF_STATUS]));
}

export async function heProfSet(
  send: HidSender,
  idx: number,
): Promise<HeProf> {
  return parseProf(await send(HE_CMD_PROF, [HE_PROF_SET, idx]));
}

export async function heProfCopy(
  send: HidSender,
  dst: number,
): Promise<HeProf> {
  return parseProf(await send(HE_CMD_PROF, [HE_PROF_COPY, dst]));
}


/*
 * ── HID 왕복을 한 줄로 세운다 ────────────────────────────────────────────
 *
 * ★ 화면 하나가 아니라 **앱 전체**가 한 줄이어야 한다.
 *
 *   HID 는 요청 하나에 응답 하나다. 두 곳에서 동시에 보내면 응답이 엇갈려 VIA 가
 *   "Receiving incorrect response" 로 잡고, 그 오류가 쌓이면 진짜 오류를 못 본다.
 *
 *   HE 화면 안에서만 세워 두었더니, 상단의 프로파일 선택처럼 화면 밖에서 말하는
 *   자리가 생기자 곧바로 겹칠 수 있게 됐다. 줄 세우기를 이 파일로 올려 누가 부르든
 *   같은 줄에 서게 한다.
 *
 *   앞이 실패해도 뒤는 돈다 — 한 번의 실패로 앱이 멎으면 안 된다.
 */
let heGate: Promise<unknown> = Promise.resolve();

export function heMakeSend(api: {
  hidCommand: (cmd: number, bytes: number[]) => Promise<any>;
}): HidSender {
  return (cmd: number, bytes: number[]) => {
    const run = heGate.then(
      () => api.hidCommand(cmd, bytes),
      () => api.hidCommand(cmd, bytes),
    );
    heGate = run.catch(() => {});
    return run;
  };
}
