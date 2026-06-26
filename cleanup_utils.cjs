const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/utils.js', 'utf8');

content = content.replace("lastFocusedEditor = e.target;\\n    }\\n});\\n\\nwindow.clearLastFocusedEditor = function() {\\n    lastFocusedEditor = null;\\n};\\n\\ndocument.addEventListener('focusout', (e) => {\\n    if (e.target === lastFocusedEditor) {\\n        // do not clear immediately if focus stays within the same component, maybe handled differently. For now just clear on navigate.\\n", "lastFocusedEditor = e.target;\n    }\n});\n\nwindow.clearLastFocusedEditor = function() {\n    lastFocusedEditor = null;\n};");

fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/utils.js', content);
