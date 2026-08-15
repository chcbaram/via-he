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
