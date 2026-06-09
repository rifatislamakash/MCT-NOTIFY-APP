const fs = require('fs');
const path = require('path');

const jsFiles = ['auth.js', 'profile.js', 'faculty.js', 'materials.js', 'notices.js', 'schedules.js', 'routines.js', 'dashboard.js', 'notifications.js', 'utils.js', 'supabase-client.js'];

jsFiles.forEach(file => {
    const filePath = path.join('js', file);
    if (!fs.existsSync(filePath)) return;
    
    let code = fs.readFileSync(filePath, 'utf8');
    let originalCode = code;
    
    // Fix imports: import { window.foo, window.bar } from '...' -> import { foo, bar } from '...'
    code = code.replace(/import\s+{([^}]+)}\s+from/g, (match, imports) => {
        const fixedImports = imports.replace(/window\./g, '');
        return `import {${fixedImports}} from`;
    });
    
    // Fix exports: export { window.foo, window.bar } -> export { foo, bar }
    code = code.replace(/export\s+{([^}]+)}/g, (match, exports) => {
        const fixedExports = exports.replace(/window\./g, '');
        return `export {${fixedExports}}`;
    });

    if (code !== originalCode) {
        fs.writeFileSync(filePath, code);
        console.log(`Fixed import/export syntax in ${file}`);
    }
});
