import { _supabase } from './supabase-client.js';
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
                tagsHtml += '<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 dark:bg-dark-bg/50 text-slate-500 dark:text-dark-textSecondary border border-slate-200 dark:border-white/10 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ' + dateStr + ' ' + timeStr + '</span>';
                
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
                loaderEl.className = 'fixed inset-0 bg-slate-900/40 backdrop- z-[9999] flex flex-col items-center justify-center hidden transition-opacity duration-300 opacity-0';
                loaderEl.innerHTML = `<div class="bg-white dark:bg-dark-card px-6 py-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 border border-slate-100 dark:border-white/5">
                        <div class="w-8 h-8 border-4 border-[#4226E9] border-t-transparent rounded-full animate-spin"></div>
                        <p class="text-xs font-bold text-slate-600 dark:text-dark-textSecondary" id="global-dynamic-loader-text">` + text + `</p>
                    </div>`;
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
        }

        export function forceHideLoader() {
            window.showLoader(false);
            const activeLoaders = document.querySelectorAll('.loader-active, .spinning');
            activeLoaders.forEach(el => el.classList.remove('loader-active', 'spinning'));
        }

        export const activePromises = {};
        export const _requestCache = { lastFetch: {} };

        export async function deduplicateRequest(key, fetchFn) {
            if (activePromises[key]) {
                console.log(`[REQUEST DEDUPE] Reusing active promise for: ${key}`);
                return activePromises[key];
            }
            activePromises[key] = fetchFn().finally(() => {
                activePromises[key] = null;
            });
            return activePromises[key];
        }

        export async function fetchCachedOrDeduplicated(key, fetchFn, bypassCache = false) {
            const now = Date.now();
            if (!bypassCache && _requestCache[key] && (now - _requestCache.lastFetch[key] < window.CACHE_TTL)) {
                console.log(`[REQUEST CACHE] Serving ${key} from cache. Age: ${(now - _requestCache.lastFetch[key]) / 1000}s`);
                return _requestCache[key];
            }
            
            const result = await deduplicateRequest(key, fetchFn);
            _requestCache[key] = result;
            _requestCache.lastFetch[key] = Date.now();
            return result;
        }

        export function cancelActiveRequest(key) {
            if (window.activeLoadControllers && window.activeLoadControllers[key]) {
                try {
                    window.activeLoadControllers[key].abort();
                    console.log(`[ABORT CLEANUP] Cancelled active request for: ${key}`);
                } catch (e) {
                    console.warn(`[ABORT ERROR] Error aborting ${key}:`, e);
                }
                window.activeLoadControllers[key] = null;
                if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
            }
        }

        export function cancelAllActiveRequests() {
            if (window.activeLoadControllers) {
                Object.keys(window.activeLoadControllers).forEach(key => {
                    cancelActiveRequest(key);
                });
            }
        }

        export async function fetchWithRetry(fn, retries = 2, delay = 1000, timeoutMs = 20000, parentSignal = null) {
            let lastError = null;
            for (let i = 0; i < retries; i++) {
                if (parentSignal && parentSignal.aborted) {
                    throw new DOMException("The user aborted a request.", "AbortError");
                }
                const controller = new AbortController();
                const signal = controller.signal;

                // If parent signal aborts, abort our internal controller
                const onParentAbort = () => {
                    controller.abort();
                };
                if (parentSignal) {
                    parentSignal.addEventListener('abort', onParentAbort);
                }

                let timer = null;
                const startTime = performance.now();
                // console.log(`[REQUEST START] Retries left: ${retries - i - 1}. Attempt ${i + 1}`);
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            controller.abort();
                            console.warn(`[TIMEOUT SOURCE] Request timed out after ${timeoutMs}ms`);
                            reject(new Error("Network request timed out"));
                        }, timeoutMs);
                    });
                    const result = await Promise.race([fn(signal), timeoutPromise]);
                    if (timer) clearTimeout(timer);
                    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
                    const duration = (performance.now() - startTime).toFixed(1);
                    // console.log(`[REQUEST SUCCESS] Duration: ${duration}ms`);
                    return result;
                } catch (err) {
                    if (timer) clearTimeout(timer);
                    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
                    controller.abort();
                    const duration = (performance.now() - startTime).toFixed(1);
                    if (err.name !== 'AbortError' && !(err.message && err.message.includes('AbortError'))) {
                        console.error(`[REQUEST FAILURE] Attempt ${i + 1} failed after ${duration}ms:`, err.message || err);
                    }
                    lastError = err;
                    if (i === retries - 1 || err.name === 'AbortError' || (parentSignal && parentSignal.aborted)) {
                        throw err;
                    }
                    // Exponential backoff
                    await new Promise((resolve, reject) => {
                        const backoffTimer = setTimeout(resolve, delay * Math.pow(2, i));
                        if (parentSignal) {
                            parentSignal.addEventListener('abort', () => {
                                clearTimeout(backoffTimer);
                                reject(new DOMException("The user aborted a request.", "AbortError"));
                            }, { once: true });
                        }
                    });
                }
            }
            throw lastError || new Error("Request failed after retries");
        }

        export async function ensureBucketExists(bucketName) {
            console.log(`[STORAGE] Direct access check for bucket '${bucketName}' (non-blocking admin check)...`);
        }

        export function extractIdFromEmail(email) {
            try {
                const emailStr = String(email || '').trim();
                const atIndex = emailStr.indexOf('@');
                if (atIndex === -1) return emailStr;
                return emailStr.substring(0, atIndex);
            } catch (err) {
                console.error('[ERROR] extractIdFromEmail failed:', err);
                return '';
            }
        }

        export function getGreeting() {
            const hour = new Date().getHours();
            if (hour >= 5 && hour < 12) return 'Good Morning';
            if (hour >= 12 && hour < 17) return 'Good Afternoon';
            if (hour >= 17 && hour < 21) return 'Good Evening';
            return 'Good Night';
        }



