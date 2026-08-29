import type {
  AuthorizedDevice,
  ConnectedDevice,
  WebVIADevice,
} from '../types/types';
import {IAP_FILTERS} from '../utils/he-iap';

var lastWriteTimestamp = Date.now();
// This is a bit cray
const globalBuffer: {
  [path: string]: {currTime: number; message: Uint8Array}[];
} = {};
const eventWaitBuffer: {
  [path: string]: ((a: Uint8Array) => void)[];
} = {};
type InputReportHandler = (message: Uint8Array) => boolean;
const inputReportHandlers: {
  [path: string]: InputReportHandler[];
} = {};
const filterHIDDevices = (devices: HIDDevice[]) =>
  devices.filter((device) =>
    device.collections?.some(
      (collection) =>
        collection.usage === 0x61 && collection.usagePage === 0xff60,
    ),
  );

export const QMK_CONSOLE_FILTER = {
  usagePage: 0xff31,
  usage: 0x74,
};

export const isQMKConsoleDevice = (device: HIDDevice) =>
  device.collections?.some(
    (collection) =>
      collection.usage === QMK_CONSOLE_FILTER.usage &&
      collection.usagePage === QMK_CONSOLE_FILTER.usagePage,
  ) ?? false;

const getVIAPathIdentifier = () =>
  (self.crypto && self.crypto.randomUUID && self.crypto.randomUUID()) ||
  `via-path:${Math.random()}`;

const tagDevice = (device: HIDDevice): WebVIADevice => {
  // This is super important in order to have a stable way to identify the same device
  // that was already scanned. It's a bit hacky but https://github.com/WICG/webhid/issues/7
  // ¯\_(ツ)_/¯
  const path = (device as any).__path || getVIAPathIdentifier();
  (device as any).__path = path;
  const HIDDevice = {
    _device: device,
    usage: 0x61,
    usagePage: 0xff60,
    interface: 0x0001,
    vendorId: device.vendorId ?? -1,
    productId: device.productId ?? -1,
    path,
    productName: device.productName,
  };
  return (ExtendedHID._cache[path] = HIDDevice);
};

// Attempt to forget device
export const tryForgetDevice = (device: ConnectedDevice | AuthorizedDevice) => {
  const cachedDevice = ExtendedHID._cache[device.path];
  if (cachedDevice) {
    return cachedDevice._device.forget();
  }
};

