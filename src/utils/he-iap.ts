/*
 * he-iap.ts — 브라우저에서 펌웨어 굽기 (WebHID)
 *
 * ★★ **부트로더가 보드마다 다르다.** 신원도 프로토콜도 공유하지 않는다.
 *
 *     wish60-he   534B:4102 / 0xFF53   자체 프로토콜 (START·DATA·FLUSH·END, 4KB 페이지)
 *     wish61-he   1CA6:300B / 0xFFB0   벤더 IAP     (주소를 실어 보내는 56B 청크)
 *
 *   그래서 보드마다 서술자(IapSpec)를 두고 굽는 쪽은 그걸 받아 쓴다. 예전에는
 *   wish60 것을 상수로 박아 두었는데, 그 상태로 wish61 을 꽂고 업데이트를 누르면
 *   **진입 명령만 먹고 부트로더에 갇혔다** — 0xFF60 으로 보낸 점프는 통해서 App1
 *   헤더를 지우고 리셋하는데, 그 뒤로 영영 534B:4102 를 기다렸다.
 *
 * ★ 벽돌이 되지 않는다 — 둘 다.
 *
 *   wish60 의 부트로더는 기록 주소를 0x80020000 으로 하드코딩해 자기 자신을 덮어쓸
 *   수 없다. wish61 은 한술 더 떠서, 벤더 IAP 가 굽기 전에 App1 을 App2 로 백업해
 *   두고 이미지가 깨져 있으면 다음 부팅에 거기서 되살린다. 게다가 devid 를 검사해
 *   다른 제품의 이미지를 아예 거부한다.
 *
 *   그래서 진행 중 오류를 조용히 삼키지 않고 그대로 올린다 — 사용자가 다시 누르면
 *   되는 상황이라 감출 이유가 없다.
 *
 * ★ 채널을 오간다.
 *
 *   앱   usage page 0xFF60, 32 B — "부트로더로 가라" 만 보낸다 (두 보드 공통)
 *   부트 보드마다 위 표대로                — 실제 기록
 *
 *   그 사이에 장치가 **다시 열거된다.** 권한은 VID/PID 단위라 유지되지만 인터페이스
 *   구성이 바뀌므로 getDevices() 로 다시 찾아야 한다.
 *
 * 참조 구현은 각각 `tools/iap_update.py`(wish60)와 `tools/flash.py`(wish61)다.
 */

/* ── wish60-he 부트로더 (534B:4102 / 0xFF53) ──────────────────────────── */
const W60_USAGE_PAGE = 0xff53;

/*
 * ★ 부트로더는 VID/PID 가 앱과 **완전히 다르다.**
 *
 *     앱        0483:5304   usage page 0xFF60
 *     부트로더   534B:4102   usage page 0xFF53
 *
 *   벤더 부트로더가 자기 것을 쓰기 때문이다. 앱의 VID/PID 로 찾으면 영영 못 찾는다 —
 *   실제로 그렇게 짰다가 "부트로더 기다리는 중" 에서 멈췄고, 권한 창에도 우리 보드가
 *   안 나왔다. `tools/iap_update.py` 는 vid/pid 를 0(아무거나)으로 두고 usage page
 *   로만 찾아서 이 사실이 드러나지 않았다.
 */
const W60_VID = 0x534b;
const W60_PID = 0x4102;

/*
 * 선택 창에 부트로더를 올리는 필터.
 *
 * 여기(`iapRequest`)와 VIA 의 "장치 승인"(`shims/node-hid.ts`)이 같이 쓴다. 뒤쪽에도
 * 넣는 이유는 **막다른 길을 막기 위해서**다 — 부트로더 상태로 앱을 켠 사람이 늘
 * 누르던 "장치 승인" 을 눌렀을 때도 보드가 목록에 보여야 한다. 고른 장치는 VIA 의
 * 키보드 필터(usagePage 0xFF60)에서 걸러져 목록에는 안 들어가고, 남는 것은 권한이다.
 * 그 권한을 다음 `iapFind()` 가 주워서 HE 탭이 돌아온다.
 */
