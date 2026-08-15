import {
  faBrush,
  faBug,
  faTerminal,
  faGear,
  faKeyboard,
  faStethoscope,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';
import {ConfigurePane} from '../components/panes/configure';
import {Debug} from '../components/panes/debug';
import {DesignTab} from '../components/panes/design';
import {Settings} from '../components/panes/settings';
import {Test} from '../components/panes/test';
import {ErrorsPaneConfig} from '../components/panes/errors';
import {HIDConsole} from '../components/panes/hid-console';
import {HePane} from '../components/panes/he';

export default [
  {
    key: 'default',
    component: ConfigurePane,
    icon: faKeyboard,
    title: 'Configure',
    path: '/',
  },
  {
    /*
     * 홀이펙트 전용 탭.
     *
     * 커스텀 메뉴로 되는 것(전역 토글·드롭다운)은 정의 JSON 에 두지만, HE 설정은
     * 전부 여기 모은다. 키별 값과 라이브 트래킹이 여기서만 되는데 기본값만 설정
     * 메뉴에 따로 두면 사용자가 두 군데를 봐야 한다.
     */
    key: 'he',
    component: HePane,
    icon: faWaveSquare,
    path: '/he',
    title: 'Hall Effect',
  },
  {
    key: 'test',
    component: Test,
    icon: faStethoscope,
    path: '/test',
    title: 'Key Tester',
  },
  {
    key: 'design',
    component: DesignTab,
    icon: faBrush,
    path: '/design',
    title: 'Design',
  },
  {
    key: 'console',
    component: HIDConsole,
    icon: faTerminal,
    path: '/console',
    title: 'HID Console',
  },
  {
    key: 'settings',
    component: Settings,
    icon: faGear,
    path: '/settings',
    title: 'Settings',
  },
  {
    key: 'debug',
    icon: faBug,
    component: Debug,
    path: '/debug',
    title: 'Debug',
  },
  ErrorsPaneConfig,
];
