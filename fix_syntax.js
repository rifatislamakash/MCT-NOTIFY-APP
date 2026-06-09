const fs = require('fs');
const path = require('path');

const jsFiles = ['auth.js', 'profile.js', 'faculty.js', 'materials.js', 'notices.js', 'schedules.js', 'routines.js', 'dashboard.js', 'notifications.js', 'utils.js', 'supabase-client.js'];

jsFiles.forEach(file => {
    const filePath = path.join('js', file);
    if (!fs.existsSync(filePath)) return;
    
    let code = fs.readFileSync(filePath, 'utf8');
    let originalCode = code;
    
    // Fix: export function window.funcName -> export function funcName
    code = code.replace(/export\s+function\s+window\.([a-zA-Z0-9_]+)/g, 'export function $1');
    // Fix: function window.funcName -> function funcName
    code = code.replace(/function\s+window\.([a-zA-Z0-9_]+)/g, 'function $1');
    // Fix: async function window.funcName -> async function funcName
    code = code.replace(/async\s+function\s+window\.([a-zA-Z0-9_]+)/g, 'async function $1');
    // Fix: export async function window.funcName -> export async function funcName
    code = code.replace(/export\s+async\s+function\s+window\.([a-zA-Z0-9_]+)/g, 'export async function $1');
    
    if (code !== originalCode) {
        fs.writeFileSync(filePath, code);
        console.log(`Reverted window. in function declarations for ${file}`);
    }
});
