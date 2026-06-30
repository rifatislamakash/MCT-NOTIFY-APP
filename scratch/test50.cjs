const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);
console.log(html.substring(start - 200, start + 50));
