import { _supabase } from './supabase-client.js';
        export function showGlobalToast(title, msg) {
            const toast = document.getElementById('global-toast');
            const titleEl = document.getElementById('global-toast-title');
            const bodyEl = document.getElementById('global-toast-body');
            if (toast && titleEl && bodyEl) {
                titleEl.innerHTML = title;
                bodyEl.innerHTML = msg;
                toast.style.transform = 'translateY(20px)';
                toast.style.opacity = '1';
                setTimeout(dismissGlobalToast, 4000);
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

        export function showLoader(show, text = 'Loading...') {
            let loaderEl = document.getElementById('global-dynamic-loader');
            if (!loaderEl) {
                loaderEl = document.createElement('div');
                loaderEl.id = 'global-dynamic-loader';
                loaderEl.className = 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center hidden transition-opacity duration-300 opacity-0';
                loaderEl.innerHTML = `
                    <div class="bg-white px-6 py-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 border border-slate-100">
                        <div class="w-8 h-8 border-4 border-[#4226E9] border-t-transparent rounded-full animate-spin"></div>
                        <p class="text-xs font-bold text-slate-600" id="global-dynamic-loader-text">${text}</p>
                    </div>
                `;
                document.body.appendChild(loaderEl);
            }
            
            const textEl = document.getElementById('global-dynamic-loader-text');
            if (textEl && text) textEl.innerText = text;

            if (show) {
                loaderEl.classList.remove('hidden');
                // small delay to allow display:block to apply before opacity transition
                setTimeout(() => loaderEl.classList.remove('opacity-0'), 10);
            } else {
                loaderEl.classList.add('opacity-0');
                setTimeout(() => loaderEl.classList.add('hidden'), 300);
            }
            
            // Also attempt to hide any fallback original loaders
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

        export async function fetchWithRetry(fn, retries = 2, delay = 1000, timeoutMs = 8000, parentSignal = null) {
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

console.log("[ARCHITECTURE]\nutils loaded");
