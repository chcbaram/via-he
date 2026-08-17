import React, {createRef, useEffect, useRef} from 'react';
import styled from 'styled-components';
import {useLocation} from 'wouter';
import {iapFind} from 'src/utils/he-iap';
import {getHeBootloaderSeen, setBootloaderSeen} from 'src/store/heSlice';
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
   * 부트로더뿐이면 **HE 탭으로 데려간다.**
   *
   * 그 상태에서 앱이 할 수 있는 일은 굽는 것 하나뿐인데, 그 화면이 탭 안에 있다.
   * 첫 화면에 세워 두면 "장치를 찾는 중" 만 돌아 무엇을 해야 할지 알 수 없다.
   *
   * ★ 한 번만 옮긴다.
   *
   *   계속 옮기면 부트로더에 둔 채 다른 탭을 못 본다 — 나가려 할 때마다 끌려온다.
   *   거짓으로 돌아가면 다시 무장하므로, 굽고 나서 또 넘어가면 그때 다시 데려간다.
   *
   * ★ VIA 장치가 하나라도 있으면 안 옮긴다. 정상으로 붙은 키보드를 보고 있는데
   *   부트로더가 옆에 물려 있다고 화면을 뺏을 이유가 없다.
   */
  const bootloaderSeen = useAppSelector(getHeBootloaderSeen);
  const [location, setLocation] = useLocation();
  const bootJumped = useRef(false);
  useEffect(() => {
    if (!bootloaderSeen) {
      bootJumped.current = false;
      return;
    }
    if (bootJumped.current) return;
    if (Object.values(connectedDevices).length > 0) return;
    bootJumped.current = true;
    if (location !== '/he') setLocation('/he');
  }, [bootloaderSeen, connectedDevices, location]);

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
