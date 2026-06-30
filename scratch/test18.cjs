const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find the line where app-viewport-shell starts
const shellIdx = html.indexOf('id="app-viewport-shell"');
const shellStr = html.substring(shellIdx);

let depth = 0;
let lines = shellStr.split('\n');
let closingLine = -1;

for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    
    // Naive count for simple structure
    const opens = (l.match(/<div/g) || []).length;
    const closes = (l.match(/<\/div>/g) || []).length;
    
    depth += opens;
    depth -= closes;
    
    if (depth < 0) {
        closingLine = i;
        break;
    }
}

if (closingLine !== -1) {
    console.log('App Viewport Shell closes at relative line:', closingLine);
    console.log(lines[closingLine]);
} else {
    console.log('Could not find closing div');
}