let lastFocusedEditor = null;
document.addEventListener('focusin', (e) => {
    if (e.target.hasAttribute('contenteditable') || e.target.tagName === 'TEXTAREA') {
        lastFocusedEditor = e.target;
    }
});

window.clearLastFocusedEditor = function() {
    lastFocusedEditor = null;
};


window.formatText = function(type, value = null, targetId = null) {
    const el = targetId ? document.getElementById(targetId) : lastFocusedEditor;
    if (!el) {
        window.showGlobalToast('Focus Required', 'Please click inside the text area first.');
        return;
    }
    
    if (el.tagName === 'TEXTAREA') {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = el.value;
        const selectedText = text.substring(start, end);
        let replacement = '';
        
        if (type === 'bold') replacement = `**${selectedText || 'bold text'}**`;
        else if (type === 'italic') replacement = `*${selectedText || 'italic text'}*`;
        else if (type === 'underline') replacement = `__${selectedText || 'underlined text'}__`;
        else if (type === 'link') {
            const url = prompt('Enter URL (e.g., https://example.com):');
            if (!url) return;
            replacement = `[${selectedText || url}](${url})`;
        }
        else if (type === 'color' && value) {
            replacement = `[color=${value}]${selectedText || 'colored text'}[/color]`;
        }
        
        el.value = text.substring(0, start) + replacement + text.substring(end);
        el.selectionStart = start + replacement.length;
        el.selectionEnd = start + replacement.length;
        el.focus();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        el.focus();
        if (type === 'bold') document.execCommand('bold', false, null);
        else if (type === 'italic') document.execCommand('italic', false, null);
        else if (type === 'underline') document.execCommand('underline', false, null);
        else if (type === 'link') {
            const url = prompt('Enter URL (e.g., https://example.com):');
            if (url) document.execCommand('createLink', false, url);
        } else if (type === 'color' && value) {
            document.execCommand('foreColor', false, value);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
};

window.applyFormat = function(type, value = null) {
    window.formatText(type, value, null);
};

window.safeFormatRichText = function(text) {
    if (!text) return '';
    let safeText = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Bold, Italic, Underline
    safeText = safeText.replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>');
    safeText = safeText.replace(/\*(.*?)\*/gs, '<em>$1</em>');
    safeText = safeText.replace(/__(.*?)__/gs, '<u>$1</u>');
    
    // Color (allow hex, rgb, rgba) - handle nested
    let prevText;
    do {
        prevText = safeText;
        safeText = safeText.replace(/\[color=([^\]]+)\]((?:(?!\[\/?color).)*?)\[\/color\]/gis, '<span style="color: $1; font-weight: 600;">$2</span>');
    } while (safeText !== prevText);
    // Cleanup any orphaned tags
    safeText = safeText.replace(/\[\/?color(?:=[^\]]+)?\]/gi, '');
    
    // Links (Placeholder approach to prevent double parsing and WebKit issues)
    let linkMap = [];
    safeText = safeText.replace(/\[(.*?)\]\((https?:\/\/[^\)]+)\)/gs, (match, p1, p2) => {
        linkMap.push(`<a href="${p2}" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-bold hover:underline break-all">${p1}</a>`);
        return `___LINK_${linkMap.length - 1}___`;
    });
    
    // Raw URLs fallback
    safeText = safeText.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
        return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-bold hover:underline break-all">${match}</a>`;
    });
    
    // Restore placeholders
    for (let i = 0; i < linkMap.length; i++) {
        safeText = safeText.replace(`___LINK_${i}___`, linkMap[i]);
    }
    
    // Convert newlines to breaks
    safeText = safeText.replace(/\n/g, '<br>');
    return safeText;
};