const W60_FILTER = {
  vendorId: W60_VID,
  productId: W60_PID,
  usagePage: W60_USAGE_PAGE,
};

const W60_CMD_DATA = 0x80;
const W60_CMD_START = 0x81;
const W60_CMD_FLUSH = 0x82;
const W60_CMD_END = 0x83;
const W60_RSP_TAG = 0x85;

const W60_REPORT_LEN = 64;
const W60_PAYLOAD_OFF = 4; /* [0]=cmd [1]=len [2..3]=미사용 [4..]=데이터 */
const W60_PAYLOAD_MAX = W60_REPORT_LEN - W60_PAYLOAD_OFF;
const W60_PAGE_SIZE = 4096; /* IAP 내부 페이지 버퍼 */

/* ── wish61-he 부트로더 = 벤더 IAP (1CA6:300B / 0xFFB0) ───────────────── */

/*
 * ★ **벤더 앱과 부트로더가 같은 신원을 쓴다.**
 *
 *   wish60 은 부트로더의 VID/PID 가 앱과 아예 달라서, 그 채널이 보이면 곧 부트로더다.
 *   여기는 그렇지 않다 — 순정 "AE61 Pro" 앱도 1CA6:300B 의 0xFFB0 을 그대로 갖는다.
 *   그래서 **채널이 보인다는 것만으로 부트로더라고 단정하면 안 되고**, `01 02` 로
 *   물어봐야 한다.
 */
const W61_VID = 0x1ca6;
const W61_PID = 0x300b;
const W61_USAGE_PAGE = 0xffb0;
const W61_REPORT_LEN = 64;
const W61_FILTER = {
  vendorId: W61_VID,
  productId: W61_PID,
  usagePage: W61_USAGE_PAGE,
};

/*
 * 프로토콜 — 리포트 ID 0, IN/OUT 각 64 B
 *
 *     08 01                                   AppToBoot
 *     08 02  addr(LE32) len(LE16) data(<=56)  Flash
 *     08 03                                   ValiDate   resp[2] === 1 이면 성공
 *     08 04                                   BootToApp
 *     01 02                                   장치 정보  t[16] === 255 면 부트 모드
 *
 * 제약 (IAP 핸들러 역추적 + 실측 일치)
 *   - 청크 최대 56 B
 *   - addr 은 **파일 오프셋 0 부터 순차**여야 한다. IAP 가 다음 기대 주소를 들고
 *     있고 어긋나면 거부한다. 임의 주소 쓰기는 불가능하다
 *   - 쓰기 대상은 0x80020000 + addr, 4KB 경계마다 소거된다
 */
const W61_CHUNK = 56;
const W61_FLASH_FAIL = 0x0fff;
const W61_BOOT_MODE = 255;
const W61_MAGIC = [0xa5, 0x5a, 0xaf, 0xbe]; /* 0xBEAF5AA5 (LE) */

/*
 * 한 번 보내고 한 번 받는다.
 *
 * ★ 응답을 명령으로 골라 받는다. wish60 쪽 주석과 같은 이유다 — 다른 리포트가
 *   끼어들 수 있어서 먼저 온 것을 그대로 믿으면 안 된다. 여기는 태그 대신 앞 두
 *   바이트(명령·부명령)가 그대로 되돌아오므로 그것으로 맞춘다.
 *
 * ★ **응답이 없는 것을 예외로 올리지 않는다.** 굽는 도중의 재시도 판단이 "무응답"
 *   과 "거부" 를 갈라야 하기 때문이다 (아래 w61Program 참고).
 */
