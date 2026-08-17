import {Provider} from 'react-redux';
import {Router} from 'wouter';

import {store} from '../store';
import Routes from '../Routes';

/*
 * ★ 라우터에 base 를 알려준다. (상류 대비 수정)
 *
 *   GitHub Pages 는 .../via-he/ 하위로 연다. 이걸 안 알려주면 wouter 가 그 앞부분을
 *   경로의 일부로 보고 어느 <Route> 와도 안 맞는다. 게다가 <Link to="/he"> 가
 *   **도메인 루트**로 밀어 버려 주소가 chcbaram.github.io/he 가 되고, 거기서
 *   새로고침하면 404 다. 실제로 그렇게 됐다.
 *
 *   base 를 주면 useLocation() 이 base 를 뺀 '/he' 를 돌려주므로 화면 코드는
 *   그대로 두면 된다.
 *
 * ★ 끝의 슬래시를 뗀다. BASE_URL 은 '/via-he/' 처럼 슬래시로 끝나는데 wouter 의
 *   base 는 그러면 안 된다. dev 에서는 '/' 라 빈 문자열이 되고, 그건 base 없음과 같다.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export default () => (
  <Provider store={store}>
    <Router base={base}>
      <Routes />
    </Router>
  </Provider>
);