window.stripRichText = function(text) {
    if (!text) return '';
    let plain = String(text);
    // Remove color tags
    plain = plain.replace(/\[\/?color(?:=[^\]]+)?\]/gi, '');
    // Remove link formats [text](url) -> text
    plain = plain.replace(/\[(.*?)\]\((https?:\/\/[^\)]+)\)/gs, '$1');
    // Remove formatting tokens but keep the text
    plain = plain.replace(/\*\*(.*?)\*\*/gs, '$1');
    plain = plain.replace(/\*(.*?)\*/gs, '$1');
    plain = plain.replace(/__(.*?)__/gs, '$1');
    plain = plain.replace(/\[color=[^\]]+\](.*?)\[\/color\]/gs, '$1');
    // For links [text](url), just keep the text
    plain = plain.replace(/\[(.*?)\]\(https?:\/\/[^\)]+\)/gs, '$1');
    return plain;
};

window.htmlToMarkdown = function(html) {
    let text = html || '';
    
    // Replace divs and breaks with newlines
    text = text.replace(/<div><br><\/div>/gi, '\n');
    text = text.replace(/<div[^>]*>/gi, '\n');
    text = text.replace(/<\/div>/gi, '');
    text = text.replace(/<br[^>]*>/gi, '\n');
    
    // Bold
    text = text.replace(/<b\b[^>]*>(.*?)<\/b>/gis, '**$1**');
    text = text.replace(/<strong\b[^>]*>(.*?)<\/strong>/gis, '**$1**');
    
    // Italic
    text = text.replace(/<i\b[^>]*>(.*?)<\/i>/gis, '*$1*');
    text = text.replace(/<em\b[^>]*>(.*?)<\/em>/gis, '*$1*');
    
    // Underline
    text = text.replace(/<u\b[^>]*>(.*?)<\/u>/gis, '__$1__');
    
    // Colors
    text = text.replace(/<font[^>]*color="([^"]+)"[^>]*>(.*?)<\/font>/gis, '[color=$1]$2[/color]');
    text = text.replace(/<span[^>]*style="[^"]*color:\s*([^;"]+)[^"]*"[^>]*>(.*?)<\/span>/gis, function(m, col, content) {
        return `[color=${col}]${content}[/color]`;
    });
    
    // Links (keep display text and href)
    text = text.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '[$2]($1)');
    
    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Unescape entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    
    return text.trim();
};