const ExtendedHID = {
  _cache: {} as {[key: string]: WebVIADevice},
  requestDevice: async () => {
    const requestedDevice = await navigator.hid.requestDevice({
      filters: [
        {
          usagePage: 0xff60,
          usage: 0x61,
        },
        QMK_CONSOLE_FILTER,
        /*
         * ★ 부트로더도 고를 수 있게 한다. (상류 대비 수정)
         *
         *   굽다 만 보드는 usagePage 가 부트로더 것(0xFF53·0xFFB0)이라 위 필터에
         *   안 걸린다. 그래서
         *   "장치 승인" 목록에 안 나오고, 그 상태로 앱을 켜면 HE 탭도 안 떠서
         *   되살릴 길이 없었다.
         *
         *   고른 장치는 바로 아래 filterHIDDevices 에서 걸러지므로 VIA 의 키보드
         *   목록에는 안 들어간다 — 남는 것은 **권한**이고, 그걸 Home 의 주기 확인이
         *   주워서 HE 탭이 돌아온다.
         */
        ...IAP_FILTERS,
      ],
    });
    const viaDevices = filterHIDDevices(requestedDevice);
    viaDevices.forEach(tagDevice);
    return viaDevices[0];
  },
  /*
   * ★ **취소와 "VIA 장치가 아닌 것을 골랐다" 를 갈라야 할 때가 있다.**
   *
   *   크롬은 선택 창을 그냥 닫아도 **거부하지 않고 빈 배열을 돌려준다.** 그래서
   *   위 requestDevice() 의 반환만 보면 둘 다 undefined 라 구분이 안 된다 —
   *   취소했는데 부트로더 창이 뜨는 일이 실제로 났다.
   *
   *   고른 것 자체가 필요하면 이쪽을 쓴다. 태깅은 똑같이 해 둔다.
   */
  requestDeviceEx: async () => {
    const raw = await navigator.hid.requestDevice({
      filters: [
        {usagePage: 0xff60, usage: 0x61},
        QMK_CONSOLE_FILTER,
        ...IAP_FILTERS,
      ],
    });
    const viaDevices = filterHIDDevices(raw);
    const tagged = viaDevices.map(tagDevice);
    return {picked: raw.length > 0, via: tagged[0]};
  },
  getFilteredDevices: async () => {
    try {
      const hidDevices = filterHIDDevices(await navigator.hid.getDevices());
      return hidDevices;
    } catch (e) {
      return [];
    }
  },
  devices: async (requestAuthorize = false) => {
    let devices = await ExtendedHID.getFilteredDevices();
    /*
     * ★ 목록이 비었다고 선택 창을 띄우지 않는다. (상류 대비 수정)
     *
     *   상류는 `devices.length === 0` 일 때도 requestDevice() 를 부른다. 주석에
     *   스스로 "hack" 이라 적어 두었다. 그런데 펌웨어를 구울 때 장치가 부트로더로
     *   넘어가면 목록이 잠깐 비는데, 그때마다 선택 창이 **굽는 도중에** 튀어나온다.
     *   게다가 그 목록에는 우리 보드가 없다 — 부트로더는 VID/PID 가 달라서
     *   VIA 의 필터에 안 걸리고, 책상에 물려둔 남의 키보드만 보인다.
     *
     *   명시적인 승인 경로(requestAuthorize)는 그대로 두므로 "장치 승인" 버튼은
     *   전과 같이 동작한다.
     */
    if (requestAuthorize) {
      try {
        await ExtendedHID.requestDevice();
      } catch (e) {
        // The request seems to fail when the last authorized device is disconnected.
        return [];
      }
      devices = await ExtendedHID.getFilteredDevices();
    }
    return devices.map(tagDevice);
  },
  HID: class HID {
    _hidDevice?: WebVIADevice;
    interface: number = -1;
    vendorId: number = -1;
    productId: number = -1;
    productName: string = '';
    path: string = '';
    openPromise: Promise<void> = Promise.resolve();
    constructor(path: string) {
      this._hidDevice = ExtendedHID._cache[path];
      // TODO: seperate open attempt from constructor as it's async
      // Attempt to connect to the device

      if (this._hidDevice) {
        this.vendorId = this._hidDevice.vendorId;
        this.productId = this._hidDevice.productId;
        this.path = this._hidDevice.path;
        this.interface = this._hidDevice.interface;
        this.productName = this._hidDevice.productName;
        globalBuffer[this.path] = globalBuffer[this.path] || [];
        eventWaitBuffer[this.path] = eventWaitBuffer[this.path] || [];
        inputReportHandlers[this.path] = inputReportHandlers[this.path] || [];
        if (!this._hidDevice._device.opened) {
          this.open();
        }
      } else {
        throw new Error('Missing hid device in cache');
      }
    }
    async open() {
      if (this._hidDevice && !this._hidDevice._device.opened) {
        this.openPromise = this._hidDevice._device.open();
        this.setupListeners();
        await this.openPromise;
      }
      return Promise.resolve();
    }
    // Should we unsubscribe at some point of time
    setupListeners() {
      if (this._hidDevice) {
        this._hidDevice._device.addEventListener('inputreport', (e) => {
          const message = new Uint8Array(e.data.buffer);
          const wasHandled = inputReportHandlers[this.path].some((handler) =>
            handler(message),
          );
          if (wasHandled) {
            return;
          }
          if (eventWaitBuffer[this.path].length !== 0) {
            // It should be impossible to have a handler in the buffer
            // that has a ts that happened after the current message
            // came in
            (eventWaitBuffer[this.path].shift() as any)(
              message,
            );
          } else {
            globalBuffer[this.path].push({
              currTime: Date.now(),
              message,
            });
          }
        });
      }
    }

    addInputReportHandler(handler: InputReportHandler) {
      inputReportHandlers[this.path] = inputReportHandlers[this.path] || [];
      inputReportHandlers[this.path].push(handler);
      return () => {
        inputReportHandlers[this.path] = inputReportHandlers[this.path].filter(
          (registeredHandler) => registeredHandler !== handler,
        );
      };
    }

    read(fn: (err?: Error, data?: ArrayBuffer) => void) {
      this.fastForwardGlobalBuffer(lastWriteTimestamp);
      if (globalBuffer[this.path].length > 0) {
        // this should be a noop normally
        fn(undefined, globalBuffer[this.path].shift()?.message as any);
      } else {
        eventWaitBuffer[this.path].push((data) => fn(undefined, data));
      }
    }

    readP = promisify((arg: any) => this.read(arg));

    /*
     * 짝이 안 맞는 응답을 건너뛰기 위한 **취소할 수 있는 읽기.**
     *
     * readP 는 영영 기다린다. 그걸 Promise.race 로 감싸면 진 쪽의 대기가
     * eventWaitBuffer 에 그대로 남아 **다음 응답을 대신 삼킨다** — 어긋남을 고치려다
     * 어긋남을 하나 더 만드는 셈이다. 그래서 시간이 다 되면 자기 대기를 직접 걷어내는
     * 읽기를 따로 둔다.
     *
     * 시간이 다 되면 undefined 를 준다.
     */
    readWithin(ms: number): Promise<Uint8Array | undefined> {
      this.fastForwardGlobalBuffer(lastWriteTimestamp);
      const buffered = globalBuffer[this.path].shift();
      if (buffered) {
        return Promise.resolve(buffered.message as Uint8Array);
      }
      return new Promise((resolve) => {
        let settled = false;
        const waiter = (data: Uint8Array) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(data);
        };
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          eventWaitBuffer[this.path] = eventWaitBuffer[this.path].filter(
            (w) => w !== waiter,
          );
          resolve(undefined);
        }, ms);
        eventWaitBuffer[this.path].push(waiter as any);
      });
    }

    // The idea is discard any messages that have happened before the time a command was issued
    // since time-travel is not possible yet...
    fastForwardGlobalBuffer(time: number) {
      let messagesLeft = globalBuffer[this.path].length;
      while (messagesLeft) {
        messagesLeft--;
        // message in buffer happened before requested time
        if (globalBuffer[this.path][0].currTime < time) {
          globalBuffer[this.path].shift();
        } else {
          break;
        }
      }
    }

    async write(arr: number[]) {
      await this.openPromise;
      if (this._hidDevice && !this._hidDevice._device.opened) {
        await this.open();
      }
      const data = new Uint8Array(arr.slice(1));
      lastWriteTimestamp = Date.now();
      await this._hidDevice?._device.sendReport(0, data);
    }
  },
};

const promisify = (cb: Function) => () => {
  return new Promise((res, rej) => {
    cb((e: any, d: any) => {
      if (e) rej(e);
      else res(d);
    });
  });
};
export const HID = ExtendedHID;
