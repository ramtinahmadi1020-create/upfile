const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const required = [
  'README.md','package.json','tsconfig.json','wrangler.toml','schema.sql','.env.example','.gitignore',
  'frontend/index.html','frontend/style.css','frontend/app.js',
  'frontend/i18n/fa.json','frontend/i18n/en.json','frontend/assets/logo.svg',
  'worker/src/index.ts','worker/src/types/index.ts',
  'functions/api/[[path]].ts','functions/f/[[path]].ts','functions/d/[[path]].ts',
  'docs/API.md','docs/DEPLOY.md','docs/USER_GUIDE.md','docs/DEVELOPER_GUIDE.md','docs/ARCHITECTURE.md','docs/TROUBLESHOOTING.md',
];
let ok = true;
for (const f of required) {
  if (!fs.existsSync(path.join(root, f))) { console.log('MISSING:', f); ok = false; }
}
// JSON validity
for (const f of ['frontend/i18n/fa.json','frontend/i18n/en.json','package.json']) {
  try { JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { console.log('BAD JSON:', f, e.message); ok = false; }
}
console.log(ok ? 'All static checks passed.' : 'Some checks failed.');
process.exit(ok ? 0 : 1);
