import React, {useState, useEffect} from 'react';
import {faPlus} from '@fortawesome/free-solid-svg-icons';
import styled from 'styled-components';
import ChippyLoader from '../chippy-loader';
import LoadingText from '../loading-text';
import {CenterPane, ConfigureBasePane} from './pane';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
  CustomFeaturesV2,
  getLightingDefinition,
  isVIADefinitionV2,
  isVIADefinitionV3,
  VIADefinitionV2,
  VIADefinitionV3,
} from '@the-via/reader';
import {Grid, Row, IconContainer, MenuCell, ConfigureFlexCell} from './grid';
import * as Keycode from './configure-panes/keycode';
import * as Lighting from './configure-panes/lighting';
import * as Macros from './configure-panes/macros';
import * as SaveLoad from './configure-panes/save-load';
import * as Layouts from './configure-panes/layouts';
import * as RotaryEncoder from './configure-panes/custom/satisfaction75';
import {makeCustomMenus} from './configure-panes/custom/menu-generator';
import {LayerControl} from './configure-panes/layer-control';
import {Badge} from './configure-panes/badge';
import {ProfileSelect} from 'src/components/menus/profile-select';
import {getHeSwitching} from 'src/store/heSlice';
import {AccentButtonLarge} from '../inputs/accent-button';
import {useAppSelector} from 'src/store/hooks';
import {getSelectedDefinition} from 'src/store/definitionsSlice';
import {
  clearSelectedKey,
  getLoadProgress,
  getNumberOfLayers,
  setConfigureKeyboardIsSelectable,
} from 'src/store/keymapSlice';
import {useDispatch} from 'react-redux';
import {reloadConnectedDevices} from 'src/store/devicesThunks';
import {getV3MenuComponents} from 'src/store/menusSlice';
import {getIsMacroFeatureSupported} from 'src/store/macrosSlice';
import {getConnectedDevices, getSupportedIds} from 'src/store/devicesSlice';
import {isElectron} from 'src/utils/running-context';
import {useAppDispatch} from 'src/store/hooks';
import {MenuTooltip} from '../inputs/tooltip';
import {getRenderMode, getSelectedTheme} from 'src/store/settingsSlice';
import {useTranslation} from 'react-i18next';

const MenuContainer = styled.div`
  padding: 15px 10px 20px 10px;
`;

const Rows = [
  Keycode,
  Macros,
  Layouts,
  Lighting,
  SaveLoad,
  RotaryEncoder,
  ...makeCustomMenus([]),
];
function getCustomPanes(customFeatures: CustomFeaturesV2[]) {
  if (
    customFeatures.find((feature) => feature === CustomFeaturesV2.RotaryEncoder)
  ) {
    return [RotaryEncoder];
  }
  return [];
}

const getRowsForKeyboard = (): typeof Rows => {
  const showMacros = useAppSelector(getIsMacroFeatureSupported);
  const v3Menus = useAppSelector(getV3MenuComponents);
  const selectedDefinition = useAppSelector(getSelectedDefinition);
  const numberOfLayers = useAppSelector(getNumberOfLayers);

  if (!selectedDefinition) {
    return [];
  } else if (isVIADefinitionV2(selectedDefinition)) {
    return getRowsForKeyboardV2(selectedDefinition, showMacros, numberOfLayers);
  } else if (isVIADefinitionV3(selectedDefinition)) {
    return [
      ...filterInferredRows(selectedDefinition, showMacros, numberOfLayers, [
        Keycode,
        Layouts,
        Macros,
        SaveLoad,
      ]),
      ...v3Menus,
    ];
  } else {
    return [];
  }
};

const filterInferredRows = (
  selectedDefinition: VIADefinitionV3 | VIADefinitionV2,
  showMacros: boolean,
  numberOfLayers: number,
  rows: typeof Rows,
): typeof Rows => {
  const {layouts} = selectedDefinition;
  let removeList: typeof Rows = [];
  // LAYOUTS IS INFERRED, filter out if doesn't exist
  if (
    !(layouts.optionKeys && Object.entries(layouts.optionKeys).length !== 0)
  ) {
    removeList = [...removeList, Layouts];
  }

  if (numberOfLayers === 0) {
    removeList = [...removeList, Keycode, SaveLoad];
  }

  if (!showMacros) {
    removeList = [...removeList, Macros];
  }
  let filteredRows = rows.filter(
    (row) => !removeList.includes(row),
  ) as typeof Rows;
  return filteredRows;
};

const getRowsForKeyboardV2 = (
  selectedDefinition: VIADefinitionV2,
  showMacros: boolean,
  numberOfLayers: number,
): typeof Rows => {
  let rows: typeof Rows = [Keycode, Layouts, Macros, SaveLoad];
  if (isVIADefinitionV2(selectedDefinition)) {
    const {lighting, customFeatures} = selectedDefinition;
    const {supportedLightingValues} = getLightingDefinition(lighting);
    if (supportedLightingValues.length !== 0) {
      rows = [...rows, Lighting];
    }
    if (customFeatures) {
      rows = [...rows, ...getCustomPanes(customFeatures)];
    }
  }
  return filterInferredRows(
    selectedDefinition,
    showMacros,
    numberOfLayers,
    rows,
  );
};