async function w61Xfer(
  dev: HIDDevice,
  payload: number[] | Uint8Array,
  data?: Uint8Array,
  timeoutMs = 3000,
): Promise<Uint8Array | null> {
  const buf = new Uint8Array(W61_REPORT_LEN);
  buf.set(payload, 0);
  if (data) buf.set(data, payload.length);

  const want0 = buf[0];
  const want1 = buf[1];

  const got = new Promise<Uint8Array | null>((resolve) => {
    const timer = setTimeout(() => {
      dev.removeEventListener('inputreport', on);
      resolve(null);
    }, timeoutMs);

    const on = (e: HIDInputReportEvent) => {
      const r = new Uint8Array(e.data.buffer);
      if (r[0] !== want0 || r[1] !== want1) return;
      clearTimeout(timer);
      dev.removeEventListener('inputreport', on);
      resolve(r);
    };
    dev.addEventListener('inputreport', on);
  });

  await dev.sendReport(0, buf);
  return got;
}

/*
 * 지금 부트로더인가.
 *
 * ★ **`resp[2]` 로는 판별할 수 없다.** 앱에서도 1 이 나온다. 그걸로 판정했다가
 *   앱에 대고 청크를 통째로 쏟아부은 적이 있다 (`tools/flash.py` 주석 참고).
 *   벤더 웹앱의 JS 도 `runModeVersion !== 255` 로 AppToBoot 여부를 정한다.
 *
 *   필드 배치 — t[2] type, t[3] subType, t[4..7] boardId(BE),
 *   t[8..11] appVersion, t[12..15] pcbVersion, **t[16] runModeVersion**
 */
async function w61RunMode(dev: HIDDevice): Promise<number | null> {
  if (!dev.opened) await dev.open();
  const r = await w61Xfer(dev, [0x01, 0x02]);
  return r && r.length > 16 ? r[16] : null;
}

async function w61Program(
  dev: HIDDevice,
  image: Uint8Array,
  onProgress?: (p: IapProgress) => void,
) {
  const total = image.length;

  for (let off = 0; off < total; off += W61_CHUNK) {
    const blk = image.subarray(off, Math.min(off + W61_CHUNK, total));
    const head = new Uint8Array(8);
    const dv = new DataView(head.buffer);
    head[0] = 0x08;
    head[1] = 0x02;
    dv.setUint32(2, off, true);
    dv.setUint16(6, blk.length, true);

    /*
     * ★ **응답 하나를 놓쳤다고 굽기를 통째로 버리면 안 된다.**
     *
     *   청크가 3천 개다. 인터럽트 전송이 한 번만 미끄러져도 전체가 실패하고, 그때
     *   App1 은 **반쯤 쓰인 상태**로 남는다. 다음 부팅에서 IAP 가 App2(벤더)로
     *   복구해 버린다 — "가끔 업데이트가 실패" 하던 것이 이거다.
     *
     *   IAP 는 주소가 순차인지 검사한다. 그래서 재시도의 결과가 둘로 갈린다.
     *
     *     응답이 옴       -> 이번에 들어갔다. 그대로 진행
     *     주소 거부가 옴  -> **앞 시도가 이미 들어갔고 응답만 잃은 것**이다.
     *                        거부를 성공으로 읽고 넘어간다
     *
     *   이 구분이 있어야 재시도가 안전하다. 무턱대고 다시 보내면 주소가 어긋난다.
     */
    let r = await w61Xfer(dev, head, blk);
    if (r === null) {
      r = await w61Xfer(dev, head, blk, 8000); /* 한 번 더, 넉넉히 */
      if (r !== null && le16(r, 2) === W61_FLASH_FAIL) {
        /* 거부 = 앞 것이 들어갔다 — 넘어간다 */
      } else if (r === null) {
        throw new Error(
          `0x${off.toString(16)} 두 번 다 무응답 — App1 이 반쯤 쓰였다. ` +
            `그대로 두면 다음 부팅에 IAP 가 벤더 펌웨어로 복구한다. 다시 구울 것.`,
        );
      }
    } else if (le16(r, 2) === W61_FLASH_FAIL) {
      throw new Error(`0x${off.toString(16)} 에서 거부됐다 (주소 불일치)`);
    }

    if (onProgress && (off % 4096 === 0 || off + W61_CHUNK >= total)) {
      onProgress({phase: 'write', sent: Math.min(off + blk.length, total), total});
    }
  }

  /*
   * ★ **ValiDate 를 통과해야만 BootToApp 을 보낸다.**
   *
   *   IAP 는 devid(0x0030000B)와 CRC 를 검사한다. 실패했는데 그냥 뛰면 깨진 앱으로
   *   넘어간다. 여기서 멈추면 장치는 부트로더에 남고, USB 를 다시 꽂으면 IAP 가
   *   App2(벤더)로 되살린다 — 어느 쪽이든 복구된다.
   */
  const val = await w61Xfer(dev, [0x08, 0x03], undefined, 8000);
  if (!val || val[2] !== 1) {
    throw new Error(
      '검증 실패 — 앱으로 넘기지 않는다. ' +
        '이 보드의 이미지가 맞는지 보고 다시 굽는다 (USB 를 다시 꽂으면 원래 펌웨어로 되살아난다)',
    );
  }
  await w61Xfer(dev, [0x08, 0x04], undefined, 3000);
}

