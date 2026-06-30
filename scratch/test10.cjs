const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const count = txt.split('id="screen-polls-list"').length - 1;
console.log('Polls List Count:', count);
