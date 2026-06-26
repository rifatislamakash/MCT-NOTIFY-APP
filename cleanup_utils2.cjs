const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/utils.js', 'utf8');

// The file contains literal \n sequences. Let's find exactly the line causing the error and replace it.
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('lastFocusedEditor = e.target;\\n')) {
        // This line contains the corrupted text
        lines[i] = "        lastFocusedEditor = e.target;\n    }\n});\n\nwindow.clearLastFocusedEditor = function() {\n    lastFocusedEditor = null;\n};\n";
    }
}
fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/utils.js', lines.join('\n'));
