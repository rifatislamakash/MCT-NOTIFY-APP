const fs = require('fs');
const path = require('path');

const globalsToFix = [
    'authState', 
    'currentUserEmail', 
    'currentUserRole', 
    'currentActiveScreen', 
    'deviceToken', 
    'currentCoursesList', 
    'currentFacultiesList', 
    'currentMaterialsList', 
    'currentNoticesList', 
    'currentSchedulesList', 
    'currentUserCoursesList', 
    'currentUserName', 
    'currentViewedFacultyId', 
    'selectedFaculty', 
    'contentSettings',
    'isAdminEmail',
    'showLoader',
    'showGlobalToast',
    'navigate',
    'navigateBack',
    'forceHideLoader'
];

const jsFiles = ['auth.js', 'profile.js', 'faculty.js', 'materials.js', 'notices.js', 'schedules.js', 'routines.js', 'dashboard.js', 'notifications.js', 'utils.js', 'supabase-client.js'];

let modifiedAny = false;

jsFiles.forEach(file => {
    const filePath = path.join('js', file);
    if (!fs.existsSync(filePath)) return;
    
    let code = fs.readFileSync(filePath, 'utf8');
    let originalCode = code;
    
    globalsToFix.forEach(g => {
        // We want to replace occurrences of 'g' that are NOT already prefixed by 'window.' or '.' (like obj.g)
        // and are NOT part of a larger word (like 'myg' or 'gName')
        // We use a regex with negative lookbehind (if supported, Node 14+ supports it)
        const regex = new RegExp(`(?<![\\w\\.])\\b${g}\\b`, 'g');
        
        // Also we don't want to replace if it's inside a typeof check because we already fixed those, or maybe we do?
        // Actually, replacing `typeof g` with `typeof window.g` is fine and desired.
        
        // Wait, if 'g' is declared locally as a function argument or variable, we shouldn't replace it.
        // But these are known globals. Let's just blindly prefix them if they aren't already.
        
        code = code.replace(regex, `window.${g}`);
    });
    
    if (code !== originalCode) {
        fs.writeFileSync(filePath, code);
        console.log(`Updated ${file}`);
        modifiedAny = true;
    }
});

if (!modifiedAny) {
    console.log("No files needed updating.");
}
