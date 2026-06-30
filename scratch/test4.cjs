const fs = require('fs');
const lines = fs.readFileSync('js/dashboard.js', 'utf8').split('\n');
let s = 0;
lines.forEach((l, i) => {
    if (l.includes('window.startTAGAutoScroll =')) s = i;
});
if (s > 0) {
    for (let i = s; i <= s + 50; i++) console.log(lines[i]);
}
