const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);
const css = html.substring(start + 7, end);

let inString = false;
let stringChar = '';

for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if ((c === '"' || c === "'") && css[i-1] !== '\\') {
        if (!inString) {
            inString = true;
            stringChar = c;
        } else if (c === stringChar) {
            inString = false;
        }
    }
}

console.log(`Unclosed string at end: ${inString}`);

// Also check for missing semicolons? Difficult.
// Let's just output the whole CSS block to see if it's completely valid!
