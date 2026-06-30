const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);
const css = html.substring(start + 7, end);

let inString = false;
let stringChar = '';
let unclosedIndex = -1;

for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if ((c === '"' || c === "'") && css[i-1] !== '\\') {
        if (!inString) {
            inString = true;
            stringChar = c;
            unclosedIndex = i;
        } else if (c === stringChar) {
            inString = false;
            unclosedIndex = -1;
        }
    }
}

if (unclosedIndex !== -1) {
    console.log(`Unclosed string starts at index ${unclosedIndex}:`);
    console.log(css.substring(unclosedIndex - 50, unclosedIndex + 50));
}
