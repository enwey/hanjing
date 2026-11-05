const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = __dirname;
const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
const routeEntries = []
  .concat(appConfig.pages)
  .concat((appConfig.subpackages || []).flatMap((subpackage) => subpackage.pages.map((page) => subpackage.root + '/' + page)));

function collectFiles(dirPath, predicate) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (!predicate || predicate(fullPath)) {
        results.push(fullPath);
      }
    });
  }
  return results.sort();
}

function fail(message, details) {
  console.error(message);
  if (details && details.length) {
    details.forEach((detail) => console.error(' - ' + detail));
  }
  process.exit(1);
}

const missingRouteFiles = [];
routeEntries.forEach((routePath) => {
  ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
    const filePath = path.join(projectRoot, routePath + '.' + extension);
    if (!fs.existsSync(filePath)) {
      missingRouteFiles.push(path.relative(projectRoot, filePath));
    }
  });
});
if (missingRouteFiles.length) {
  fail('Route file validation failed.', missingRouteFiles);
}

const jsonFiles = collectFiles(projectRoot, (fullPath) => fullPath.endsWith('.json'));
const invalidJsonFiles = [];
jsonFiles.forEach((jsonFile) => {
  try {
    JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  } catch (error) {
    invalidJsonFiles.push(path.relative(projectRoot, jsonFile) + ': ' + error.message);
  }
});
if (invalidJsonFiles.length) {
  fail('JSON parse validation failed.', invalidJsonFiles);
}

const jsFiles = collectFiles(projectRoot, (fullPath) => fullPath.endsWith('.js'));
const invalidJsFiles = [];
jsFiles.forEach((jsFile) => {
  const result = spawnSync(process.execPath, ['--check', jsFile], { encoding: 'utf8' });
  if (result.status !== 0) {
    invalidJsFiles.push(path.relative(projectRoot, jsFile) + ': ' + (result.stderr || result.stdout).trim());
  }
});
if (invalidJsFiles.length) {
  fail('JavaScript syntax validation failed.', invalidJsFiles);
}

const requiredAssets = [
  'static/images/distribution-invite-share-v20261105.jpg',
  'static/icons/poster-save.svg',
  'static/icons/paper-plane.svg',
];
const missingAssets = requiredAssets.filter((assetPath) => !fs.existsSync(path.join(projectRoot, assetPath)));
if (missingAssets.length) {
  fail('Required asset validation failed.', missingAssets);
}

const mediaExtensions = /\.(jpg|jpeg|png|svg|webp|gif|flac|m4a|ogg|ape|amr|wma|wav|mp3|mp4|aac|aiff|caf)$/i;
const mediaFiles = collectFiles(projectRoot, fullPath => mediaExtensions.test(fullPath));
const mediaBytes = mediaFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
if (mediaBytes >= 200 * 1024) {
  fail('Combined image and audio resources must be below 200 KiB.', [`${mediaBytes} bytes`]);
}
console.log(' - Combined media resources: ' + mediaBytes + ' bytes');

console.log('Rewrite project validation passed.');
console.log(' - Route entries: ' + routeEntries.length);
console.log(' - JSON files: ' + jsonFiles.length);
console.log(' - JavaScript files: ' + jsFiles.length);
console.log(' - Required assets: ' + requiredAssets.length);
