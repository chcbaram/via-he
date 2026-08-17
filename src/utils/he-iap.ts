/*
 * he-iap.ts — 브라우저에서 펌웨어 굽기 (WebHID)
 *
 * 벤더 IAP 부트로더의 프로토콜을 그대로 쓴다. 새로 만든 것은 없고,
 * `tools/iap_update.py` 가 libhidapi 로 하던 일을 WebHID 로 옮긴 것이다
 * (firmware/wish60-he/docs/09-iap-updater.md).
 *
 * ★ 벽돌이 되지 않는다.
 *
 *   부트로더는 기록 주소를 0x80020000 으로 하드코딩한다. USB 로는 부트로더 자신을
 *   덮어쓸 수 없으므로, 중간에 실패해도 장치는 업데이트 모드로 남는다. 다시 시도하면
 *   된다. 그래서 진행 중 오류를 조용히 삼키지 않고 그대로 올린다 — 사용자가 다시
 *   누르면 되는 상황이라 감출 이유가 없다.
 *
 * ★ 두 채널을 오간다.
 *
 *   앱   usage page 0xFF60, 32 B — "부트로더로 가라" 만 보낸다
 *   부트 usage page 0xFF53, 64 B — 실제 기록
 *
 *   그 사이에 장치가 **다시 열거된다.** VID/PID 는 같지만 인터페이스 구성이 바뀌므로
 *   getDevices() 로 다시 찾아야 한다. 권한은 VID/PID 단위라 유지된다.
 */

/* ── 부트로더 (0xFF53) ────────────────────────────────────────────────── */
const IAP_USAGE_PAGE = 0xff53;

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
const IAP_VID = 0x534b;
const IAP_PID = 0x4102;

/*
 * 선택 창에 부트로더를 올리는 필터.
 *
 * 여기(`iapRequest`)와 VIA 의 "장치 승인"(`shims/node-hid.ts`)이 같이 쓴다. 뒤쪽에도
 * 넣는 이유는 **막다른 길을 막기 위해서**다 — 부트로더 상태로 앱을 켠 사람이 늘
 * 누르던 "장치 승인" 을 눌렀을 때도 보드가 목록에 보여야 한다. 고른 장치는 VIA 의
 * 키보드 필터(usagePage 0xFF60)에서 걸러져 목록에는 안 들어가고, 남는 것은 권한이다.
 * 그 권한을 다음 `iapFind()` 가 주워서 HE 탭이 돌아온다.
 */
export const IAP_FILTER = {
  vendorId: IAP_VID,
  productId: IAP_PID,
  usagePage: IAP_USAGE_PAGE,
};

const CMD_DATA = 0x80;
const CMD_START = 0x81;
const CMD_FLUSH = 0x82;
const CMD_END = 0x83;
const RSP_TAG = 0x85;

const REPORT_LEN = 64;
const PAYLOAD_OFF = 4; /* [0]=cmd [1]=len [2..3]=미사용 [4..]=데이터 */
const PAYLOAD_MAX = REPORT_LEN - PAYLOAD_OFF;
const PAGE_SIZE = 4096; /* IAP 내부 페이지 버퍼 */

/* ── 앱 (0xFF60) ──────────────────────────────────────────────────────── */
const APP_USAGE_PAGE = 0xff60;
const APP_CMD_BOOT = 0x0b; /* VIA 의 id_bootloader_jump 와 같은 자리 */
const APP_REPORT_LEN = 32;

