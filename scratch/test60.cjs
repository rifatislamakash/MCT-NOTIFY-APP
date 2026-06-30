const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
console.log('create:', txt.indexOf('id="screen-create-schedule"'));
console.log('details:', txt.indexOf('id="screen-schedule-details"'));
console.log('edit:', txt.indexOf('id="screen-edit-schedule"'));
