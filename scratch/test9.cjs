const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const count = txt.split('id="screen-notices-list"').length - 1;
const pollsCount = txt.split('id="screen-polls"').length - 1;
console.log('Notices Count:', count);
console.log('Polls Count:', pollsCount);
