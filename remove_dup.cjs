const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', 'utf8');

const startString = '// CRITICAL SECURITY CHECK: Verify this is a brand-new registration event,';
const firstIdx = content.indexOf(startString);
const secondIdx = content.indexOf(startString, firstIdx + 1);

if (secondIdx !== -1) {
    // Find where the second block ends. It ends exactly at the two closing braces.
    const endString = 'console.log("[ONBOARDING] Standard login or returning session detected. Skipping onboarding welcome push.");\n                }\n            }\n        }';
    let secondEnd = content.indexOf(endString, secondIdx);
    
    if (secondEnd !== -1) {
        secondEnd += endString.length;
        content = content.substring(0, secondIdx) + content.substring(secondEnd);
        fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', content);
        console.log('Removed duplicate block');
    } else {
        console.log('Could not find end of second block.');
    }
} else {
    console.log('No duplicate found');
}
