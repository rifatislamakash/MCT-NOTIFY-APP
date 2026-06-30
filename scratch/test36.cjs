const fs = require('fs');

const txt = fs.readFileSync('index.html', 'utf8');

// Basic unclosed tag checker
const tags = txt.match(/<\/?(?:div|span|section|header|footer|nav|main|aside)[^>]*>/gi) || [];
const stack = [];
let errorFound = false;

tags.forEach((tag, idx) => {
    if (tag.startsWith('</')) {
        const tagName = tag.match(/<\/([a-zA-Z0-9]+)/)[1].toLowerCase();
        if (stack.length === 0) {
            console.log(`Error at tag ${idx}: unexpected closing tag ${tag}`);
            errorFound = true;
        } else {
            const last = stack.pop();
            if (last !== tagName) {
                console.log(`Error at tag ${idx}: expected </${last}> but found ${tag}`);
                errorFound = true;
            }
        }
    } else if (!tag.endsWith('/>')) {
        const match = tag.match(/<([a-zA-Z0-9]+)/);
        if (match) {
            stack.push(match[1].toLowerCase());
        }
    }
});

if (stack.length > 0) {
    console.log(`Unclosed tags remaining: ${stack.length}`, stack.slice(-5));
} else if (!errorFound) {
    console.log('HTML structure seems balanced!');
}
