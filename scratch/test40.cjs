const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);

const css = html.substring(start + 7, end);

console.log("Around index 3609:");
console.log(css.substring(3609 - 100, 3609 + 100));
