import {faGithub} from '@fortawesome/free-brands-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import styled from 'styled-components';
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

export const ExternalLinks = () => (
  <ExternalLinkContainer>
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
