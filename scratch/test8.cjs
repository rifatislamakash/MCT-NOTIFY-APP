const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const appIdx = txt.indexOf('id="app-container"');
const noticesIdx = txt.indexOf('id="screen-notices-list"');
const splashIdx = txt.indexOf('id="screen-splash"');

console.log('App Container:', appIdx);
console.log('Notices:', noticesIdx);
console.log('Splash:', splashIdx);

// Check if notices is after app container
console.log('Is Notices inside app-container?', noticesIdx > appIdx);

const lastDivClose = txt.lastIndexOf('</div>');
console.log('Last div close:', lastDivClose);
