const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/index.html', 'utf8');

const target = `            if (typeof window.clearLastFocusedEditor === \\'function\\') window.clearLastFocusedEditor();\\n\\n            // Clear floating emoji picker menus to prevent ghosting`;

const replacement = `            if (typeof window.clearLastFocusedEditor === 'function') window.clearLastFocusedEditor();

            // Clear floating emoji picker menus to prevent ghosting`;

content = content.replace(target, replacement);
fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/index.html', content);
console.log('Fixed index.html syntax error');
