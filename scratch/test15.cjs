const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const outerIdx = txt.indexOf('Outer Presentation Layer');
console.log(txt.substring(outerIdx, outerIdx + 1000));
