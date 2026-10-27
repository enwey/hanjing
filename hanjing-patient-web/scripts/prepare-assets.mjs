import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/', root), { recursive: true });
for (const dir of ['static'])
  await cp(
    new URL('../UI/' + dir + '/', root),
    new URL('public/' + dir + '/', root),
    { recursive: true },
  );
// Read-only reuse of the mini-program's pure PCM analysis. Never load wx/Page
// or maintain a divergent copy of its algorithm in the PC application.
const source = await readFile(
  new URL('../mp-weixin-rewrite/pages/assessment/recording/index.js', root),
  'utf8',
);
const start = source.indexOf('function clampNumber('),
  end = source.indexOf('\nPage({', start);
if (
  start < 0 ||
  end < 0 ||
  !source.slice(start, end).includes('function analyzePcmOnClient(')
)
  throw new Error('小程序录音算法结构已变化，请检查 PC 适配');
await mkdir(new URL('src/generated/', root), { recursive: true });
await writeFile(
  new URL('src/generated/mini-analysis.js', root),
  '// Generated from mini-program; do not edit.\n' +
    source.slice(start, end) +
    '\nexport { analyzePcmOnClient };\n',
);
