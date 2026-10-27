import React, {useEffect, useMemo, useRef, useState} from 'react';
import {KeyboardAPI} from 'src/utils/keyboard-api';
import {HE_BOARDS} from 'src/utils/he-boards';
import {heMakeSend, heReadUuid} from 'src/utils/he-api';
import styled from 'styled-components';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faAngleDown, faPlus} from '@fortawesome/free-solid-svg-icons';
import {HID} from '../../../shims/node-hid';
import type {VIADefinitionV2, VIADefinitionV3} from '@the-via/reader';
import type {ConnectedDevice} from '../../../types/types';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {
  getDefinitions,
  getSelectedDefinition,
} from 'src/store/definitionsSlice';
import {
  getConnectedDevices,
  getSelectedDevicePath,
} from 'src/store/devicesSlice';
import {selectConnectedDeviceByPath} from 'src/store/devicesThunks';
import {isElectron} from 'src/utils/running-context';
import {useTranslation} from 'react-i18next';
import {
  getConnectedDefinitionNames,
  getSelectedDefinitionName,
} from 'src/store/definitionNameSlice';

const Container = styled.div`
  position: absolute;
  right: 15px;
  top: 0px;
  font-size: 18px;
  pointer-events: none;
  font-weight: 400;
`;

const KeyboardTitle = styled.label`
  pointer-events: all;
  display: inline-block;
  background: var(--color_accent);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  font-size: 18px;
  text-transform: uppercase;
  color: var(--color_inside-accent);
  padding: 1px 10px;
  margin-right: 10px;
  border: solid 1px var(--bg_control);
  border-top: none;
  cursor: pointer;
  transition: all 0.1s ease-out;
  &:hover {
    filter: brightness(0.7);
  }
`;
const KeyboardList = styled.ul<{$show: boolean}>`
  padding: 0;
  border: 1px solid var(--bg_control);
  width: 160px;
  border-radius: 6px;
  background-color: var(--bg_menu);
  margin: 0;
  margin-top: 5px;
  right: 10px;
  position: absolute;
  pointer-events: ${(props) => (props.$show ? 'all' : 'none')};
  transition: all 0.2s ease-out;
  z-index: 11;
  opacity: ${(props) => (props.$show ? 1 : 0)};
  overflow: hidden;
  transform: ${(props) => (props.$show ? 0 : `translateY(-5px)`)};
`;
const KeyboardButton = styled.button<{$selected?: boolean}>`
  display: block;
  text-align: center;
  outline: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  border: none;
  background: ${(props) =>
    props.$selected ? 'var(--bg_icon-highlighted)' : 'transparent'};
  color: ${(props) =>
    props.$selected
      ? 'var(--color_icon_highlighted)'
      : 'var(--color_label-highlighted)'};
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  text-transform: uppercase;
  padding: 5px 10px;
  &:hover {
    border: none;
    background: ${(props) =>
      props.$selected ? 'var(--bg_icon-highlighted)' : 'var(--bg_control)'};
    color: ${(props) =>
      props.$selected
        ? 'var(--color_control-highlighted)'
        : 'var(--color_label-highlighted)'};
  }
`;

const ClickCover = styled.div`
  position: fixed;
  z-index: 10;
  pointer-events: all;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.4;
  background: rgba(0, 0, 0, 0.75);
`;

type ConnectedKeyboardDefinition = [
  string,
  VIADefinitionV2 | VIADefinitionV3,
  string,
];

const KeyboardSelectors: React.FC<{
  show: boolean;
  keyboards: ConnectedKeyboardDefinition[];
  selectedPath: string;
  onClickOut: () => void;
  selectKeyboard: (kb: string) => void;
}> = (props) => {
  const {t} = useTranslation();
  const requestAndChangeDevice = async () => {
    const device = await HID.requestDevice();
    if (device) {
      props.selectKeyboard((device as any).__path);
    }
  };
  return (
    <>
      {props.show && <ClickCover onClick={props.onClickOut} />}
      <KeyboardList $show={props.show}>
        {props.keyboards.map(([path, , name]) => {
          return (
            <KeyboardButton
              $selected={path === props.selectedPath}
              key={path}
              onClick={() => props.selectKeyboard(path as string)}
            >
              {name}
            </KeyboardButton>
          );
        })}
        {!isElectron && (
          <KeyboardButton onClick={requestAndChangeDevice}>
            {t('Authorize New')}
            <FontAwesomeIcon icon={faPlus} style={{marginLeft: '10px'}} />
          </KeyboardButton>
        )}
      </KeyboardList>
    </>
  );
};