function le16(a: Uint8Array, off: number) {
  return a[off] | (a[off + 1] << 8);
}

/* ── 앱 (0xFF60) ──────────────────────────────────────────────────────── */
const APP_USAGE_PAGE = 0xff60;
const APP_CMD_BOOT = 0x0b; /* VIA 의 id_bootloader_jump 와 같은 자리 */
const APP_REPORT_LEN = 32;

const W60_MAGIC = [0x48, 0x50, 0x4d, 0x0a]; /* "HPM\n" */

/*
 * 배포 목록 — public/firmware/ 아래 두 층이다.
 *
 *   manifest.json               보드 목록 (여기서 고른다)
 *   <dir>/manifest.json         그 보드의 배포 목록 — 최신이 맨 앞
 *   <dir>/<버전>/*.bin
 *
 * 보드별 목록은 펌웨어 저장소의 `tools/make_release.py` 가 여기에 **바로 쓴다.**
 * 층을 나눈 이유는 버전 폴더 이름이 보드끼리 겹치기 때문이다.
 *
 * ★ BASE_URL 을 앞에 붙인다. GitHub Pages 는 .../via-he/ 처럼 하위 경로로 열리므로
 *   '/firmware' 라고 적으면 도메인 루트를 가리켜 404 가 난다. dev 에서는 '/' 다.
 */
export const FW_BASE = `${import.meta.env.BASE_URL}firmware`;

export type FwEntry = {
  version: string;
  board: string;
  date: string;
  bin: string;
  size: number;
  crc: string;
  notes: string[];
};

/*
 * 어느 보드인가.
 *
 * ★ **부트로더는 자기가 무슨 보드인지 말해 주지 않는다.**
 *
 *   벤더 IAP 라 VID/PID 가 보드와 무관하게 늘 534B:4102 이고, INFO 명령도 없다.
 *   앱이 돌 때만 0xCA 로 보드 이름을 물어볼 수 있다. 그런데 굽는 것이 가장 절실한
 *   상황이 바로 **앱이 안 도는 상태**다.
 *
 *   그래서 부트로더로 붙었을 때는 사람에게 묻는다. 짐작해서 고르면 다른 보드의
 *   이미지를 굽게 되고, 그건 되돌리기 번거로운 실수다.
 */
export type FwBoard = {
  id: string; /* 장치가 0xCA 로 말하는 이름과 같아야 한다 (앱 모드 자동 선택용) */
  name: string; /* 사람에게 보일 이름 */
  dir: string; /* public/firmware/<dir>/ */

  /*
   * 어느 부트로더를 쓰는가. 목록(public/firmware/manifest.json)이 정한다.
   *
   * ★ **없으면 wish60 으로 읽는다.** 이 축이 생기기 전에 쓰인 목록이 그대로
   *   돌아가야 한다 — 그때는 wish60 하나뿐이었다.
   */
  iap?: IapId;
};

