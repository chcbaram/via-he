import React, {useMemo} from 'react';
import styled from 'styled-components';
import {getHeBootloaderSeen} from 'src/store/heSlice';
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

/*
 * 제목.
 *
 * 우측의 언어 선택·외부 링크와 같이 absolute 로 띄운다. 흐름에 넣으면 가운데
 * 정렬된 탭 아이콘들이 그만큼 밀린다.
 */
const Title = styled.div`
  position: absolute;
  left: 1em;
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 20px;
  letter-spacing: 0.02em;
  user-select: none;
  pointer-events: none;
`;

const TitleVia = styled.span`
  color: var(--color_label-highlighted);
  font-weight: 500;
`;

const TitleHe = styled.span`
  color: var(--color_accent);
  font-weight: 400;
  font-style: italic;
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
  const [location] = useLocation();
  const bootloaderSeen = useAppSelector(getHeBootloaderSeen);

  /*
   * ★ 이미 HE 탭에 있으면 장치가 사라져도 탭을 지우지 않는다.
   *
   *   펌웨어를 구우면 장치가 부트로더로 넘어가면서 정의가 없어진다. 그때 탭이
   *   통째로 사라져 **굽는 중에 화면이 뒤로 튕겼다.** 부트로더로 가는 것은
   *   그 화면이 시킨 일이므로, 그 결과로 화면을 없애면 안 된다.
   */
  const showHeTab =
    location === '/he' ||
    /*
     * ★ 부트로더만 물려 있어도 띄운다.
     *
     *   굽다 만 보드는 VIA 목록에 안 잡혀 selectedDefinition 이 없다. 그런데 되살릴
     *   기능은 이 탭에만 있다 — 탭을 안 띄우면 앱으로는 손쓸 방법이 없어진다.
     */
    bootloaderSeen ||
    (!!selectedDefinition && HE_BOARDS.has(selectedDefinition.vendorProductId));

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
        <Title>
          <TitleVia>VIA</TitleVia>
          <TitleHe>HE</TitleHe>
        </Title>
        <ErrorLink />
        {Panes}
        {/* 언어 고르기는 ExternalLinks 줄 안으로 들어갔다 */}
        <ExternalLinks />
      </GlobalContainer>
    </React.Fragment>
  );
};
