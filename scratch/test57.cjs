const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');

const start = txt.indexOf('id="screen-create-schedule"');
const end = txt.indexOf('id="screen-schedule-details"');
const html = txt.substring(start, end);

let tags = html.match(/<\/?(?:div|span|section|header|footer|nav|main|aside)[^>]*>/gi) || [];
let depth = 0;
tags.forEach(tag => {
    if (tag.startsWith('</')) depth--;
    else depth++;
});

console.log('Depth difference from all tags:', depth);