export async function fwBoards(): Promise<FwBoard[]> {
  const r = await fetch(`${FW_BASE}/manifest.json`, {cache: 'no-cache'});
  if (!r.ok) throw new Error(`보드 목록을 못 읽었다 (${r.status})`);
  const j = await r.json();
  return (j.boards ?? []) as FwBoard[];
}

export async function fwList(dir: string): Promise<FwEntry[]> {
  const r = await fetch(`${FW_BASE}/${dir}/manifest.json`, {cache: 'no-cache'});
  if (!r.ok) throw new Error(`목록을 못 읽었다 (${r.status})`);
  const j = await r.json();
  return (j.firmwares ?? []) as FwEntry[];
}

export async function fwFetch(dir: string, e: FwEntry): Promise<Uint8Array> {
  const r = await fetch(`${FW_BASE}/${dir}/${e.bin}`, {cache: 'no-cache'});
  if (!r.ok) throw new Error(`펌웨어를 못 받았다 (${r.status})`);
  const buf = new Uint8Array(await r.arrayBuffer());

  /*
   * ★ 크기를 대조한다. 목록과 파일이 어긋나면 굽기 전에 멈춰야 한다 —
   *   구운 뒤에 알면 이미 업데이트 모드에 갇혀 있다.
   */
  if (e.size && buf.length !== e.size) {
    throw new Error(`크기가 다르다 (목록 ${e.size}, 파일 ${buf.length})`);
  }
  return buf;
}

export type IapProgress = {
  phase: 'boot' | 'wait' | 'permit' | 'write' | 'done';
  sent: number;
  total: number;
};

function findByUsage(devices: HIDDevice[], vid: number, pid: number, page: number) {
  return (
    devices.find(
      (d) =>
        d.vendorId === vid &&
        d.productId === pid &&
        d.collections.some((c) => c.usagePage === page),
    ) ?? null
  );
}

/*
 * 한 번 보내고 한 번 받는다.
 *
 * ★ 응답을 골라 받아야 한다. 라이브 트래킹 같은 것이 같은 채널로 밀려올 수 있어서
 *   먼저 온 리포트를 그대로 믿으면 엉뚱한 것을 읽는다. 태그(0x85)가 맞는 것만 쓴다.
 */
/*
 * ── 보드별 부트로더 서술자 ────────────────────────────────────────────────
 *
 * 굽는 쪽(iapFlash)은 이 표만 보고 움직인다. 새 보드가 생기면 여기 한 줄이다.
 */
export type IapId = 'wish60' | 'wish61';

export type IapSpec = {
  id: IapId;
  filter: {vendorId: number; productId: number; usagePage: number};

  /* 이미지가 이 보드 것인지 — 굽기 전에 막는다 */
  checkImage: (image: Uint8Array) => void;

  /*
   * 이 채널이 보이면 곧 부트로더인가.
   *
   * wish60 은 그렇다 (부트로더만 그 VID/PID 를 쓴다). wish61 은 벤더 앱이 같은
   * 신원을 쓰므로 물어봐야 한다.
   */
  isBootloader: (dev: HIDDevice) => Promise<boolean>;

  program: (
    dev: HIDDevice,
    image: Uint8Array,
    onProgress?: (p: IapProgress) => void,
  ) => Promise<void>;

  /*
   * 우리 펌웨어가 아니라 **벤더 앱이 돌고 있을 때** 부트로더로 넘기는 길.
   *
   * 순정 보드를 우리 것으로 바꾸는 경로다. 벤더 앱에는 우리 0xFF60 채널이 없으므로
   * 자기 채널로 보내야 한다. wish60 에는 해당 없음.
   */
  enterFromVendor?: (dev: HIDDevice) => Promise<void>;
};

function magicCheck(image: Uint8Array, magic: number[], what: string) {
  if (image.length < magic.length || magic.some((b, i) => image[i] !== b)) {
    throw new Error(`이 파일은 이 보드의 펌웨어가 아니다 (${what})`);
  }
}

