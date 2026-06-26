const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const search = `                const root = document.getElementById('root') || document.body;
                if (root.innerHTML.trim() === '' || root.innerHTML.includes('white-screen')) {`;

const replace = `                const root = document.getElementById('root') || document.body;
                if (!root) return; // Prevent infinite loop if body is null during head parsing
                if (root.innerHTML.trim() === '' || root.innerHTML.includes('white-screen')) {`;

if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync('index.html', content);
    console.log('Fixed root null reference loop');
} else {
    console.log('Not found');
}
