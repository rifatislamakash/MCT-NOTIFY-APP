const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const lines = txt.split(/\r?\n/);

console.log(`Total lines: ${lines.length}`);
for(let i = Math.max(0, 500); i < Math.min(lines.length, 520); i++) {
    console.log((i+1) + ': ' + lines[i]);
}