const Loader: React.FC<{
  loadProgress: number;
  selectedDefinition: VIADefinitionV2 | VIADefinitionV3 | null;
}> = (props) => {
  const {t} = useTranslation();
  const {loadProgress, selectedDefinition} = props;
  const dispatch = useAppDispatch();
  const theme = useAppSelector(getSelectedTheme);

  const connectedDevices = useAppSelector(getConnectedDevices);
  const supportedIds = useAppSelector(getSupportedIds);
  const noSupportedIds = !Object.values(supportedIds).length;
  const noConnectedDevices = !Object.values(connectedDevices).length;
  const [showButton, setShowButton] = useState<boolean>(false);

  useEffect(() => {
    // TODO: Remove the timeout because it is funky
    const timeout = setTimeout(() => {
      if (!selectedDefinition) {
        setShowButton(true);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [selectedDefinition]);
  return (
    <LoaderPane>
      {<ChippyLoader theme={theme} progress={loadProgress || null} />}
      {(showButton || noConnectedDevices) && !noSupportedIds && !isElectron ? (
        <AccentButtonLarge onClick={() => dispatch(reloadConnectedDevices())}>
          {t('Authorize device')}
          <FontAwesomeIcon style={{marginLeft: '10px'}} icon={faPlus} />
        </AccentButtonLarge>
      ) : (
        <LoadingText isSearching={!selectedDefinition} />
      )}
    </LoaderPane>
  );
};

const LoaderPane = styled(CenterPane)`
  display: flex;
  align-items: center;
  justify-content: center;
  row-gap: 50px;
  position: absolute;
  bottom: 50px;
  top: 50px;
  left: 0;
  right: 0;
  z-index: 4;
`;

/*
 * 프로파일을 갈아 끼우는 동안 덮는 막.
 *
 * ★ 로딩 화면으로 갈아타지 않는다.
 *
 *   전환은 키맵을 다시 읽는 일이라 200ms 쯤 걸린다. 그동안 "다 읽지 못했다" 가 되어
 *   캐릭터 로딩 화면이 번쩍 나타났다 사라졌다 — 짧아서 더 거슬린다.
 *
 *   화면은 그대로 두고 살짝 어둡게만 한다. 무엇을 보고 있었는지가 유지되고, 뭔가
 *   진행 중이라는 것도 보인다. 그동안 클릭은 막는다 — 반쯤 읽힌 키맵을 만지면
 *   옛 값이 새 프로파일에 써진다.
 */
const SwitchVeil = styled.div`
  position: absolute;
  top: 50px;
  bottom: 50px;
  left: 0;
  right: 0;
  z-index: 5;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: all;
`;

export const ConfigurePane = () => {
  const selectedDefinition = useAppSelector(getSelectedDefinition);
  const loadProgress = useAppSelector(getLoadProgress);
  const renderMode = useAppSelector(getRenderMode);
  const switching = useAppSelector(getHeSwitching);

  const showLoader = (!selectedDefinition || loadProgress !== 1) && !switching;
  return showLoader ? (
    renderMode === '2D' ? (
      <Loader
        selectedDefinition={selectedDefinition || null}
        loadProgress={loadProgress}
      />
    ) : null
  ) : (
    <ConfigureBasePane>
      {switching && <SwitchVeil />}
      <ConfigureGrid />
    </ConfigureBasePane>
  );
};

const ConfigureGrid = () => {
  const {t} = useTranslation();
  const dispatch = useDispatch();

  const [selectedRow, setRow] = useState(0);
  const KeyboardRows = getRowsForKeyboard();
  const SelectedPane = KeyboardRows[selectedRow]?.Pane;
  const selectedTitle = KeyboardRows[selectedRow]?.Title;

  useEffect(() => {
    if (selectedTitle !== 'Keymap') {
      dispatch(setConfigureKeyboardIsSelectable(false));
    } else {
      dispatch(setConfigureKeyboardIsSelectable(true));
    }
  }, [selectedTitle]);

  return (
    <>
      <ConfigureFlexCell
        onClick={(evt) => {
          if ((evt.target as any).nodeName !== 'CANVAS')
            dispatch(clearSelectedKey());
        }}
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: 50,
          left: 0,
          right: 0,
        }}
      >
        <div style={{pointerEvents: 'all'}}>
          <LayerControl />
          <Badge />
          <ProfileSelect />
        </div>
      </ConfigureFlexCell>
      <Grid style={{pointerEvents: 'none'}}>
        <MenuCell style={{pointerEvents: 'all'}}>
          <MenuContainer>
            {(KeyboardRows || []).map(
              ({Icon, Title}: {Icon: any; Title: string}, idx: number) => (
                <Row
                  key={idx}
                  onClick={(_) => setRow(idx)}
                  $selected={selectedRow === idx}
                >
                  <IconContainer>
                    <Icon />
                    <MenuTooltip>{t(Title)}</MenuTooltip>
                  </IconContainer>
                </Row>
              ),
            )}
          </MenuContainer>
        </MenuCell>

        {SelectedPane && <SelectedPane />}
      </Grid>
    </>
  );
};
