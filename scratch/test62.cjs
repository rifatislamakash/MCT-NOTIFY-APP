const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const end = txt.indexOf('<div id="screen-schedule-details"');
console.log(txt.substring(end - 300, end));
