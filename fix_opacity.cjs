const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');
c = c.replace(/bg-white\/ /g, 'bg-white/20');
fs.writeFileSync('index.html', c);
console.log('Fixed broken bg-white opacities');
