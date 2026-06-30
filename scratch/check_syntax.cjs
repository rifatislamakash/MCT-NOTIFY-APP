const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /on[a-z]+="([^"]+)"/gi;
let match;
while ((match = regex.exec(html)) !== null) {
    const code = match[1];
    try {
        new Function(code);
    } catch (e) {
        if (e instanceof SyntaxError) {
            console.log("SYNTAX ERROR IN INLINE SCRIPT!");
            console.log("Code:", code);
            console.log("Error:", e.message);
        }
    }
}
console.log("Done checking inline scripts.");
