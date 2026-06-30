const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const shellIdx = html.indexOf('id="app-viewport-shell"');
const noticesIdx = html.indexOf('id="screen-notices-list"');
const pollsIdx = html.indexOf('id="screen-polls-list"');

console.log('Shell Idx:', shellIdx);
console.log('Notices Idx:', noticesIdx);
console.log('Polls Idx:', pollsIdx);

// Also let's find the closing tag index of the shell by counting divs
const shellStr = html.substring(shellIdx);
let depth = 0;
let closesAtIdx = -1;
let tagRegex = /<\/?div[^>]*>/g;
let match;
while ((match = tagRegex.exec(shellStr)) !== null) {
    if (match[0].startsWith('</')) depth--;
    else depth++;
    
    if (depth < 0) {
        closesAtIdx = shellIdx + match.index;
        break;
    }
}
console.log('Shell closes at Idx:', closesAtIdx);

console.log('Is Notices inside shell?', noticesIdx > shellIdx && noticesIdx < closesAtIdx);
console.log('Is Polls inside shell?', pollsIdx > shellIdx && pollsIdx < closesAtIdx);
