import React from 'react';
import styled from 'styled-components';
import {title, component} from '../../icons/layouts';
import {ControlRow, SpanOverflowCell, Label, Detail} from '../grid';
import {AccentSlider} from '../../inputs/accent-slider';
import {AccentSelect} from '../../inputs/accent-select';
import {CenterPane} from '../pane';
import {
  getSelectedDefinition,
  getSelectedLayoutOptions,
  updateLayoutOption,
} from 'src/store/definitionsSlice';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import type {LayoutLabel} from '@the-via/reader';
import type {FC} from 'react';
import {useTranslation} from 'react-i18next';
import {
  getHostKeyboardLayout,
  updateHostKeyboardLayout,
} from 'src/store/settingsSlice';
import {keymapExtras} from 'src/utils/keymap-extras';

const hostLayoutOptions = Object.entries(keymapExtras).map(([key, value]) => ({
  label: value.label,
  value: key,
}));

const LayoutControl: React.FC<{
  onChange: (val: any) => void;
  meta: {labels: LayoutLabel; selectedOption: number};
}> = (props) => {
  const {t} = useTranslation();
  const {onChange, meta} = props;
  const {labels, selectedOption} = meta;
  if (Array.isArray(labels)) {
    const [label, ...optionLabels] = labels;
    const options = optionLabels.map((label, idx) => ({
      label: t(label),
      value: `${idx}`,
    }));
    return (
      <ControlRow>
        <Label>{t(label)}</Label>
        <Detail>
          <AccentSelect
            /*width={150}*/
            value={options[selectedOption]}
            options={options}
            onChange={(option: any) => {
              if (option) {
                onChange(+option.value);
              }
            }}
          />
        </Detail>
      </ControlRow>
    );
  } else {
    return (
      <ControlRow>
        <Label>{t(labels)}</Label>
        <Detail>
          <AccentSlider
            isChecked={!!selectedOption}
            onChange={(val) => onChange(+val)}
          />
        </Detail>
      </ControlRow>
    );
  }
};

const ContainerPane = styled(CenterPane)`
  height: 100%;
  background: var(--color_dark_grey);
`;

const Container = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 0 12px;
`;

export const Pane: FC = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();

  const selectedDefinition = useAppSelector(getSelectedDefinition);
  const selectedLayoutOptions = useAppSelector(getSelectedLayoutOptions);
  const hostLayout = useAppSelector(getHostKeyboardLayout);

  if (!selectedDefinition || !selectedLayoutOptions) {
    return null;
  }

  const {layouts} = selectedDefinition;

  const labels = layouts.labels || [];
  return (
    <SpanOverflowCell>
      <ContainerPane>
        <Container>
          {/*
            * ★ 호스트 자판 배열이 여기로 왔다.
            *
            *   원래는 키보드 이름 배지 옆 위쪽에 알약으로 떠 있었다. 그런데 그건
            *   **한 번 정하고 잊는 값**이다 — 내 컴퓨터가 어느 배열을 쓰는지는
            *   자주 바뀌지 않는다. 늘 보이는 자리는 자주 바꾸는 것에 내주는 것이
            *   맞고, 이 화면(레이아웃)이 곧 "이 키보드를 어떻게 볼 것인가" 를
            *   정하는 자리라 뜻으로도 여기가 맞다.
            */}
          <ControlRow>
            <Label>{t('Host layout')}</Label>
            <Detail>
              <AccentSelect
                width={220}
                value={hostLayoutOptions.find((o) => o.value === hostLayout)}
                options={hostLayoutOptions}
                onChange={(o: any) => {
                  if (o) dispatch(updateHostKeyboardLayout(o.value));
                }}
              />
            </Detail>
          </ControlRow>

          {labels.map((label: LayoutLabel, idx: number) => (
            <LayoutControl
              key={idx}
              onChange={(val) => dispatch(updateLayoutOption(idx, val))}
              meta={{
                labels: label,
                selectedOption: selectedLayoutOptions[idx],
              }}
            />
          ))}
        </Container>
      </ContainerPane>
    </SpanOverflowCell>
  );
};
export const Title = title;
export const Icon = component;
