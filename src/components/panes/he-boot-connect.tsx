import {useCallback, useState} from 'react';
import {useLocation} from 'wouter';
import {useAppDispatch} from 'src/store/hooks';
import {setBootloaderSeen, setVendorSeen} from 'src/store/heSlice';
import {iapFind, iapFindVendorApp, iapRequest} from 'src/utils/he-iap';

/*
 * **부트로더에 붙는 길.**
 *
 * ★ 왜 버튼이어야 하나.
 *
 *   크롬은 `requestDevice()` 를 **사용자 클릭 안에서만** 열어 준다
 *   (transient activation). 그래서 "부트로더가 보이면 알아서 창을 띄운다" 는
 *   불가능하고, 클릭 한 번이 반드시 낀다.
 *
 * ★ 언제 필요한가 — 권한이 아직 없을 때뿐이다.
 *
 *   WebHID 권한은 인터페이스 구성까지 포함해서 준다. 앱을 허용해 두어도 부트로더는
 *   다른 구성이라 목록에 안 나오고, 앱 모드일 때는 부트로더 인터페이스가 아예
 *   없으니 미리 받아둘 수도 없다. 한 번 받으면 그 뒤로는 기억되므로 그다음부터는
 *   `iapFind()` 가 조용히 찾아내 이 버튼 없이 이어진다.
 *
 * 두 자리에서 같이 쓴다 — HE 탭의 "장치 없음" 벽과, 첫 화면(로더)이다. 첫 화면 쪽이
 * 특히 중요하다: **부트로더 상태로 앱을 처음 켜면 HE 탭 자체가 안 뜨므로** 거기 길이
 * 없으면 앱으로는 손쓸 방법이 없다.
 *
 * 버튼 모양은 자리마다 다르므로(로더는 큰 강조 버튼, 펌웨어 화면은 작은 버튼)
 * 컴포넌트가 아니라 훅으로 준다 — 하는 일만 같고 생김새는 각자 정한다.
 */
export function useBootConnect(opts?: {goHe?: boolean}) {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const [err, setErr] = useState<string | null>(null);
  const goHe = opts?.goHe ?? false;

  const connect = useCallback(async () => {
    setErr(null);
    try {
      const dev = await iapRequest();
      if (!dev) return false; /* 창을 그냥 닫았다 */

      /*
       * ★ **고른 것이 부트로더인지 순정 앱인지 가른다.**
       *
       *   wish61 은 둘이 같은 VID/PID/usage page 라 고른 것만으로는 모른다.
       *   예전에는 무조건 "부트로더" 로 세웠는데, 순정 펌웨어가 도는 보드를
       *   고르면 안내 문구가 "부트로더에 멈춰 있다" 로 거짓말을 했다.
       *
       *   어느 쪽이든 갈 곳은 같다(펌웨어 화면). 표시만 맞추면 된다.
       *
       * ★ 여기서 곧바로 세운다. 첫 화면의 주기 확인도 1초 안에 같은 답을 내지만,
       *   방금 고른 사람에게 1초는 "안 눌렸나" 로 보인다.
       */
      const boot = await iapFind();
      if (boot) {
        dispatch(setBootloaderSeen(true));
      } else {
        dispatch(setVendorSeen((await iapFindVendorApp()) !== null));
      }
      if (goHe) setLocation('/he');
      return true;
    } catch (x) {
      setErr(String(x));
      return false;
    }
  }, [dispatch, setLocation, goHe]);

  return {connect, err};
}
