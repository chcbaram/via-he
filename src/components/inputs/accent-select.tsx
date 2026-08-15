import React from 'react';
import Select, {Props} from 'react-select';
const customStyles = {
  option: (provided: any, state: any) => {
    return {
      ...provided,
      '&:hover': {
        backgroundColor: state.isSelected
          ? 'var(--color_accent)'
          : 'var(--bg_control)',
      },
      ':active': {
        backgroundColor: 'var(--bg_control)',
      },
      background: state.isSelected
        ? 'var(--color_accent)'
        : state.isFocused
        ? 'var(--bg_control)'
        : 'var(--bg_menu)',
      color: state.isSelected
        ? 'var(--color_inside-accent)'
        : state.isFocused
        ? 'var(--color_accent)'
        : 'var(--color_accent)',
    };
  },
  container: (provided: any) => ({
    ...provided,
    lineHeight: 'initial',
    flex: 1,
  }),
  input: (provided: any) => ({
    ...provided,
    color: 'var(--color_accent)',
    opacity: 0.5,
  }),
  singleValue: (provided: any) => ({
    ...provided,
    color: 'var(--color_accent)',
  }),
  dropdownIndicator: (provided: any) => ({
    ...provided,
    color: 'var(--color_accent)',
  }),
  indicatorSeparator: (provided: any) => ({
    ...provided,
    backgroundColor: 'var(--color_accent)',
  }),
  menuList: (provided: any) => ({
    ...provided,
    borderColor: 'var(--color_accent)',
    backgroundColor: 'var(--bg_menu)',
  }),
  placeholder: (provided: any) => ({
    ...provided,
    color: 'var(--color_accent)',
  }),
  valueContainer: (provided: any) => ({
    ...provided,
    ':active': {
      backgroundColor: 'var(--bg_control)',
      borderColor: 'var(--color_accent)',
    },
    '&:hover': {
      borderColor: 'var(--color_accent)',
    },
    color: 'var(--color_accent)',
    background: 'var(--bg_menu)',
  }),
  control: (provided: any, state: any) => {
    const res = {
      ...provided,
      boxShadow: 'none',
      ':active': {
        backgroundColor: 'transparent',
        borderColor: 'var(--color_accent)',
      },
      '&:hover': {
        borderColor: 'var(--color_accent)',
      },
      color: 'var(--color_accent)',
      borderColor: '1px solid var(--color_accent)',
      background: 'var(--bg_menu)',
      overflow: 'hidden',
      width: state.selectProps.width || 250,
    };
    return res;
  },
};

/*
 * control 스타일이 state.selectProps.width 를 읽는데 타입에는 없었다. 넘겨도
 * 컴파일이 막혀 감싸는 상자로 폭을 주려 했지만, 안쪽 width 가 이겨서 소용이 없었다.
 * 쓰고 있는 prop 이니 타입에 적는다.
 */
type AccentSelectProps = Props & {width?: number};

export const AccentSelect: React.FC<AccentSelectProps> = (props) => (
  <Select {...props} styles={customStyles} />
);
