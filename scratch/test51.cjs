const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);
let css = html.substring(start + 7, end);

// Strip all CSS comments
css = css.replace(/\/\*[\s\S]*?\*\//g, '');

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

console.log(`Unclosed string: ${inString}`);
if (inString) {
    console.log(css.substring(unclosedIndex - 50, unclosedIndex + 50));
}

let depth = 0;
for (let i = 0; i < css.length; i++) {
    if (!inString) { // we don't have inString here but we can do a simple check
        if (css[i] === '{') depth++;
        if (css[i] === '}') depth--;
        if (depth < 0) {
            console.log(`Negative depth at index ${i}:`, css.substring(i - 20, i + 20));
            depth = 0;
        }
    }
}
console.log(`Final Depth: ${depth}`);
