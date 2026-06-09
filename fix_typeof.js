const fs = require('fs');
const path = require('path');

const jsFiles = ['auth.js', 'profile.js', 'faculty.js', 'materials.js', 'notices.js', 'schedules.js', 'routines.js', 'dashboard.js', 'notifications.js'];

jsFiles.forEach(file => {
    const filePath = path.join('js', file);
    if (!fs.existsSync(filePath)) return;
    
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Replace: typeof someFunc === 'function'
    // With: typeof window.someFunc === 'function'
    // Exclude 'window' if it's already there
    // We only want to replace standalone function names. We can safely target known function names or just run a regex.
    code = code.replace(/typeof\s+([a-zA-Z0-9_]+)\s*===\s*'function'/g, (match, funcName) => {
        if (funcName === 'window' || funcName === 'document' || funcName.startsWith('window.')) return match;
        return `typeof window.${funcName} === 'function'`;
    });

    // We also need to replace the subsequent call `someFunc()` with `window.someFunc()` if it was conditionally called.
    // e.g. if (typeof window.someFunc === 'function') someFunc();
    // This regex looks for standard conditional calls
    code = code.replace(/if\s*\(\s*typeof\s+window\.([a-zA-Z0-9_]+)\s*===\s*'function'\s*\)\s*([a-zA-Z0-9_]+)\s*\(/g, (match, funcName, callName) => {
        if (funcName === callName) {
            return `if (typeof window.${funcName} === 'function') window.${funcName}(`;
        }
        return match;
    });
    
    // Also handle async await conditionally: if (typeof window.loadScheduleList === 'function') await loadScheduleList();
    code = code.replace(/if\s*\(\s*typeof\s+window\.([a-zA-Z0-9_]+)\s*===\s*'function'\s*\)\s*await\s+([a-zA-Z0-9_]+)\s*\(/g, (match, funcName, callName) => {
        if (funcName === callName) {
            return `if (typeof window.${funcName} === 'function') await window.${funcName}(`;
        }
        return match;
    });

    // Also handle setTimeout(() => { if (typeof window.f === 'function') f(); }, 600)
    code = code.replace(/if\s*\(\s*typeof\s+window\.([a-zA-Z0-9_]+)\s*===\s*'function'\s*\)\s*([a-zA-Z0-9_]+)\s*\(/g, (match, funcName, callName) => {
        if (funcName === callName) {
            return `if (typeof window.${funcName} === 'function') window.${funcName}(`;
        }
        return match;
    });

    fs.writeFileSync(filePath, code);
});

console.log('typeof function checks fixed successfully.');