export const IAP_MAGIC = [0x48, 0x50, 0x4d, 0x0a]; /* "HPM\n" */

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
async function xfer(
  dev: HIDDevice,
  cmd: number,
  payload: Uint8Array = new Uint8Array(0),
  opt: {check?: boolean; length?: number} = {},
): Promise<Uint8Array> {
  const {check = true, length} = opt;
  const buf = new Uint8Array(REPORT_LEN);
  buf[0] = cmd;
  buf[1] = length ?? payload.length;
  buf.set(payload, PAYLOAD_OFF);

  const got = new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => {
      dev.removeEventListener('inputreport', on);
      reject(new Error(`응답 없음 (cmd 0x${cmd.toString(16)})`));
    }, 2000);

    const on = (e: HIDInputReportEvent) => {
      const r = new Uint8Array(e.data.buffer);
      if (r[0] !== RSP_TAG) return; /* 우리 응답이 아니다 */
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
async function program(
  dev: HIDDevice,
  image: Uint8Array,
  onProgress?: (p: IapProgress) => void,
) {
  const total = image.length;
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, total, true);
  await xfer(dev, CMD_START, len, {length: 4});

  let sent = 0;
  let inPage = 0;
  while (sent < total) {
    const n = Math.min(PAYLOAD_MAX, total - sent, PAGE_SIZE - inPage);
    await xfer(dev, CMD_DATA, image.subarray(sent, sent + n));
    sent += n;
    inPage += n;

    if (inPage === PAGE_SIZE) {
      await xfer(dev, CMD_FLUSH); /* 페이로드 없이 — 정확히 찼을 때만 */
      inPage = 0;
    }
    if (onProgress && (sent % 4096 === 0 || sent === total)) {
      onProgress({phase: 'write', sent, total});
    }
  }
  if (inPage) await xfer(dev, CMD_FLUSH); /* 마지막 자투리 */

  /*
   * 종료 — 앱으로 점프한다.
   *
   * IAP 의 0x83 분기는 status 를 1 로 세우지 않는다 (코드상 nop 뿐이다).
   * status 0 이 정상이므로 검사하지 않는다.
   */
  await xfer(dev, CMD_END, new Uint8Array(0), {check: false}).catch(() => {});
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
 * 부트로더가 다시 열거될 때까지 기다린다.
 *
 * ★ 여기서 못 찾을 수 있다 — 그게 정상이다.
 *
 *   WebHID 권한은 **인터페이스 구성까지 포함해서** 준다. 앱을 허용해 두어도
 *   부트로더는 다른 구성이라 getDevices() 에 안 나온다. 그리고 앱 모드일 때는
 *   부트로더 인터페이스가 존재하지 않으니 **미리 허용받을 수도 없다.**
 *
 *   그래서 부트로더가 뜬 뒤에 한 번 허용을 받아야 한다. 그 허용은 다음부터
 *   기억되므로 처음 한 번만 겪는다.
 */
export async function iapFind(): Promise<HIDDevice | null> {
  return findByUsage(await navigator.hid.getDevices(), IAP_VID, IAP_PID, IAP_USAGE_PAGE);
}

/* 사용자 제스처 안에서 불러야 한다 */
export async function iapRequest(): Promise<HIDDevice | null> {
  const got = await navigator.hid.requestDevice({filters: [IAP_FILTER]});
  return got[0] ?? null;
}

async function waitForIap(timeoutMs = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const dev = await iapFind();
    if (dev) {
      if (!dev.opened) await dev.open();
      return dev;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
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
 */
export async function iapFlash(
  vendorId: number,
  productId: number,
  image: Uint8Array,
  onProgress?: (p: IapProgress) => void,
  /* 부트로더를 못 찾았을 때 — 사용자에게 허용을 받아 오는 콜백 */
  askPermission?: () => Promise<HIDDevice | null>,
) {
  if (
    image.length < 4 ||
    IAP_MAGIC.some((b, i) => image[i] !== b)
  ) {
    throw new Error('이 파일은 이 보드의 펌웨어가 아니다 (앞 4바이트가 "HPM\\n" 이 아님)');
  }

  const devices = await navigator.hid.getDevices();
  let iap = findByUsage(devices, IAP_VID, IAP_PID, IAP_USAGE_PAGE);

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
    const app = findByUsage(devices, vendorId, productId, APP_USAGE_PAGE);
    if (!app) throw new Error('앱 인터페이스를 못 찾았다 — 장치가 연결돼 있는지 본다');

    onProgress?.({phase: 'boot', sent: 0, total: image.length});
    await requestBoot(app);

    onProgress?.({phase: 'wait', sent: 0, total: image.length});
    iap = await waitForIap();

    if (!iap) {
      onProgress?.({phase: 'permit', sent: 0, total: image.length});
      iap = (await askPermission?.()) ?? null;
      if (!iap) throw new Error('부트로더 권한이 없다');
      if (!iap.opened) await iap.open();
    }
  } else if (!iap.opened) {
    await iap.open();
  }

  await program(iap, image, onProgress);
  onProgress?.({phase: 'done', sent: image.length, total: image.length});
}
