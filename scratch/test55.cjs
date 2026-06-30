const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');

const start = txt.indexOf('id="screen-create-schedule"');
const end = txt.indexOf('id="screen-schedule-details"');
const html = txt.substring(start, end);

let depth = 0;
let lines = html.split('\n');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/<div/gi) || []).length;
    const closes = (line.match(/<\/div>/gi) || []).length;
    depth += (opens - closes);
}

console.log('Final depth difference:', depth);

let currentDepth = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/<div/gi) || []).length;
    const closes = (line.match(/<\/div>/gi) || []).length;
    currentDepth += (opens - closes);
    if (i > lines.length - 10) {
        console.log(`Line ${i} Depth: ${currentDepth}`);
        console.log(line);
    }
}