export const IAP_SPECS: Record<IapId, IapSpec> = {
  wish60: {
    id: 'wish60',
    filter: W60_FILTER,
    checkImage: (img) => magicCheck(img, W60_MAGIC, '앞 4바이트가 "HPM\\n" 이 아님'),
    isBootloader: async () => true,
    program: (d, img, p) => w60Program(d, img, p),
  },
  wish61: {
    id: 'wish61',
    filter: W61_FILTER,
    checkImage: (img) =>
      magicCheck(img, W61_MAGIC, '헤더 매직이 0xBEAF5AA5 가 아님 — mkimage.py 로 만든 것이어야 한다'),
    isBootloader: async (d) => (await w61RunMode(d)) === W61_BOOT_MODE,
    program: (d, img, p) => w61Program(d, img, p),
    enterFromVendor: async (d) => {
      if (!d.opened) await d.open();
      await w61Xfer(d, [0x08, 0x01], undefined, 3000);
    },
  },
};

export function iapSpecOf(board?: {iap?: IapId} | null): IapSpec {
  return IAP_SPECS[board?.iap ?? 'wish60'];
}

/* "장치 승인" 과 부트로더 선택 창이 같이 쓴다 — 어느 보드든 목록에 떠야 한다 */
export const IAP_FILTERS = Object.values(IAP_SPECS).map((v) => v.filter);

async function w60Xfer(
  dev: HIDDevice,
  cmd: number,
  payload: Uint8Array = new Uint8Array(0),
  opt: {check?: boolean; length?: number} = {},
): Promise<Uint8Array> {
  const {check = true, length} = opt;
  const buf = new Uint8Array(W60_REPORT_LEN);
  buf[0] = cmd;
  buf[1] = length ?? payload.length;
  buf.set(payload, W60_PAYLOAD_OFF);

  const got = new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => {
      dev.removeEventListener('inputreport', on);
      reject(new Error(`응답 없음 (cmd 0x${cmd.toString(16)})`));
    }, 2000);

    const on = (e: HIDInputReportEvent) => {
      const r = new Uint8Array(e.data.buffer);
      if (r[0] !== W60_RSP_TAG) return; /* 우리 응답이 아니다 */
      clearTimeout(timer);
      dev.removeEventListener('inputreport', on);
      resolve(r);
    };
    dev.addEventListener('inputreport', on);
  });

  await dev.sendReport(0, buf);
  const rsp = await got;

  if (check && rsp[1] !== 1) {
    throw new Error(`cmd 0x${cmd.toString(16)} 실패 (status ${rsp[1]})`);
  }
  return rsp;
}

/*
 * 이미지를 기록한다.
 *
 * ★ 페이지를 정확히 4096 으로 채운 뒤에만 flush 한다.
 *
 *   cmd 0x82 는 "지금 버퍼를 기록하고 나서 이 리포트의 데이터를 붙인다" 이다.
 *   페이지를 채우는 마지막 조각을 0x82 에 실으면 덜 찬 페이지가 0xFF 로 패딩돼
 *   기록되고 그 뒤 데이터가 통째로 밀린다.
 */
async function w60Program(
  dev: HIDDevice,
  image: Uint8Array,
  onProgress?: (p: IapProgress) => void,
) {
  const total = image.length;
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, total, true);
  await w60Xfer(dev, W60_CMD_START, len, {length: 4});

  let sent = 0;
  let inPage = 0;
  while (sent < total) {
    const n = Math.min(W60_PAYLOAD_MAX, total - sent, W60_PAGE_SIZE - inPage);
    await w60Xfer(dev, W60_CMD_DATA, image.subarray(sent, sent + n));
    sent += n;
    inPage += n;

    if (inPage === W60_PAGE_SIZE) {
      await w60Xfer(dev, W60_CMD_FLUSH); /* 페이로드 없이 — 정확히 찼을 때만 */
      inPage = 0;
    }
    if (onProgress && (sent % 4096 === 0 || sent === total)) {
      onProgress({phase: 'write', sent, total});
    }
  }
  if (inPage) await w60Xfer(dev, W60_CMD_FLUSH); /* 마지막 자투리 */

  /*
   * 종료 — 앱으로 점프한다.
   *
   * IAP 의 0x83 분기는 status 를 1 로 세우지 않는다 (코드상 nop 뿐이다).
   * status 0 이 정상이므로 검사하지 않는다.
   */
  await w60Xfer(dev, W60_CMD_END, new Uint8Array(0), {check: false}).catch(() => {});
}

