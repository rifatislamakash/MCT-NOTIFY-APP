const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function findAncestors(targetId) {
    const lines = html.split('\n');
    let targetLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`id="${targetId}"`)) {
            targetLine = i;
            break;
        }
    }
    
    if (targetLine === -1) return [];
    
    // Simple indentation-based ancestor finding for formatted HTML
    const ancestors = [];
    let currentIndent = getIndent(lines[targetLine]);
    
    for (let i = targetLine - 1; i >= 0; i--) {
        const indent = getIndent(lines[i]);
        if (indent < currentIndent && lines[i].trim().startsWith('<div')) {
            ancestors.push(lines[i].trim());
            currentIndent = indent;
        }
    }
    return ancestors;
}

function getIndent(str) {
    const match = str.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

console.log(findAncestors('screen-notices-list'));
