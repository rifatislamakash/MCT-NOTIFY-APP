const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const start = txt.indexOf('id="screen-create-schedule"');
const end = txt.indexOf('id="screen-schedule-details"');
console.log(txt.substring(end - 300, end + 100));
