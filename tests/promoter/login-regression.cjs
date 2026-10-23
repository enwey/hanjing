const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const backend = read('hanjing-clinic-backend/routes/promoter.js');
const login = read('hanjing-promoter-portal/src/views/login/index.vue');
const router = read('hanjing-promoter-portal/src/router/index.ts');

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, status: 'PASS' });
  } catch (error) {
    checks.push({ name, status: 'FAIL', error: error.message });
  }
}

check('PROM-LOGIN-01 route has dedicated limiter', () => {
  assert.match(backend, /createRateLimiter\(\{\s*limit:\s*5,\s*windowMs:\s*15\s*\*\s*60\s*\*\s*1000\s*\}\)/);
  assert.match(backend, /app\.post\('\/api\/promoter\/login',\s*promoterLoginRateLimiter,/);
});
check('PROM-LOGIN-02 uses one public authentication error', () => {
  assert.match(backend, /const PROMOTER_LOGIN_ERROR = '手机号或密码错误'/);
  assert.match(backend, /!promoter \|\| promoter\.promoter_status !== 'active' \|\| !promoter\.password_hash \|\| !passwordMatches/);
  assert.match(backend, /res\.status\(401\)\.json\(\{ code: 401, message: PROMOTER_LOGIN_ERROR \}\)/);
  assert.doesNotMatch(backend.slice(backend.indexOf("app.post('/api/promoter/login'"), backend.indexOf("app.get('/api/promoter/me'")), /未绑定推广员账号|账号已停用|尚未设置登录密码/);
});
check('PROM-LOGIN-02 unknown account follows dummy hash path', () => {
  assert.match(backend, /PROMOTER_LOGIN_DUMMY_HASH = hashPassword/);
  assert.match(backend, /verifyPassword\(password, promoter\?\.password_hash \|\| PROMOTER_LOGIN_DUMMY_HASH\)/);
});
check('PROM-LOGIN-03 guards repeated submit', () => {
  assert.match(login, /validateResult !== true \|\| isSubmitting\.value/);
  assert.match(login, /isSubmitting\.value = true/);
  assert.match(login, /finally\s*\{\s*isSubmitting\.value = false/);
  assert.match(login, /:loading="isSubmitting"\s+:disabled="isSubmitting"/);
});
check('PROM-LOGIN-04 constrains card to narrow viewport', () => {
  assert.match(login, /\.login-card\s*\{[\s\S]*?max-width:\s*calc\(100vw - 32px\);[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(login, /@media \(max-width:\s*480px\)/);
});
check('PROM-LOGIN-05 redirects token holder away from login', () => {
  assert.match(router, /const token = getPromoterToken\(\)/);
  assert.match(router, /to\.name === 'login' && token/);
  assert.match(router, /next\('\/dashboard'\)/);
});

const failed = checks.filter((item) => item.status === 'FAIL');
console.log(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;
