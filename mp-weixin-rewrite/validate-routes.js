const fs = require('fs');
const path = require('path');
const root = __dirname;
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const routes = [].concat(appConfig.pages).concat(appConfig.subpackages.flatMap((subpackage) => subpackage.pages.map((page) => subpackage.root + "/" + page)));
const missing = [];
routes.forEach((routePath) => {
  ['js', 'json', 'wxml', 'wxss'].forEach((ext) => {
    const filePath = path.join(root, routePath + "." + ext);
    if (!fs.existsSync(filePath)) missing.push(filePath);
  });
});
if (missing.length) { console.error("Missing route files:", missing); process.exit(1); }
console.log("Validated " + routes.length + " route entries with required files.");
