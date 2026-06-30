const fs = require('fs');
const js = fs.readFileSync('js/notices.js', 'utf8');

const renderIdx = js.indexOf('function renderNoticesList()');
const returnIdx = js.indexOf('return `', renderIdx);
const endIdx = js.indexOf('`;', returnIdx);

const html = js.substring(returnIdx + 8, endIdx);

let depth = 0;
const tags = html.match(/<\/?div[^>]*>/g) || [];
tags.forEach(t => {
    if (t.startsWith('</')) depth--;
    else depth++;
});

console.log('Final depth of Notice Card:', depth);
