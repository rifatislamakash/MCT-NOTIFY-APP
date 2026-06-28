const fs = require('fs');
const path = require('path');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        if (file === 'node_modules' || file === '.git' || file === '.gemini') return;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(filePath));
        } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.cjs')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walkDir('./');
files.forEach(f => {
    try {
        const c = fs.readFileSync(f, 'utf8').split('\n');
        c.forEach((l, i) => {
            if (l.toLowerCase().includes('resend verification email') || l.toLowerCase().includes('logout & try different account') || l.toLowerCase().includes('check your diu email')) {
                console.log(f + ':' + (i+1) + ': ' + l.trim());
            }
        });
    } catch(e) {}
});
