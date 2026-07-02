const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/class="w-5 h-5 nav-icon-/g, 'class="w-6 h-6 object-contain nav-icon-');
fs.writeFileSync('index.html', html);
console.log('Fixed aspect ratio');
