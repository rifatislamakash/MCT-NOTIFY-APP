const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');

const start = txt.indexOf('id="screen-create-schedule"');
const html = txt.substring(start, start + 4000);
const screens = html.match(/id="screen-[^"]+"/g);
console.log(screens);
