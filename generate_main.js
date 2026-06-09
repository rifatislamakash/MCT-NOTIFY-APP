const fs = require('fs');
const path = require('path');

const services = ['utils.js', 'auth.js', 'profile.js', 'faculty.js', 'materials.js', 'notices.js', 'schedules.js', 'routines.js', 'dashboard.js'];

let mainCode = '// Phase 11: Bridge Migration Entry Point\n\n';

mainCode += `import { _supabase } from './js/supabase-client.js';\nwindow._supabase = _supabase;\n\n`;

services.forEach(service => {
    const file = path.join('js', service);
    const code = fs.readFileSync(file, 'utf8');
    
    // 1. Explicitly exported functions
    const regex = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)/g;
    let match;
    const exportsList = [];
    while ((match = regex.exec(code)) !== null) {
      if (!exportsList.includes(match[1])) {
          exportsList.push(match[1]);
      }
    }
    
    if (exportsList.length > 0) {
        mainCode += `import { ${exportsList.join(', ')} } from './js/${service}';\n`;
        exportsList.forEach(exp => {
            mainCode += `window.${exp} = ${exp};\n`;
        });
        mainCode += '\n';
    }
    
    // 2. Service Object and its properties
    const serviceObjMatch = code.match(/export const (\w+Service)\s*=\s*\{([\s\S]*?)\};/);
    if (serviceObjMatch) {
        const sName = serviceObjMatch[1];
        const innerProps = serviceObjMatch[2];
        
        mainCode += `import { ${sName} } from './js/${service}';\n`;
        mainCode += `window.${sName} = ${sName};\n`;
        
        // Extract properties: propName: value or propName,
        // Since the format is usually  prop: func, or just func,
        const propRegex = /([a-zA-Z0-9_]+)\s*:/g;
        let pMatch;
        while ((pMatch = propRegex.exec(innerProps)) !== null) {
            const propName = pMatch[1];
            // If it wasn't already attached directly via export list
            if (!exportsList.includes(propName)) {
                mainCode += `window.${propName} = ${sName}.${propName};\n`;
            }
        }
        mainCode += '\n';
    }
});

fs.writeFileSync('main.js', mainCode);
console.log('Regenerated main.js with all service properties');