/* 앱이 돌고 있으면 부트로더로 넘어가라고 알린다 */
async function requestBoot(dev: HIDDevice) {
  const buf = new Uint8Array(APP_REPORT_LEN);
  buf[0] = APP_CMD_BOOT;
  if (!dev.opened) await dev.open();
  await dev.sendReport(0, buf);
}

/*
 * 부트로더로 넘긴다 — 굽지 않고 넘기기만 한다.
 *
 * 쓸 데가 둘이다. 하나는 부트로더 권한을 미리 받아 두는 것 (앱 모드에서는 그
 * 인터페이스가 아예 없어 미리 받을 수 없다). 다른 하나는 복구 — 앱이 이상해졌을 때
 * 손으로 넘겨 놓고 다시 구울 수 있다.
 */
export async function iapEnterBoot(vid: number, pid: number) {
  const app = findByUsage(await navigator.hid.getDevices(), vid, pid, APP_USAGE_PAGE);
  if (!app) throw new Error('앱 인터페이스를 못 찾았다 — 이미 부트로더일 수 있다');
  await requestBoot(app);
}

/*
 * 부트로더를 찾는다.
 *
 * ★ 여기서 못 찾을 수 있다 — 그게 정상이다.
 *
 *   WebHID 권한은 **인터페이스 구성까지 포함해서** 준다. 앱을 허용해 두어도
 *   부트로더는 다른 구성이라 getDevices() 에 안 나온다. 그리고 앱 모드일 때는
 *   부트로더 인터페이스가 존재하지 않으니 **미리 허용받을 수도 없다.**
 *
 *   그래서 부트로더가 뜬 뒤에 한 번 허용을 받아야 한다. 그 허용은 다음부터
 *   기억되므로 처음 한 번만 겪는다.
 *
 * ★ **채널이 보이는 것과 부트로더인 것은 다르다.** wish61 은 벤더 앱이 같은
 *   VID/PID/usage page 를 쓰므로 `isBootloader` 로 한 번 더 물어본다. 그 물음은
 *   읽기 한 번이라 앱에 대고 해도 해가 없다.
 */
export async function iapFindSpec(
  spec: IapSpec,
): Promise<HIDDevice | null> {
  const f = spec.filter;
  const dev = findByUsage(await navigator.hid.getDevices(), f.vendorId, f.productId, f.usagePage);
  if (!dev) return null;
  try {
    return (await spec.isBootloader(dev)) ? dev : null;
  } catch {
    return null;
  }
}

/* 어느 보드든 — 첫 화면의 "부트로더가 붙어 있나" 확인용 */
export async function iapFind(): Promise<HIDDevice | null> {
  for (const spec of Object.values(IAP_SPECS)) {
    const dev = await iapFindSpec(spec);
    if (dev) return dev;
  }
  return null;
}

/* 사용자 제스처 안에서 불러야 한다 */
export async function iapRequest(): Promise<HIDDevice | null> {
  const got = await navigator.hid.requestDevice({filters: IAP_FILTERS});
  return got[0] ?? null;
}

