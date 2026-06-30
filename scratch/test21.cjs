const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const matches = txt.match(/onerror="([^"]*)"/g) || [];
matches.forEach(m => console.log(m));
