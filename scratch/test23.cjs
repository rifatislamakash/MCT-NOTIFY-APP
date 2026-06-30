const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const vcIdx = html.indexOf('id="viewport-container"');
const noticesIdx = html.indexOf('id="screen-notices-list"');
const pollsIdx = html.indexOf('id="screen-polls-list"');

console.log('VC Idx:', vcIdx);
console.log('Notices Idx:', noticesIdx);
console.log('Polls Idx:', pollsIdx);

const shellStr = html.substring(vcIdx);
let depth = 0;
let closesAtIdx = -1;
let tagRegex = /<\/?div[^>]*>/g;
let match;
while ((match = tagRegex.exec(shellStr)) !== null) {
    if (match[0].startsWith('</')) depth--;
    else depth++;
    
    if (depth < 0) {
        closesAtIdx = vcIdx + match.index;
        break;
    }
}
console.log('VC closes at Idx:', closesAtIdx);

console.log('Is Notices inside VC?', noticesIdx > vcIdx && noticesIdx < closesAtIdx);
console.log('Is Polls inside VC?', pollsIdx > vcIdx && pollsIdx < closesAtIdx);
