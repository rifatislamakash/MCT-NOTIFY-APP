const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');

const start = txt.indexOf('<div id="screen-create-schedule"');
const end = txt.indexOf('<div id="screen-schedule-details"');
const html = txt.substring(start, end);

let tags = html.match(/<\/?(?:div|span|section|header|footer|nav|main|aside|form)[^>]*>/gi) || [];
let depth = 0;
tags.forEach(tag => {
    if (tag.startsWith('</')) depth--;
    else depth++;
});

console.log('Total tags:', tags.length);
console.log('Net depth change:', depth);
if (depth > 0) {
    console.log("We have an unclosed tag inside screen-create-schedule!");
}

let currentDepth = 0;
let stack = [];
tags.forEach(tag => {
    if (tag.startsWith('</')) {
        currentDepth--;
        stack.pop();
    } else if (!tag.endsWith('/>')) {
        currentDepth++;
        stack.push(tag);
    }
});

console.log("Unclosed tags remaining in stack:");
console.log(stack);
