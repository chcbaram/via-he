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
 * 스위치 종류표 — keys.c 의 keys_switch[] 와 순서가 같아야 한다.
 *
 * 앞의 GENERIC_CNT 개가 일반형이고 그 뒤가 제원을 아는 제품이다. 자기 스위치를
 * 알면 제품을 고르는 쪽이 언제나 낫다 — 전 행정이 정확해야 mm 표시가 맞는다.
 * 일반형 4.0mm 로 두고 실제가 3.4mm 였을 때 모든 mm 가 18% 어긋났다.
 *
 * ★ 장치에서 읽어오는 쪽이 옳다. 지금은 양쪽에 같은 표가 있어 어긋날 수 있다 —
 *   배치(heReadLayout)처럼 HID 로 받아오는 것을 다음에 넣는다.
 */
export const HE_SWITCH_GENERIC_CNT = 3;

export const HE_SWITCHES = [
  {name: 'generic 4.0mm', travelUm: 400},
  {name: 'generic 3.5mm', travelUm: 350},
  {name: 'generic 3.0mm', travelUm: 300},
  {name: 'GEON RAW HE', travelUm: 340},
];

export const HE_SWITCH_NAMES = HE_SWITCHES.map((s) => s.name);


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