export const Badge = () => {
  const dispatch = useAppDispatch();
  const definitions = useAppSelector(getDefinitions);
  const selectedDefinition = useAppSelector(getSelectedDefinition);
  const selectedDefinitionName = useAppSelector(getSelectedDefinitionName);
  const getConnectedDefinitionName = useAppSelector(
    getConnectedDefinitionNames,
  );
  const connectedDevices = useAppSelector(getConnectedDevices);
  const selectedPath = useAppSelector(getSelectedDevicePath);
  const [showList, setShowList] = useState(false);

  /*
   * ★ (상류 대비 수정) 같은 이름의 보드를 가르는 짧은 ID — 칩 UUID 의 끝 4자리.
   *
   *   같은 모델을 두 대 꽂으면 목록에 같은 이름이 두 줄 떠서 어느 쪽이 어느 실물인지
   *   모른다. HE 보드에게만 한 번씩 묻고 경로별로 기억한다. 명령은 he-api 의 줄과
   *   KeyboardAPI 의 장치별 큐를 둘 다 지나므로 다른 화면의 왕복과 섞이지 않는다.
   */
  const [shortIds, setShortIds] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());   /* 답을 기다리는 중에 또 묻지 않게 */
  useEffect(() => {
    /*
     * 회차별 alive 로 답을 버리지 않는다. 목록이 바뀌어 effect 가 다시 돌면 기다리던
     * 답이 버려지는데, 그 경로는 이미 물어 본 것으로 남아 다시 안 묻는다 — ID 가 영영
     * 안 붙는다.
     */
    Object.entries(connectedDevices).forEach(([path, device]) => {
      const d = device as ConnectedDevice;
      if (asked.current.has(path) || !HE_BOARDS.has(d.vendorProductId)) return;
      asked.current.add(path);
      heReadUuid(heMakeSend(new KeyboardAPI(path)))
        .then((u) => setShortIds((m) => ({...m, [path]: u ? u.slice(-4) : ''})))
        .catch(() => setShortIds((m) => ({...m, [path]: ''})));
    });
  }, [connectedDevices]);

  const connectedKeyboardDefinitions: ConnectedKeyboardDefinition[] = useMemo(
    () =>
      Object.entries(connectedDevices)
        .map<ConnectedKeyboardDefinition>(([path, device]) => {
          const connectedDevice = device as ConnectedDevice;
          return [
            path,
            definitions[connectedDevice.vendorProductId] &&
              definitions[connectedDevice.vendorProductId][
                connectedDevice.requiredDefinitionVersion
              ],
            getConnectedDefinitionName(connectedDevice),
          ];
        })
        .filter((i) => i[1])
        /* 이름이 겹칠 때만 ID 를 붙인다 — 한 대일 때는 상류와 똑같이 보인다 */
        .map<ConnectedKeyboardDefinition>((kb, _, all) => {
          const dup = all.filter((o) => o[2] === kb[2]).length > 1;
          const id = shortIds[kb[0]];
          return dup && id ? [kb[0], kb[1], `${kb[2]} · ${id}`] : kb;
        }),
    [connectedDevices, definitions, getConnectedDefinitionName, shortIds],
  );

  /* 고른 보드도 이름이 겹칠 때만 ID 를 붙인다 */
  const selectedDup =
    connectedKeyboardDefinitions.filter(([, , name]) =>
      name.startsWith(`${selectedDefinitionName} · `),
    ).length > 1;
  const selectedTitle =
    selectedDup && shortIds[selectedPath ?? '']
      ? `${selectedDefinitionName} · ${shortIds[selectedPath ?? '']}`
      : selectedDefinitionName;

  if (!selectedDefinition || !selectedPath) {
    return null;
  }

  return (
    <>
      <Container>
        <KeyboardTitle onClick={() => setShowList(!showList)}>
          {selectedTitle}
          <FontAwesomeIcon
            icon={faAngleDown}
            style={{
              transform: showList ? 'rotate(180deg)' : '',
              transition: 'transform 0.2s ease-out',
              marginLeft: '5px',
            }}
          />
        </KeyboardTitle>
        <KeyboardSelectors
          show={showList}
          selectedPath={selectedPath}
          keyboards={connectedKeyboardDefinitions}
          onClickOut={() => setShowList(false)}
          selectKeyboard={(path) => {
            dispatch(selectConnectedDeviceByPath(path));
            setShowList(false);
          }}
        />
      </Container>
    </>
  );
};