window.initRichEditors = function() {
    document.querySelectorAll('.rich-text-toolbar').forEach(toolbar => {
        if (toolbar.dataset.richInit) return;
        toolbar.dataset.richInit = 'true';
        
        let container = toolbar.parentElement;
        let textarea = container.querySelector('textarea');
        if (!textarea) return;
        
        textarea.style.display = 'none';
        
        let editor = document.createElement('div');
        editor.setAttribute('contenteditable', 'true');
        editor.className = textarea.className.replace('resize-none', '');
        editor.style.height = textarea.style.height || 'auto';
        editor.style.minHeight = '120px';
        editor.style.overflowY = 'auto';
        editor.style.display = 'block';
        editor.innerHTML = window.safeFormatRichText(textarea.value || '');
        
        textarea.parentNode.insertBefore(editor, textarea.nextSibling);
        
        editor.addEventListener('input', () => {
            textarea.value = window.htmlToMarkdown(editor.innerHTML);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        
        const origDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        Object.defineProperty(textarea, 'value', {
            configurable: true,
            get: function() {
                return origDesc.get.call(this);
            },
            set: function(val) {
                origDesc.set.call(this, val);
                if (document.activeElement !== editor) {
                    editor.innerHTML = window.safeFormatRichText(val || '');
                }
            }
        });
    });
};

document.addEventListener('DOMContentLoaded', window.initRichEditors);

// Call it once just in case it's already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(window.initRichEditors, 100);
}


// --- GLOBAL DELETE UTILITY ---
window.executeGlobalDelete = async (tableName, itemId, elementContainerId) => {
    if (!confirm("Are you sure you want to delete this item? This cannot be undone.")) return;
    window.showLoader(true, "Deleting item...");
    try {
        let parentType = tableName;
        let databaseTable = tableName;
        let targetContentType = null;
        let storageBucket = null;
        let relationTables = [];

        if (tableName === 'notices') {
            parentType = 'notice';
            targetContentType = 'notice';
            storageBucket = 'notice-files';
            relationTables = [{ table: 'notice_courses', foreignKey: 'notice_id' }];
        } else if (tableName === 'materials') {
            parentType = 'material';
            targetContentType = 'material';
            storageBucket = 'material-files';
            relationTables = [{ table: 'material_courses', foreignKey: 'material_id' }];
        } else if (tableName === 'schedules') {
            parentType = 'schedule';
            targetContentType = 'schedule';
            storageBucket = 'schedule-files';
            relationTables = [{ table: 'schedule_courses', foreignKey: 'schedule_id' }];
        } else if (tableName === 'groups') {
            parentType = 'group';
        } else if (tableName === 'polls' || tableName === 'poll') {
            parentType = 'poll';
            databaseTable = 'notices'; // polls are stored in notices table
            targetContentType = 'notice'; // targets were inserted as 'notice'
        } else if (tableName === 'exam_schedules' || tableName === 'exam') {
            parentType = 'exam';
            databaseTable = 'exam_schedules';
            targetContentType = 'exam'; // Exams might not have target rows but it's safe to check
        }

        try {
            const { CascadeDeleteService } = await import('./services/CascadeDeleteService.js');
            const cascadeRes = await CascadeDeleteService.cascadeDelete({
                parentType,
                parentId: itemId,
                databaseTable,
                targetContentType,
                storageBucket,
                relationTables
            });
            if (!cascadeRes.success) throw cascadeRes.error;
        } catch (fallbackErr) {
            console.warn("CascadeDeleteService not found, falling back.");
            if (tableName === 'notices' || tableName === 'materials' || tableName === 'schedules') {
                const { error } = await _supabase.rpc('delete_feed_item_cascade', { table_name: tableName, item_id: itemId });
                if (error) throw error;
            } else {
                const { error } = await _supabase.from(tableName).delete().eq('id', itemId);
                if (error) throw error;
            }
        }

        const uiElement = document.getElementById(elementContainerId);
        if (uiElement) uiElement.remove();
        window.showGlobalToast("Success", "Item deleted successfully.");
    } catch (err) {
        console.error("Delete failed:", err);
        window.showGlobalToast("Error", "Failed to delete. Ensure you have permission and no database constraints exist.");
    } finally {
        window.showLoader(false);
    }
};

window.formatTimeIfPossible = function(timeStr) {
    if (!timeStr) return '--';
    try {
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const period = h >= 12 ? 'PM' : 'AM';
        const hh = h % 12 || 12;
        return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
    } catch (e) {
        return timeStr;
    }
};
