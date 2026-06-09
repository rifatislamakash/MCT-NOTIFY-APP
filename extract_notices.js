const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');
const linesToRemove = new Set();

function findStart(str) {
    return lines.findIndex(l => l.includes(str));
}

// 1. EXTRACT LOGIC BLOCK
const logStart = findStart('// ----------------- NOTICES SYSTEM -----------------');
const logEnd = findStart('// ----------------- SUPPORT & CONTACT DIRECTORY SYSTEM -----------------');

if (logStart === -1 || logEnd === -1) {
    console.error("Could not find Notices logic block boundaries.");
    process.exit(1);
}

const logicLines = lines.slice(logStart, logEnd);
let noticesCode = logicLines.join('\n') + '\n\n';
for (let i = logStart; i < logEnd; i++) {
    linesToRemove.add(i);
}

// 2. CREATE SERVICE EXPORT
// Parse the explicit exports at the end of the block
const funcsToExpose = [];
for (const line of logicLines) {
    const match = line.match(/^\s*window\.(\w+)\s*=\s*\w+/);
    if (match) {
        funcsToExpose.push(match[1]);
    }
}

noticesCode += `
window.NoticeService = {
${funcsToExpose.map(f => `    ${f}: window.${f}`).join(',\n')}
};
console.log("[ARCHITECTURE]\\nnotices loaded");
`;

fs.writeFileSync('js/notices.js', noticesCode);

// 3. RECONSTRUCT INDEX.HTML
const newLines = [];
let injected = false;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<script src="js/materials.js"></script>')) {
        newLines.push(lines[i]);
        newLines.push('    <script src="js/notices.js"></script>');
        injected = true;
        continue;
    }
    
    if (!linesToRemove.has(i)) {
        newLines.push(lines[i]);
    }
}

if (!injected) {
    console.error("Failed to inject script tag.");
}

fs.writeFileSync('index.html', newLines.join('\n'));
console.log('Extraction for Phase 5 (Notices) complete.');
