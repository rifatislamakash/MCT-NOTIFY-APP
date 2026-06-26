const fs = require('fs');
const files = fs.readdirSync('d:/MCT Notify - Antigravity/Notify/js').map(f => 'd:/MCT Notify - Antigravity/Notify/js/' + f).concat(['d:/MCT Notify - Antigravity/Notify/main.js']);
files.forEach(f => {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return;
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, i) => {
        if (l.includes("from('exam_schedules')") || l.includes('from("exam_schedules")') || l.includes('exam_schedules')) {
            console.log(f + ':' + (i+1) + ': ' + l.trim());
        }
    });
});
