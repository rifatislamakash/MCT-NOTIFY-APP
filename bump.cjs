const fs = require('fs');
let code = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/main.js', 'utf8');
code = code.replace(/from\s+['"](\.\/js\/[^'"]+)['"]/g, (match, path) => {
    const basePath = path.split('?')[0];
    return `from '${basePath}?v=rescue1'`;
});
fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/main.js', code);
console.log('Bumped versions in main.js');
