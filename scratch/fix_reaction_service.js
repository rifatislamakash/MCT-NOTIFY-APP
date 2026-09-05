const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/services/ReactionService.js', 'utf8');

// The exact string to remove:
// ${isAdmin ? `
// <button onclick="event.stopPropagation(); triggerImmediateNotification('${contentType}', '${contentId}', this)" class="px-2.5 py-1.5 bg-[#4226E9] hover:bg-[#341BC5] text-white rounded-[6px] text-[10px] font-bold transition-colors flex items-center gap-1 shrink-0 ml-1 mr-[2px]">
//     <i data-lucide="bell" class="w-3 h-3"></i> Notify
// </button>
// ` : ''}

content = content.replace(/\$\{isAdmin \? `[\s\S]*?<i data-lucide="bell" class="w-3 h-3"><\/i> Notify\s*<\/button>\s*` : ''\}/g, '');
fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/services/ReactionService.js', content);
console.log("Updated ReactionService.js");
