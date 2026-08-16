/*
 * 우리 보드 정의를 번들에 넣는다.
 *
 * VIA 는 public/definitions/ 에 미리 컴파일해 둔 정의만 자동으로 인식한다.
 * 업스트림 정의는 via-keyboards 패키지에서 오므로 우리 보드는 없다. Design 탭으로
 * 매번 올리는 대신, 여기서 같은 방식으로 컴파일해 끼워 넣는다.
 *
 *   local-kbs/*.json  ──▶  public/definitions/v3/<vendorProductId>.json
 *                     └─▶  supported_kbs.json  / keyboard_names.json 에 등록
 *
 * via-keyboards 빌드 뒤에 돌려야 한다 (그게 세 파일을 새로 쓴다).
 *
 *   bun node_modules/via-keyboards/scripts/build-all.ts public/definitions
 *   bun scripts/add-local-kbs.ts
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import {keyboardDefinitionV3ToVIADefinitionV3} from '@the-via/reader';

const SRC = 'local-kbs';
const OUT = 'public/definitions';

function main() {
  if (!fs.existsSync(SRC)) {
    console.log(`${SRC}/ 가 없다 — 넣을 보드가 없으므로 건너뛴다`);
    return;
  }

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(`${SRC}/ 에 정의가 없다`);
    return;
  }

  const supported = JSON.parse(
    fs.readFileSync(path.join(OUT, 'supported_kbs.json'), 'utf8'),
  );
  const names = JSON.parse(
    fs.readFileSync(path.join(OUT, 'keyboard_names.json'), 'utf8'),
  );

  for (const f of files) {
    const src = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    const via = keyboardDefinitionV3ToVIADefinitionV3(src);
    const vpid = via.vendorProductId;

    fs.mkdirSync(path.join(OUT, 'v3'), {recursive: true});
    fs.writeFileSync(
      path.join(OUT, 'v3', `${vpid}.json`),
      JSON.stringify(via),
    );

    if (!supported.vendorProductIds.v3.includes(vpid)) {
      supported.vendorProductIds.v3.push(vpid);
    }
    // keyboard_names.json 은 평평한 이름 배열이다
    if (!names.includes(via.name)) {
      names.push(via.name);
      names.sort();
    }

    console.log(`넣음 : ${via.name}  vpid ${vpid}  (${f})`);
  }

  /*
   * HE 보드 목록을 소스로 뽑는다.
   *
   * HE 탭은 우리 보드에서만 보여야 한다. 장치에 명령을 던져 확인할 수도 있지만,
   * 아닌 보드에서는 그 명령이 실패로 기록돼 로그가 지저분해진다. local-kbs/ 에
   * 있는 것은 전부 HE 보드이므로 여기서 목록을 만드는 편이 정확하고 공짜다.
   */
  const vpids = files.map((f) => {
    const src = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    return keyboardDefinitionV3ToVIADefinitionV3(src).vendorProductId;
  });
  /*
   * ★ 해시를 갱신해야 앱이 새 정의를 본다.
   *
   *   syncStore() 는 index.html 에 심긴 해시가 캐시의 것과 같으면 **곧바로
   *   반환하고 캐시를 그대로 쓴다.** 정의 파일만 바꾸면 앱은 바뀐 줄을 모른다.
   *   조명 메뉴를 넣어 놓고 앱에 안 보여 한참 헤맸다.
   *
   *   해시는 상류 값과 우리 정의 내용을 함께 넣어 만든다 — 어느 쪽이 바뀌어도
   *   달라진다. vite 가 설정을 읽을 때 hash.json 을 보므로 **개발 서버는 다시
   *   띄워야** 반영된다.
   */
  const hashPath = path.join(OUT, 'hash.json');
  const base = fs.existsSync(hashPath) ? fs.readFileSync(hashPath, 'utf8') : '';
  const mine = files
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('');
  const next = crypto
    .createHash('sha256')
    .update(JSON.parse(base || '""').slice(0, 32) + mine)
    .digest('hex');
  fs.writeFileSync(hashPath, JSON.stringify(next));
  console.log(`해시 갱신 : ${next.slice(0, 16)}…  (개발 서버를 다시 띄워야 한다)`);

  fs.writeFileSync(
    'src/utils/he-boards.ts',
    '/* 자동 생성 — scripts/add-local-kbs.ts. 직접 고치지 말 것. */\n' +
      `export const HE_BOARDS = new Set<number>([${vpids.join(', ')}]);\n`,
  );
  console.log(`he-boards.ts : ${vpids.length}개`);

  fs.writeFileSync(
    path.join(OUT, 'supported_kbs.json'),
    JSON.stringify(supported),
  );
  fs.writeFileSync(
    path.join(OUT, 'keyboard_names.json'),
    JSON.stringify(names),
  );
}

main();
