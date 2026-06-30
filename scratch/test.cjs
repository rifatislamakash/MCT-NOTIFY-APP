const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
let s = 0;
lines.forEach((l, i) => {
    if (l.includes('id="screen-notices-list"')) s = i;
});
if (s > 0) {
    for (let i = s; i <= s + 15; i++) console.log(lines[i]);
}
