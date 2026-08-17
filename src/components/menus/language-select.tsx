import {FC, useMemo, useState} from 'react';
import {faLanguage} from '@fortawesome/free-solid-svg-icons';
import {CategoryIconContainer} from '../panes/grid';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import styled from 'styled-components';
import {useTranslation} from 'react-i18next';

/*
 * ★ 제자리를 잡지 않고 **줄에 실린다.**
 *
 *   예전에는 `position: absolute; right: 200px` 로 화면에 못박혀 있었다. 오른쪽
 *   아이콘 묶음(ExternalLinks)이 몇 개인지와 무관하게 늘 같은 자리라, 디스코드를
 *   빼자 그 사이가 빈 채로 남았다.
 *
 *   이제 그 묶음 안에 들어가 같이 흐른다. 아이콘을 더하거나 빼도 간격이 알아서 맞는다.
 *   position: relative 는 아래 목록(LanguageList)이 이 버튼 기준으로 펼쳐지기 위한 것이다.
 */
const Container = styled.div`
  position: relative;
  font-size: 18px;
`;

const LanguageList = styled.ul<{$show: boolean}>`
  padding: 0;
  border: 1px solid var(--bg_control);
  width: 160px;
  border-radius: 6px;
  background-color: var(--bg_menu);
  margin: 0;
  margin-top: 5px;
  top: 30px;
  right: 0px;
  position: absolute;
  pointer-events: ${(props) => (props.$show ? 'all' : 'none')};
  transition: all 0.2s ease-out;
  z-index: 11;
  opacity: ${(props) => (props.$show ? 1 : 0)};
  overflow: hidden;
  transform: ${(props) => (props.$show ? 0 : `translateY(-5px)`)};
`;

const LanugaeButton = styled.button<{$selected?: boolean}>`
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

const LanguageSelectors: React.FC<{
  show: boolean;
  onClickOut: () => void;
}> = (props) => {
  const langs = [
    {code: 'en', lang: 'English'},
    {code: 'zh', lang: '中文'},
    {code: 'ko', lang: '한국어'},
    {code: 'ja', lang: '日本語'},
    {code: 'es', lang: 'Español'},
    {code: 'de', lang: 'Deutsch'},
  ];
  const {i18n} = useTranslation();
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    props.onClickOut();
  };

  const selectLang = useMemo(() => {
    return i18n.resolvedLanguage
      ? i18n.resolvedLanguage
      : i18n.languages[i18n.languages.length - 1];
  }, [i18n.resolvedLanguage, i18n.languages]);

  return (
    <>
      {props.show && <ClickCover onClick={props.onClickOut} />}
      <LanguageList $show={props.show}>
        {langs.map(({lang, code}) => {
          return (
            <LanugaeButton
              $selected={code === selectLang}
              key={code}
              onClick={() => changeLanguage(code)}
            >
              {lang}
            </LanugaeButton>
          );
        })}
      </LanguageList>
    </>
  );
};

export const LanguageSelect: FC = () => {
  const [showList, setShowList] = useState(false);
  return (
    <Container>
      <CategoryIconContainer>
        <FontAwesomeIcon
          size={'xl'}
          icon={faLanguage}
          onClick={() => setShowList(true)}
        />
      </CategoryIconContainer>
      <LanguageSelectors
        show={showList}
        onClickOut={() => setShowList(false)}
      />
    </Container>
  );
};
