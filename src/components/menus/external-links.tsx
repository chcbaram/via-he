import {faGithub} from '@fortawesome/free-brands-svg-icons';
import {faPlug} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import styled from 'styled-components';
import {useTranslation} from 'react-i18next';
import {useAppDispatch} from 'src/store/hooks';
import {setForceAuthorize} from 'src/store/devicesSlice';
import {reloadConnectedDevices} from 'src/store/devicesThunks';
import {HID} from 'src/shims/node-hid';
import {useLocation} from 'wouter';
import {iapFind, iapFindVendorApp} from 'src/utils/he-iap';
import {
  askFirmwarePane,
  setBootloaderSeen,
  setVendorSeen,
} from 'src/store/heSlice';
import {VIALogo} from '../icons/via';
import {CategoryMenuTooltip} from '../inputs/tooltip';
import {CategoryIconContainer} from '../panes/grid';
import {LanguageSelect} from './language-select';

const ExternalLinkContainer = styled.span`
  position: absolute;
  right: 1em;
  display: flex;
  gap: 1em;
`;

/*
 * **연결 — 어디서나 장치를 고를 수 있게.** (상류에 없는 것)
 *
 * ★ 첫 화면에만 있으면 닿지 못하는 보드가 있다.
 *
 *   부트로더에 멈춘 보드와 순정 펌웨어 보드는 VIA 목록에 안 뜬다. 그런데 다른
 *   키보드가 하나라도 잡혀 있으면 첫 화면(로더) 자체가 안 나오므로, **그 보드를
 *   승인할 자리가 사라진다.** 우리 키보드를 쓰는 사람이 순정 보드를 하나 더
 *   사는 순간이 정확히 그 상황이다.
 *
 *   그래서 머리말에 둔다. 여기는 어느 화면에서든 보인다.
 *
 * ★ 하는 일은 첫 화면의 "장치 승인" 과 같다. 크롬 선택 창은 forceAuthorize 가
 *   서야 열리고(devicesThunks), 그 목록에는 우리 필터가 전부 들어 있다 —
 *   키보드도, 부트로더도, 순정 보드도 같이 나온다.
 */
const ConnectButton = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        /*
         * ★ **선택 창을 클릭 안에서 곧바로 연다.**
         *
         *   첫 화면의 "장치 승인" 은 forceAuthorize 를 세우고 재스캔에 맡기는데,
         *   그 길에는 requestDevice() 앞에 비동기 경계가 하나 끼어 있다. 크롬은
         *   그 창을 **사용자 제스처 안에서만** 열어 주므로 놓칠 수 있다.
         *
         *   여기서는 창을 먼저 열고, 받은 권한을 재스캔이 줍게 한다.
         */
        HID.requestDevice()
          .catch(() => {}) /* 그냥 닫았다 */
          .then(async () => {
            dispatch(setForceAuthorize(false));
            dispatch(reloadConnectedDevices());

            /*
             * ★ **고른 것이 IAP 보드면 그 화면까지 데려간다.**
             *
             *   부트로더 보드와 순정 보드는 VIA 목록에 안 뜨므로, 승인만 하고
             *   가만히 있으면 **아무 일도 안 일어난 것처럼 보인다** — 바뀌는 것이
             *   HE 의 펌웨어 화면 안에만 있어서 다른 탭을 보고 있으면 모른다.
             *   그 보드로 할 수 있는 일이 거기 하나뿐이니 바로 데려간다.
             */
            const boot = await iapFind().catch(() => null);
            if (boot) {
              dispatch(setBootloaderSeen(true));
              setLocation('/he');
              dispatch(askFirmwarePane());
              return;
            }
            const vendor = await iapFindVendorApp().catch(() => null);
            if (vendor) {
              dispatch(setVendorSeen(true));
              setLocation('/he');
              dispatch(askFirmwarePane());
            }
          });
      }}
    >
      <CategoryIconContainer>
        <FontAwesomeIcon size={'xl'} icon={faPlug} />
        <CategoryMenuTooltip>{t('he.connect')}</CategoryMenuTooltip>
      </CategoryIconContainer>
    </a>
  );
};

export const ExternalLinks = () => (
  <ExternalLinkContainer>
    <ConnectButton />
    {/*
      * ★ 언어 고르기가 이 줄의 맨 앞이다. (상류 대비 수정)
      *
      *   원래도 오른쪽 묶음의 왼쪽에 있었다 — 다만 `position: absolute; right: 200px`
      *   로 화면에 못박혀 있어서, 디스코드를 빼자 그 사이가 빈 채로 남았다.
      *
      *   이제 이 줄 안에 같이 실린다. 보이는 순서는 그대로고, 아이콘을 더하거나
      *   빼도 간격이 알아서 맞는다.
      */}
    <LanguageSelect />
    <a href="https://caniusevia.com/" target="_blank">
      <CategoryIconContainer>
        <VIALogo height="25px" fill="currentColor" />
        <CategoryMenuTooltip>Firmware + Docs</CategoryMenuTooltip>
      </CategoryIconContainer>
    </a>
    {/*
      * 깃허브도 이 포크로 돌린다 — 아이콘을 눌러 도착한 곳이 지금 보고 있는 앱과
      * 달라서는 안 된다.
      */}
    <a href="https://github.com/chcbaram/via-he" target="_blank">
      <CategoryIconContainer>
        <FontAwesomeIcon size={'xl'} icon={faGithub} />
        <CategoryMenuTooltip>Github</CategoryMenuTooltip>
      </CategoryIconContainer>
    </a>
  </ExternalLinkContainer>
);
