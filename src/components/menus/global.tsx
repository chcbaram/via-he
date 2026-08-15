import React, {useMemo} from 'react';
import styled from 'styled-components';
import {Link, useLocation} from 'wouter';
import PANES from '../../utils/pane-config';
import {useAppSelector} from 'src/store/hooks';
import {getShowConsoleTab, getShowDesignTab} from 'src/store/settingsSlice';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {CategoryMenuTooltip} from '../inputs/tooltip';
import {CategoryIconContainer} from '../panes/grid';
import {ErrorLink, ErrorsPaneConfig} from '../panes/errors';
import {ExternalLinks} from './external-links';
import {useTranslation} from 'react-i18next';
import {LanguageSelect} from './language-select';

const Container = styled.div`
  width: 100vw;
  height: 25px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border_color_cell);
  display: flex;
  align-items: center;
  justify-content: center;
`;

import {getSelectedDefinition} from 'src/store/definitionsSlice';
import {HE_BOARDS} from 'src/utils/he-boards';

const {DEBUG_PROD, MODE, DEV} = import.meta.env;
const showDebugPane = MODE === 'development' || DEBUG_PROD === 'true' || DEV;

const GlobalContainer = styled(Container)`
  background: var(--bg_outside-accent);
  column-gap: 20px;
`;

export const UnconnectedGlobalMenu = () => {
  const {t, i18n} = useTranslation();
  const showDesignTab = useAppSelector(getShowDesignTab);
  const showConsoleTab = useAppSelector(getShowConsoleTab);

  /*
   * HE 탭은 홀이펙트 보드에서만 보인다.
   *
   * 장치에 명령을 던져 알아낼 수도 있지만, 아닌 보드에서는 그 명령이 실패로
   * 기록돼 로그가 지저분해진다. 목록은 local-kbs/ 에서 빌드 때 뽑는다
   * (scripts/add-local-kbs.ts -> src/utils/he-boards.ts).
   */
  const selectedDefinition = useAppSelector(getSelectedDefinition);
  const showHeTab =
    !!selectedDefinition && HE_BOARDS.has(selectedDefinition.vendorProductId);

  const [location] = useLocation();

  const Panes = useMemo(() => {
    return PANES.filter((pane) => pane.key !== ErrorsPaneConfig.key).map(
      (pane) => {
        if (pane.key === 'design' && !showDesignTab) return null;
        if (pane.key === 'console' && !showConsoleTab) return null;
        if (pane.key === 'debug' && !showDebugPane) return null;
        if (pane.key === 'he' && !showHeTab) return null;
        return (
          <Link key={pane.key} to={pane.path}>
            <CategoryIconContainer $selected={pane.path === location}>
              <FontAwesomeIcon size={'xl'} icon={pane.icon} />
              <CategoryMenuTooltip>{t(pane.title)}</CategoryMenuTooltip>
            </CategoryIconContainer>
          </Link>
        );
      },
    );
  }, [location, showConsoleTab, showDesignTab, showHeTab]);

  return (
    <React.Fragment>
      <GlobalContainer>
        <ErrorLink />
        {Panes}
        <LanguageSelect />
        <ExternalLinks />
      </GlobalContainer>
    </React.Fragment>
  );
};
