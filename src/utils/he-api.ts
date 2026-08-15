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

const HDR = 4;
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
    const r = await send(HE_CMD_LAYOUT, [idx]);
    const n = r[3];
    if (!n) break;

    for (let k = 0; k < n; k++) {
      const o = HDR + k * 6;
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
export const HE_VAL_PRESS = 1;    /* 입력지점 0.01mm */
export const HE_VAL_RELEASE = 2;  /* 해제지점 0.01mm */
export const HE_VAL_SWITCH = 3;   /* 스위치 종류 */

export type HeSettings = {
  pressUm: number;
  releaseUm: number;
  switchType: number;
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
  };
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

export const HE_SWITCH_NAMES = ['generic 4.0mm', 'generic 3.5mm', 'generic 3.0mm'];