async function waitForIap(spec: IapSpec, timeoutMs = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const dev = await iapFindSpec(spec);
    if (dev) {
      if (!dev.opened) await dev.open();
      return dev;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/*
 * 벤더 앱이 돌고 있으면 부트로더로 넘긴다 — **순정 보드를 개조하는 길.**
 *
 * ★ 안전하다. 벤더 앱은 넘어가기 전에 **App1 → App2 백업을 스스로 돌린다.** 즉
 *   개조하는 순간 순정 사본이 App2 에 남고, 우리 이미지가 깨지면 IAP 가 거기서
 *   자동 복구한다. IAP 가 devid 를 검사하므로 다른 제품에 잘못 굽는 일도 막힌다.
 */
async function enterFromVendor(spec: IapSpec, image: Uint8Array,
                               onProgress?: (p: IapProgress) => void) {
  if (!spec.enterFromVendor) return false;
  const f = spec.filter;
  const dev = findByUsage(await navigator.hid.getDevices(), f.vendorId, f.productId, f.usagePage);
  if (!dev) return false;

  onProgress?.({phase: 'boot', sent: 0, total: image.length});
  await spec.enterFromVendor(dev);
  return true;
}

/*
 * 굽는다. 앱이 돌고 있으면 알아서 부트로더로 넘긴다.
 *
 * ★ 권한은 이미 있어야 한다.
 *
 *   VIA 가 장치를 잡고 있다는 것이 곧 이 오리진에 권한이 있다는 뜻이다. 부트로더는
 *   인터페이스 구성이 다르지만 WebHID 권한은 VID/PID 단위라 재열거 뒤에도
 *   getDevices() 에 나온다.
 *
 *   여기서 requestDevice() 를 부르지 않는다 — 굽는 도중에 기기 선택 창이 뜨면
 *   다른 키보드를 고를 수 있고, 마침 재열거로 장치가 사라진 구간이라 사용자가
 *   무슨 일인지 알 수 없다.
 *
 * ★ **부트로더로 넘기는 길이 둘이다.**
 *
 *     우리 펌웨어  0xFF60 에 0x0B      (두 보드 공통. resetToBoot 이 받는다)
 *     벤더 앱      자기 채널에 08 01   (wish61 의 개조 경로)
 *
 *   우리 것을 먼저 본다. 우리 펌웨어가 돌고 있는데 벤더 경로를 타면 채널이 없어
 *   실패할 뿐이지만, 순서가 반대면 순정 보드에서 "앱을 못 찾았다" 로 끝난다.
 */
export async function iapFlash(
  spec: IapSpec,
  vendorId: number,
  productId: number,
  image: Uint8Array,
  onProgress?: (p: IapProgress) => void,
  /* 부트로더를 못 찾았을 때 — 사용자에게 허용을 받아 오는 콜백 */
  askPermission?: () => Promise<HIDDevice | null>,
) {
  spec.checkImage(image);

  let iap = await iapFindSpec(spec);

  if (!iap) {
    /*
     * 앱 모드다 — 부트로더로 넘긴다.
     *
     * ★ 여기서 requestDevice() 를 부르면 안 된다.
     *
     *   기기 선택 창이 굽는 도중에 뜬다. 그 목록에는 **책상에 물려둔 다른 키보드**도
     *   나오므로 엉뚱한 것을 고를 수 있고, 그러잖아도 장치가 재열거로 잠깐 사라지는
     *   구간이라 사용자가 무슨 일인지 알 수 없다. 권한은 굽기 전에 이미 있어야 한다
     *   (VIA 가 장치를 잡고 있다는 것이 곧 권한이 있다는 뜻이다).
     */
    const app = findByUsage(
      await navigator.hid.getDevices(),
      vendorId,
      productId,
      APP_USAGE_PAGE,
    );

    if (app) {
      onProgress?.({phase: 'boot', sent: 0, total: image.length});
      await requestBoot(app);
    } else if (!(await enterFromVendor(spec, image, onProgress))) {
      throw new Error('앱 인터페이스를 못 찾았다 — 장치가 연결돼 있는지 본다');
    }

    onProgress?.({phase: 'wait', sent: 0, total: image.length});
    iap = await waitForIap(spec);

    if (!iap) {
      onProgress?.({phase: 'permit', sent: 0, total: image.length});
      iap = (await askPermission?.()) ?? null;
      if (!iap) throw new Error('부트로더 권한이 없다');
      if (!iap.opened) await iap.open();
    }
  } else if (!iap.opened) {
    await iap.open();
  }

  await spec.program(iap, image, onProgress);
  onProgress?.({phase: 'done', sent: image.length, total: image.length});
}
