import {useCallback, useRef, useState} from 'react';
import {useAppDispatch} from 'src/store/hooks';
import {reloadConnectedDevices} from 'src/store/devicesThunks';
import {setFlashing} from 'src/store/heSlice';
import {
  iapFlash,
  iapRestoreVendor,
  type IapProgress,
  type IapSpec,
} from 'src/utils/he-iap';

/*
 * he-iap-flash — **IAP 보드에 굽는 일**만 하는 훅.
 *
 * ★ 여기는 선택된 VIA 장치를 아예 모른다.
 *
 *   다루는 것이 부트로더 보드이거나 순정 보드라, 우리 앱의 `0xFF60` 채널이
 *   없거나(순정) 이미 부트로더에 있다. 둘 다 "우리 앱을 부트로더로 넘기는"
 *   단계가 필요 없으므로 vid/pid 가 쓰이지 않는다 — 그래서 0 을 넘긴다.
 *
 *   이게 이 훅을 따로 두는 이유이기도 하다. 펌웨어 탭의 굽기는 "선택된 키보드"
 *   를 다루느라 device 에 매여 있는데, 거기에 다른 보드를 얹었더니 **선택된
 *   장치의 vid/pid 를 쓰면 안 되는 예외**가 생겼다. 그 예외 하나가 뚫리면
 *   엉뚱한 키보드가 부트로더로 간다. 아예 안 받는 편이 안전하다.
 */
export function useIapFlash() {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IapProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /* 부트로더 권한이 없을 때 사용자 클릭을 기다리는 자리 */
  const permit = useRef<((d: HIDDevice | null) => void) | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setErr(null);
      setBusy(true);
      dispatch(setFlashing(true));
      try {
        await fn();
        /*
         * 보드가 다시 열거될 때까지 훑는다. VIA 는 USB 이벤트에만 반응하고 그때도
         * 두 번 훑고 마는데, 그 창을 넘기면 아무도 다시 안 본다.
         */
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          dispatch(reloadConnectedDevices());
        }
      } catch (x) {
        setErr(String(x));
      } finally {
        dispatch(setFlashing(false));
        setBusy(false);
        /* 굽는 동안 막아 둔 자동 전환을 여기서 한 번 풀어 준다 */
        dispatch(reloadConnectedDevices());
      }
    },
    [dispatch],
  );

  const ask = () =>
    new Promise<HIDDevice | null>((res) => {
      permit.current = res;
    });

  return {
    busy,
    progress,
    err,
    setErr,
    /* 부트로더 권한 창을 사용자가 눌렀을 때 그 결과를 흘려 넣는다 */
    grantPermission: (dev: HIDDevice | null) => {
      permit.current?.(dev);
      permit.current = null;
    },
    flash: (spec: IapSpec, image: Uint8Array) =>
      run(() => iapFlash(spec, 0, 0, image, setProgress, ask)),
    restore: (spec: IapSpec) =>
      run(() => iapRestoreVendor(spec, 0, 0, setProgress, ask)),
  };
}
