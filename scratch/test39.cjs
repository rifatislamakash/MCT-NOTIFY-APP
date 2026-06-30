const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);

const css = html.substring(start + 7, end);

let depth = 0;
let errors = [];

for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    if (depth < 0) {
        errors.push(`Negative depth at index ${i}`);
        depth = 0; // recover
    }
}

console.log(`Final CSS Depth: ${depth}`);
if (errors.length > 0) {
    console.log(`CSS Errors:`, errors);
}
