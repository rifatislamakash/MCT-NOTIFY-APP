const fs = require('fs');
const lines = fs.readFileSync('js/utils.js', 'utf8').split('\n');

const headerCode = `import { _supabase } from './supabase-client.js?v=rescue2';
        let globalToastTimer = null;
        export function showGlobalToast(title, msg) {
            const toast = document.getElementById('global-toast');
            const titleEl = document.getElementById('global-toast-title');
            const bodyEl = document.getElementById('global-toast-body');
            if (toast && titleEl && bodyEl) {
                if (globalToastTimer) clearTimeout(globalToastTimer);
                titleEl.innerHTML = title;
                bodyEl.innerHTML = msg;
                toast.style.transform = 'translateY(20px)';
                toast.style.opacity = '1';
                globalToastTimer = setTimeout(dismissGlobalToast, 4000);
            } else {
                console.warn('Toast:', title, msg);
            }
        }

        export function dismissGlobalToast() {
            const toast = document.getElementById('global-toast');
            if (toast) {
                toast.style.transform = 'translateY(-150px)';
                toast.style.opacity = '0';
            }
        }

        let notificationToastTimer = null;
        export function showNotificationToast(title, body, payload = null) {
            const toast = document.getElementById('notification-toast');
            if (!toast) return;

            if (notificationToastTimer) clearTimeout(notificationToastTimer);

            document.getElementById('nt-title').innerText = title || 'Notification';
            document.getElementById('nt-desc').innerText = body || '';

            const tagsContainer = document.getElementById('nt-tags');
            tagsContainer.innerHTML = '';
            
            if (payload && payload.data) {
                const dateStr = payload.data.date || new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
                const timeStr = payload.data.time || new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const typeStr = payload.data.type ? payload.data.type.toUpperCase() : 'UPDATE';
                
                let tagsHtml = '<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-indigo-100 text-[#4226E9] uppercase">' + window.sanitizeHTML(typeStr) + '</span>';
                tagsHtml += '<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ' + dateStr + ' ' + timeStr + '</span>';
                
                if (payload.data.course_names) {
                    const courses = payload.data.course_names.split(',');
                    courses.forEach(c => {
                        tagsHtml += '<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ' + window.sanitizeHTML(c.trim()) + '</span>';
                    });
                }
                tagsContainer.innerHTML = tagsHtml;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
            
            notificationToastTimer = setTimeout(() => {
                toast.style.transform = 'translateY(-150%)';
                toast.style.opacity = '0';
            }, 5000);
        }

        export function showLoader(show, text = 'Loading...') {
            let loaderEl = document.getElementById('global-dynamic-loader');
            if (!loaderEl) {
                loaderEl = document.createElement('div');
                loaderEl.id = 'global-dynamic-loader';
                loaderEl.className = 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center hidden transition-opacity duration-300 opacity-0';
                loaderEl.innerHTML = \`<div class="bg-white px-6 py-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 border border-slate-100">
                        <div class="w-8 h-8 border-4 border-[#4226E9] border-t-transparent rounded-full animate-spin"></div>
                        <p class="text-xs font-bold text-slate-600" id="global-dynamic-loader-text">\` + text + \`</p>
                    </div>\`;
                document.body.appendChild(loaderEl);
            }
            
            const textEl = document.getElementById('global-dynamic-loader-text');
            if (textEl && text) textEl.innerText = text;

            if (show) {
                loaderEl.classList.remove('hidden');
                setTimeout(() => loaderEl.classList.remove('opacity-0'), 10);
            } else {
                loaderEl.classList.add('opacity-0');
                setTimeout(() => loaderEl.classList.add('hidden'), 300);
            }
            
            if (!show) {
                document.querySelectorAll('.loader, .loading-screen').forEach(el => {
                    el.classList.add('hidden');
                });
            }
        }`;

// find where 'export function forceHideLoader()' starts
const startIndex = lines.findIndex(l => l.includes('export function forceHideLoader()'));
const remainingLines = lines.slice(startIndex).join('\n');
fs.writeFileSync('js/utils.js', headerCode + '\n\n' + remainingLines);
console.log('Restored utils.js');
