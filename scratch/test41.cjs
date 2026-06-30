const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);

let css = html.substring(start + 7, end);

// Find the exact line and remove the extra brace
// We know it is right after `.bg-slate-900\\/80 { ... }`
css = css.replace(/\.bg-slate-900\\\/80\s*\{\s*background-color:\s*rgba\(20,\s*20,\s*30,\s*0\.95\)\s*!important;\s*\}\s*\}/, 
    '.bg-slate-900\\/80 {\n                background-color: rgba(20, 20, 30, 0.95) !important;\n            }\n');

html = html.substring(0, start + 7) + css + html.substring(end);
fs.writeFileSync('index.html', html);
console.log('Fixed CSS extra brace via regex');
