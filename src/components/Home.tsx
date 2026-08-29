import React, {createRef, useEffect} from 'react';
import styled from 'styled-components';
import {iapFind, iapFindVendorApp} from 'src/utils/he-iap';
import {setBootloaderSeen, setVendorSeen} from 'src/store/heSlice';
import {getByteForCode} from '../utils/key';
import {startMonitoring, usbDetect} from '../utils/usb-hid';
import {
  getLightingDefinition,
  isVIADefinitionV2,
  isVIADefinitionV3,
  LightingValue,
} from '@the-via/reader';
import {
  dismissInvalidProtocolDevice,
  dismissUnresolvedDefinitionDevice,
  getConnectedDevices,
  getInvalidProtocolDeviceWarning,
  getSelectedKeyboardAPI,
  getUnresolvedDefinitionDeviceWarning,
} from 'src/store/devicesSlice';
import {
  loadSupportedIds,
  reloadConnectedDevices,
} from 'src/store/devicesThunks';
import {getDisableFastRemap} from '../store/settingsSlice';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {
  getSelectedKey,
  getSelectedLayerIndex,
  updateSelectedKey as updateSelectedKeyAction,
} from 'src/store/keymapSlice';
import {
  getBasicKeyToByte,
  getSelectedDefinition,
  getSelectedKeyDefinitions,
} from 'src/store/definitionsSlice';
import {syncCustomMenuValuesFromRequest} from 'src/store/menusSlice';
import {OVERRIDE_HID_CHECK} from 'src/utils/override';
import {KeyboardValue} from 'src/utils/keyboard-api';
import {useTranslation} from 'react-i18next';
import {MessageDialog} from './inputs/message-dialog';
import {formatNumberAsHex} from 'src/utils/format';

const ErrorHome = styled.div`
  background: var(--bg_gradient);
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  overflow: hidden;
  height: auto;
  left: 0;
  right: 0;
  bottom: 0;
  padding-top: 24px;
  position: absolute;
  border-top: 1px solid var(--border_color_cell);
`;

const UsbError = styled.div`
  align-items: center;
  display: flex;
  color: var(--color_label);
  flex-direction: column;
  height: 100%;
  justify-content: center;
  margin: 0 auto;
  max-width: 650px;
  text-align: center;
`;

const UsbErrorIcon = styled.div`
  font-size: 2rem;
`;

const UsbErrorHeading = styled.h1`
  margin: 1rem 0 0;
`;

const UsbErrorWebHIDLink = styled.a`
  text-decoration: underline;
  color: var(--color_label-highlighted);
`;

const timeoutRepeater =
  (fn: () => void, timeout: number, numToRepeat = 0) =>
  () =>
    setTimeout(() => {
      fn();
      if (numToRepeat > 0) {
        timeoutRepeater(fn, timeout, numToRepeat - 1)();
      }
    }, timeout);

interface HomeProps {
  children?: React.ReactNode;
  hasHIDSupport: boolean;
}

