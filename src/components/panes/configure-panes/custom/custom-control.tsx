import React from 'react';
import styled from 'styled-components';
import {PelpiKeycodeInput} from '../../../inputs/pelpi/keycode-input';
import {AccentButton} from '../../../inputs/accent-button';
import {AccentSlider} from '../../../inputs/accent-slider';
import {AccentSelect} from '../../../inputs/accent-select';
import {AccentRange, RangeValueDisplay} from '../../../inputs/accent-range';
import {ControlRow, Label, Detail} from '../../grid';
import type {VIADefinitionV2, VIADefinitionV3, VIAItem} from '@the-via/reader';
import type {LightingData} from '../../../../types/types';
import {ArrayColorPicker} from '../../../inputs/color-picker';
import {ConnectedColorPalettePicker} from 'src/components/inputs/color-palette-picker';
import {shiftFrom16Bit, shiftTo16Bit} from 'src/utils/keyboard-api';
import {useTranslation} from 'react-i18next';
import {
  decodeRangeValue,
  getRangeBounds,
  type RangeControlMap,
} from 'src/utils/range-constraints';

type Props = {
  lightingData: LightingData;
  definition: VIADefinitionV2 | VIADefinitionV3;
};

type ControlMeta = [
  string | React.FC<AdvancedControlProps>,
  {type: string} & Partial<{
    min: number;
    max: number;
    getOptions: (d: VIADefinitionV2 | VIADefinitionV3) => string[];
  }>,
];

type AdvancedControlProps = Props & {meta: ControlMeta};

/*
 * 안내문 줄은 작게. 설정 항목이 아니라 곁들이는 설명이라, 같은 크기로 두면 목록이
 * 시끄러워지고 무엇이 조작할 것인지가 흐려진다.
 */
const NoteLabel = styled(Label)`
  font-size: 0.8em;
  opacity: 0.75;
  line-height: 1.35;
`;

export const VIACustomItem = React.memo(
  (props: VIACustomControlProps & {_id: string}) => {
    const {t} = useTranslation();
    const isNote = 'type' in props && (props as any).type === 'label';
    const RowLabel = isNote ? NoteLabel : Label;
    return (
      <ControlRow id={props._id}>
        <RowLabel>{t(props.label)}</RowLabel>
        <Detail>
          {'type' in props ? (
            <VIACustomControl
              {...props}
              value={props.value && Array.from(props.value)}
            />
          ) : (
            props.content
          )}
        </Detail>
      </ControlRow>
    );
  },
);

type ControlGetSet = {
  value: number[];
  updateValue: (name: string, ...command: number[]) => void;
  updateRangeValue: (name: string, value: number) => void;
  rangeControls: RangeControlMap;
  menuData: Record<string, number[] | number[][]>;
};

type VIACustomControlProps = VIAItem & ControlGetSet;

const boxOrArr = <N extends any>(elem: N | N[]) =>
  Array.isArray(elem) ? elem : [elem];

/*
 * 슬라이더 값 옆에 붙일 단위.
 *
 * ★ 정의 JSON 에 필드를 더하지 않고 여기서 잡는다. 정의는 @the-via/reader 의 스키마
 *   검사를 통과해야 하는데, 모르는 키 하나 때문에 정의 전체가 거부되면 키보드가 아예
 *   안 뜬다. 값 ID 로 거는 편이 안전하고, 어차피 우리 보드의 것이다.
 */
const RANGE_UNITS: Record<string, string> = {
  id_qmk_tapping_term: 'ms',
};

// we can compare value against option[1], that way corrupted values are false
const valueIsChecked = (option: number | number[], value: number[]) =>
  boxOrArr(option).every((o, i) => o == value[i]);

const getRangeValue = (value: number[], max: number) => {
  if (max > 255) {
    return shiftTo16Bit([value[0], value[1]]);
  } else {
    return value[0];
  }
};

const decodeNullTerminatedUTF8 = (value?: number[]) => {
  if (!value || value.length === 0) {
    return '';
  }

  const terminatorIdx = value.indexOf(0);
  const bytes = value.slice(
    0,
    terminatorIdx === -1 ? undefined : terminatorIdx,
  );
  return new TextDecoder().decode(new Uint8Array(bytes));
};

const VIACustomControl = (props: VIACustomControlProps) => {
  const {t} = useTranslation();
  const {content, type, options, value} = props as any;
  const [name, ...command] = content;
  switch (type) {
    case 'label': {
      return (
        <RangeValueDisplay>
          {content.length === 1
            ? t(content[0])
            : decodeNullTerminatedUTF8(value)}
        </RangeValueDisplay>
      );
    }
    case 'button': {
      const buttonOption: any[] = options || [1];
      return (
        <AccentButton
          onClick={() => props.updateValue(name, ...command, buttonOption[0])}
        >
          {t('Click')}
        </AccentButton>
      );
    }
    case 'range': {
      const logicalValues = Object.entries(props.rangeControls).reduce<
        Record<string, number>
      >((values, [id, range]) => {
        const rawValue = props.menuData[id];
        if (Array.isArray(rawValue) && typeof rawValue[0] === 'number') {
          values[id] = decodeRangeValue(rawValue as number[], range.options[1]);
        }
        return values;
      }, {});
      const bounds = getRangeBounds(
        name,
        props.rangeControls,
        logicalValues,
        true,
      );
      return (
        <AccentRange
          min={bounds.min}
          max={bounds.max}
          unit={RANGE_UNITS[name]}
          value={getRangeValue(props.value, options[1])}
          onChange={(val: number) => props.updateRangeValue(name, val)}
        />
      );
    }
    case 'keycode': {
      return (
        <PelpiKeycodeInput
          value={shiftTo16Bit([props.value[0], props.value[1]])}
          meta={{}}
          setValue={(val: number) =>
            props.updateValue(name, ...command, ...shiftFrom16Bit(val))
          }
        />
      );
    }
    case 'toggle': {
      const toggleOptions: any[] = options || [0, 1];
      return (
        <AccentSlider
          isChecked={valueIsChecked(toggleOptions[1], props.value)}
          onChange={(val) =>
            props.updateValue(
              name,
              ...command,
              ...boxOrArr(toggleOptions[+val]),
            )
          }
        />
      );
    }
    case 'dropdown': {
      const selectOptions = options.map(
        (option: [string, number] | string, idx: number) => {
          const [label, value] =
            typeof option === 'string' ? [option, idx] : option;
          return {
            value: value || idx,
            label: t(label),
          };
        },
      );
      return (
        <AccentSelect
          /*width={250}*/
          onChange={(option: any) =>
            option && props.updateValue(name, ...command, +option.value)
          }
          options={selectOptions}
          value={selectOptions.find((p: any) => value[0] === p.value)}
        />
      );
    }
    case 'color': {
      return (
        <ArrayColorPicker
          color={props.value as [number, number]}
          setColor={(hue, sat) => props.updateValue(name, ...command, hue, sat)}
        />
      );
    }
    case 'color-palette': {
      return <ConnectedColorPalettePicker />;
    }
  }
  return null;
};
