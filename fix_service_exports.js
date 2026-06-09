const fs = require('fs');
const path = require('path');

const jsFiles = ['auth.js', 'profile.js', 'faculty.js', 'materials.js', 'notices.js', 'schedules.js', 'routines.js', 'dashboard.js', 'notifications.js'];

jsFiles.forEach(file => {
    const filePath = path.join('js', file);
    if (!fs.existsSync(filePath)) return;
    
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Target the export const XXXService = { ... } blocks or similar object literal exports
    code = code.replace(/([a-zA-Z0-9_]+)\s*:\s*window\.([a-zA-Z0-9_]+)/g, (match, key, valueName) => {
        // Exclude specific known valid window props like isAdminEmail that we just fixed
        if (valueName === 'isAdminEmail' || valueName === 'sanitizeHTML') return match;
        if (valueName === 'authState') return match;
        
        return `${key}: typeof ${valueName} !== 'undefined' ? ${valueName} : window.${valueName}`;
    });
    
    fs.writeFileSync(filePath, code);
});

console.log('Service objects fixed successfully.');
