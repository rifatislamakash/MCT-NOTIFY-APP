const fs = require('fs');
let code = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', 'utf8');
code = code.replace(/\\"/g, '"');
fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', code);
console.log('Fixed escaping!');