export const Home: React.FC<HomeProps> = (props) => {
  const {t} = useTranslation();
  const {hasHIDSupport} = props;

  const dispatch = useAppDispatch();
  const selectedKey = useAppSelector(getSelectedKey);
  const selectedDefinition = useAppSelector(getSelectedDefinition);
  const connectedDevices = useAppSelector(getConnectedDevices);
  const invalidProtocolDevice = useAppSelector(
    getInvalidProtocolDeviceWarning,
  );
  const unresolvedDefinitionDevice = useAppSelector(
    getUnresolvedDefinitionDeviceWarning,
  );
  const selectedLayerIndex = useAppSelector(getSelectedLayerIndex);
  const selectedKeyDefinitions = useAppSelector(getSelectedKeyDefinitions);
  const disableFastRemap = useAppSelector(getDisableFastRemap);
  const {basicKeyToByte} = useAppSelector(getBasicKeyToByte);
  const api = useAppSelector(getSelectedKeyboardAPI);

  /*
   * 장치를 훑을 때 **부트로더도 같이 본다.**
   *
   * VIA 쪽 목록에는 절대 안 나온다 — usage page 가 0xFF53 이라 필터에서 걸러진다.
   * iapFind() 는 이미 받아 둔 권한 안에서 조용히 훑을 뿐이라 선택 창이 안 뜬다.
   *
   * ★ 한 번이라도 구운 적이 있어야 보인다. 굽다 만 보드를 되살리는 것이 이 기능의
   *   목적이라 그 경우가 대부분이고, 권한이 아예 없으면 "장치 승인" 으로 직접
   *   고르는 길이 남는다.
   */
  const probeBootloader = () => {
    iapFind()
      .then((d) => dispatch(setBootloaderSeen(d !== null)))
      .catch(() => dispatch(setBootloaderSeen(false)));

    /*
     * ★ **순정 펌웨어가 도는 보드도 같이 본다.**
     *
     *   그 보드는 VIA 목록에 안 뜬다 — 순정 앱에는 우리 0xFF60 채널이 없다.
     *   여기서 못 보면 사용자가 앱으로 그 보드에 손댈 방법이 아예 없다.
     */
    iapFindVendorApp()
      .then((spec) => dispatch(setVendorSeen(spec !== null)))
      .catch(() => dispatch(setVendorSeen(false)));
  };

  const updateDevicesRepeat: () => void = timeoutRepeater(
    () => {
      dispatch(reloadConnectedDevices());
      probeBootloader();
    },
    500,
    1,
  );

  /*
   * ★ 이벤트 때만 보면 **참으로 굳는다.**
   *
   *   위 updateDevicesRepeat 는 USB 이벤트마다 500ms·1000ms 두 번 훑고 끝난다.
   *   굽기가 끝나 보드가 앱으로 재열거되는 구간이 딱 그 두 번에 걸치는데, 그때
   *   부트로더가 아직 목록에 남아 있으면 참으로 굳고 **그 뒤로 아무도 다시 안 봤다.**
   *   화면이 부트로더 전용으로 접힌 채, 새로고침해야만 돌아왔다.
   *
   *   그래서 값의 출처를 이벤트 래치에서 **주기 확인**으로 바꾼다. 이벤트 쪽도
   *   그대로 두므로 반응은 여전히 빠르고, 놓친 경우를 이쪽이 1초 안에 줍는다.
   *
   *   비용은 없다시피 하다 — getDevices() 는 이미 준 권한 안에서 훑을 뿐이라
   *   선택 창도 제스처도 없다. 같은 값 재대입은 리듀서가 걸러 재랜더도 안 는다.
   */
  useEffect(() => {
    if (!hasHIDSupport) return;
    const id = setInterval(probeBootloader, 1000);
    return () => clearInterval(id);
  }, []);

  /*
   * ★ 장치가 하나도 없으면 **천천히 계속 다시 훑는다.**
   *
   *   VIA 는 USB 연결/해제 이벤트에만 반응한다. 그런데 그 이벤트가 온 순간에 장치를
   *   못 잡으면(재열거 직후라 아직 안 뜬 경우, 또는 재시도를 다 쓰고 장치 목록을
   *   비운 경우) **그 뒤로 아무도 다시 안 본다.** 이벤트는 이미 지나갔기 때문이다.
   *
   *   펌웨어를 굽고 나면 정확히 그렇게 됐다 — 화면이 "키보드를 연결하면" 으로 굳고
   *   **새로고침해야만** 돌아왔다. 새로고침이 듣는다는 것은 다시 훑기만 하면 된다는 뜻이다.
   *
   * ★ 3초다. 1초로 하지 않는다.
   *
   *   selectConnectedDevice 는 자체 재시도(8회)를 돌린다. 그보다 촘촘히 부르면
   *   재시도와 겹쳐 오히려 실패를 재촉한다.
   *
   * ★ 붙어 있을 때는 아무것도 안 한다. 멀쩡한 세션을 건드릴 이유가 없다.
   */
  useEffect(() => {
    if (!hasHIDSupport) return;
    if (Object.values(connectedDevices).length > 0) return;

    const id = setInterval(() => dispatch(reloadConnectedDevices()), 3000);
    return () => clearInterval(id);
  }, [connectedDevices]);

  /*
   * ★ 여기서 HE 탭으로 **자동으로 데려가지 않는다.** (한 번 넣었다가 뺐다)
   *
   *   부트로더가 보이면 곧장 /he 로 옮기게 해 봤는데, 접속하자마자 그리로 튀었다.
   *   WebHID 권한은 장치별로 남아서 한 번 구운 적이 있으면 뽑아 둬도 부트로더가
   *   보일 수 있다 — 그러면 키보드를 안 꽂았는데도 HE 화면으로 끌려가고, 거기엔
   *   보여줄 것이 없어 빈 화면이 된다.
   *
   *   탭은 그대로 뜬다 (global.tsx 의 showHeTab 이 bootloaderSeen 을 본다).
   *   갈지 말지는 사용자가 정한다.
   *
   *   부트로더로 **명시적으로 붙었을 때**는 여전히 바로 옮긴다 —
   *   useBootConnect({goHe: true}) 가 그 자리다. 그건 사용자가 버튼을 누른 것이라
   *   화면을 옮겨도 놀랄 일이 없다.
   */

  const toggleLights = async () => {
    if (!api || !selectedDefinition) {
      return;
    }

    const delay = 200;

    if (
      isVIADefinitionV2(selectedDefinition) &&
      getLightingDefinition(
        selectedDefinition.lighting,
      ).supportedLightingValues.includes(LightingValue.BACKLIGHT_EFFECT)
    ) {
      const val = await api.getRGBMode();
      const newVal = val !== 0 ? 0 : 1;
      for (let i = 0; i < 3; i++) {
        api.timeout(i === 0 ? 0 : delay);
        api.setRGBMode(newVal);
        api.timeout(delay);
        await api.setRGBMode(val);
      }
    }

    if (isVIADefinitionV3(selectedDefinition)) {
      for (let i = 0; i < 6; i++) {
        api.timeout(i === 0 ? 0 : delay);
        await api.setKeyboardValue(KeyboardValue.DEVICE_INDICATION, i);
      }
    }
  };

  const homeElem = createRef<HTMLDivElement>();

  useEffect(() => {
    if (!hasHIDSupport) {
      return;
    }

    if (homeElem.current) {
      homeElem.current.focus();
    }

    startMonitoring();
    usbDetect.on('change', updateDevicesRepeat);
    dispatch(loadSupportedIds());

    return () => {
      // Cleanup function equiv to componentWillUnmount
      usbDetect.off('change', updateDevicesRepeat);
    };
  }, []); // Passing an empty array as the second arg makes the body of the function equiv to componentDidMount (not including the cleanup func)

  useEffect(() => {
    dispatch(updateSelectedKeyAction(null));

    // Only trigger flashing lights when multiple devices are connected
    // if (Object.values(connectedDevices).length > 1) {
    //   toggleLights();
    // }
  }, [api]);

  useEffect(() => {
    if (!api) {
      return;
    }

    return api.addUISyncRequestHandler((request) => {
      dispatch(syncCustomMenuValuesFromRequest(request));
    });
  }, [api]);

  return !hasHIDSupport && !OVERRIDE_HID_CHECK ? (
    <ErrorHome ref={homeElem} tabIndex={0}>
      <UsbError>
        <UsbErrorIcon>❌</UsbErrorIcon>
        <UsbErrorHeading>{t('USB Detection Error')}</UsbErrorHeading>
        <p>
          Looks like there was a problem getting USB detection working. Right
          now, we only support{' '}
          <UsbErrorWebHIDLink
            href="https://caniuse.com/?search=webhid"
            target="_blank"
          >
            browsers that have WebHID enabled
          </UsbErrorWebHIDLink>
          , so make sure yours is compatible before trying again.
        </p>
      </UsbError>
    </ErrorHome>
  ) : (
    <>
      {invalidProtocolDevice && (
        <MessageDialog
          isOpen={true}
          confirmLabel="OK"
          onConfirm={() => {
            dispatch(dismissInvalidProtocolDevice(invalidProtocolDevice));
          }}
        >
          {t(
            "VIA can see {{deviceName}} through WebHID.\nVID: {{vid}} | PID: {{pid}}\n\n{{deviceName}} does not seem to respond like a VIA-enabled keyboard.\n\nIf {{deviceName}} should support VIA, make sure it is running VIA-compatible firmware.\nIf it is, authorization and/or initialization procedures may have failed—unplug the keyboard, reconnect it, and try again.\nIf the problem persists, please contact your keyboard's manufacturer or vendor for assistance.",
            {
              deviceName: invalidProtocolDevice.productName || t('this device'),
              vid: formatNumberAsHex(invalidProtocolDevice.vendorId, 4),
              pid: formatNumberAsHex(invalidProtocolDevice.productId, 4),
            },
          )}
        </MessageDialog>
      )}
      {!invalidProtocolDevice && unresolvedDefinitionDevice && (
        <MessageDialog
          isOpen={true}
          confirmLabel="OK"
          onConfirm={() => {
            dispatch(
              dismissUnresolvedDefinitionDevice(unresolvedDefinitionDevice),
            );
          }}
        >
          {t(
            "VIA could not find a {{definitionVersion}} definition for {{deviceName}}.\nVID: {{vid}} | PID: {{pid}}\n\nThis means that:\n- this keyboard is not officially supported through the remote definition database\n- the definition file of the keyboard has not been sideloaded through the Design tab\n\nPlease contact your keyboard's manufacturer or vendor to add it to the database, or upload the JSON definition provided by your keyboard's manufacturer or vendor in the Design tab.",
            {
              definitionVersion:
                unresolvedDefinitionDevice.requiredDefinitionVersion.toUpperCase(),
              deviceName:
                unresolvedDefinitionDevice.productName || t('this keyboard'),
              vid: formatNumberAsHex(unresolvedDefinitionDevice.vendorId, 4),
              pid: formatNumberAsHex(unresolvedDefinitionDevice.productId, 4),
            },
          )}
        </MessageDialog>
      )}
      {props.children}
    </>
  );
};
