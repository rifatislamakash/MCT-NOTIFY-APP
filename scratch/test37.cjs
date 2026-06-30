const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');

const lines = txt.split('\n');
const stack = [];

lines.forEach((line, lineIdx) => {
    // Only look for explicitly matched <div> and </div>
    const divOpens = (line.match(/<div(?=[\s>])/gi) || []).length;
    const divCloses = (line.match(/<\/div>/gi) || []).length;

    for (let i = 0; i < divOpens; i++) {
        stack.push({ line: lineIdx + 1, content: line.trim() });
    }
    for (let i = 0; i < divCloses; i++) {
        if (stack.length > 0) {
            stack.pop();
        } else {
            console.log(`Extra </div> at line ${lineIdx + 1}`);
        }
    }
});

console.log(`Unclosed <div>s remaining: ${stack.length}`);
if (stack.length > 0) {
    stack.forEach(unclosed => {
        console.log(`Unclosed <div> opened at line ${unclosed.line}: ${unclosed.content}`);
    });
}
