import { _supabase } from './supabase-client.js';
import { crPermissionService } from './services/crPermissionService.js';
import { showGlobalToast, showLoader, forceHideLoader, fetchCachedOrDeduplicated, cancelActiveRequest, fetchWithRetry } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // ==========================================
        // SCHEDULE SYSTEM — COMPLETE ENGINE
        // ==========================================

        // ----- Global State -----
        let schedulesList = [];               // Full raw list from Supabase
        let scheduleCoursesMap = {};          // scheduleId -> [courseId, ...]
        let allCoursesList = [];              // public.courses cache
        let selectedScheduleId = null;        // Currently viewed/editing schedule
        let currentScheduleAudienceType = 'all_students';  // Create form
        let currentEditAudienceType = 'all_students';       // Edit form
        let currentScheduleSelectedCourses = []; // Create form selected course ids
        let currentEditSelectedCourses = [];     // Edit form selected course ids
        let currentScheduleFile = null;       // Create form file
        let currentEditScheduleFile = null;   // Edit form file
        let currentEditRemoveAttachment = false; // Flag to remove existing attachment on edit

        // ----- Helpers -----

        function formatScheduleDate(dateStr) {
            if (!dateStr) return '—';
            try {
                const d = new Date(dateStr + 'T00:00:00');
                return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch (e) { return dateStr; }
        }

        function formatScheduleTime(timeStr) {
            if (!timeStr) return '—';
            try {
                const [h, m] = timeStr.split(':').map(Number);
                const period = h >= 12 ? 'PM' : 'AM';
                const hh = h % 12 || 12;
                return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
            } catch (e) { return timeStr; }
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        function getAudienceBadge(type) {
            if (type === 'all_students') {
                return { text: 'All Students', cls: 'bg-emerald-100 text-emerald-700' };
            }
            return { text: 'Specific', cls: 'bg-blue-100 text-blue-700' };
        }

        // ----- LOAD SCHEDULE LIST -----
        window.loadScheduleList = async function (skipRender = false) {
            if (window.isModuleLoading('schedule')) {
                console.log("[SCHEDULE] Load already in progress, ignoring duplicate call.");
                return;
            }
            window.setModuleLoading('schedule', true);
            cancelActiveRequest('schedule');
            const localController = new AbortController();
            window.activeLoadControllers['schedule'] = localController;

            const container = document.getElementById('schedule-list-container');
            if (!container) {
                window.setModuleLoading('schedule', false);
                return;
            }

            // Show admin add button
            const addBtn = document.getElementById('schedule-admin-add-btn');
            if (addBtn) {
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                if (isAdmin) addBtn.classList.remove('hidden');
                else addBtn.classList.add('hidden');
            }

            // Show spinner
            container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-16 text-slate-400">
                        <div class="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p class="text-xs font-semibold">Loading schedules...</p>
                    </div>`;

            console.log("[SCHEDULE] Fetching schedules list...");
            try {
                if (allCoursesList.length === 0) {
                    allCoursesList = await window.crPermissionService.getVisibleCourses();
                }
                const { rawSchedules, scMap, ctMap } = await fetchCachedOrDeduplicated('schedules', async () => {
                    let schedulesData;
                    if (crPermissionService.isCR()) {
                        schedulesData = await crPermissionService.getVisibleSchedules();
                    } else {
                        schedulesData = await fetchWithRetry(async (signal) => {
                            const { data, error } = await _supabase
                                .from('schedules')
                                .select('*, profiles (id, full_name, profile_url, role)')
                                .order('is_pinned', { ascending: false })
                                .order('created_at', { ascending: false })
                                .abortSignal(signal);
                            if (error) throw error;
                            return data || [];
                        }, 2, 1000, 8000, localController.signal);
                    }

                    const targetSpecificTypes = ['specific', 'batch_students', 'batch_crs', 'course_students', 'specific_student'];
                    const scheduleIds = schedulesData.filter(s => targetSpecificTypes.includes(s.audience_type)).map(s => s.id);
                    let scMap = {};
                    let ctMap = {};
                    if (scheduleIds.length > 0) {
                        const scData = await fetchWithRetry(async (subSignal) => {
                            const { data, error } = await _supabase
                                .from('schedule_courses')
                                .select('schedule_id, course_id')
                                .in('schedule_id', scheduleIds)
                                .abortSignal(subSignal);
                            if (error) throw error;
                            return data || [];
                        }, 2, 1000, 8000, localController.signal);

                        scData.forEach(row => {
                            if (!scMap[row.schedule_id]) scMap[row.schedule_id] = [];
                            scMap[row.schedule_id].push(row.course_id);
                        });

                        const ctData = await fetchWithRetry(async (subSignal) => {
                            const { data, error } = await _supabase
                                .from('content_targets')
                                .select('*')
                                .eq('content_type', 'schedule')
                                .in('content_id', scheduleIds)
                                .abortSignal(subSignal);
                            if (error) throw error;
                            return data || [];
                        }, 2, 1000, 8000, localController.signal);

                        ctData.forEach(row => {
                            if (!ctMap[row.content_id]) ctMap[row.content_id] = [];
                            ctMap[row.content_id].push(row);
                            
                            // Bridge content_targets to scheduleCoursesMap for course tags
                            if (row.target_type === 'course_students' || row.target_type === 'specific') {
                                if (!scMap[row.content_id]) scMap[row.content_id] = [];
                                if (!scMap[row.content_id].includes(row.target_id)) {
                                    scMap[row.content_id].push(row.target_id);
                                }
                            }
                        });
                    }
                    return { rawSchedules: schedulesData, scMap, ctMap };
                });

                if (localController.signal.aborted) {
                    console.log("[SCHEDULE] Load aborted, ignoring rendering.");
                    return;
                }

                let filteredSchedules = [...rawSchedules];
                scheduleCoursesMap = scMap;
                window.scheduleCoursesMap = scheduleCoursesMap;
                window.scheduleContentTargetsMap = ctMap;

                // Student visibility filter
                if (!crPermissionService.isAdmin() && !crPermissionService.isCR()) {
                    const myCourseIds = (window.currentUserCoursesList || []).map(uc => uc.course_id);
                    const courseEnrolledBatches = [...new Set(myCourseIds.map(cid => {
                        const c = (allCoursesList || []).find(x => x.id === cid);
                        return c ? c.batch_id : null;
                    }).filter(Boolean))];

                    const profileBatchId = window.authState?.profile?.batch_id;
                    const secondaryBatches = window.authState?.profile?.secondary_batches || [];
                    const ownedBatches = [profileBatchId, ...secondaryBatches].filter(Boolean);

                    filteredSchedules = filteredSchedules.filter(s => {
                        if (s.audience_type === 'all') return true;
                        if (s.audience_type === 'all_students') {
                            const targets = ctMap[s.id] || [];
                            if (targets.length > 0) {
                                return targets.some(ct => {
                                    if (ct.target_type === 'all_students') {
                                        if (!ct.target_id) return true; // Global admin schedule
                                        return ownedBatches.includes(ct.target_id) || courseEnrolledBatches.includes(ct.target_id);
                                    }
                                    return false;
                                });
                            }
                            return true;
                        }
                        
                        if (s.audience_type === 'specific') {
                            const tgt = scMap[s.id] || [];
                            if (tgt.some(cid => myCourseIds.includes(cid))) return true;
                        }
                        
                        const targets = ctMap[s.id] || [];
                        if (targets.length > 0) {
                            return targets.some(ct => {
                                if (ct.target_type === 'course_students') return myCourseIds.includes(ct.target_id);
                                if (ct.target_type === 'batch_students') return ownedBatches.includes(ct.target_id);
                                if (ct.target_type === 'specific_student') return ct.target_id === window.authState.user.id;
                                return false;
                            });
                        }
                        return false;
                    });
                }

                schedulesList = filteredSchedules;
                window.currentSchedulesList = schedulesList;

                // Populate admin batch filter
                const batchFilter = document.getElementById('admin-schedule-batch-filter');
                if (batchFilter) {
                    const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                    if (isAdmin) {
                        const isStrictAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
                        if (isStrictAdmin) {
                            batchFilter.classList.remove('hidden');
                            console.log("[BATCH FILTER LOAD] Populating schedules batch filter");
                            if (batchFilter.options.length <= 1) {
                                try {
                                    let batchesData, error;
                                    const sdkPromise = _supabase.from('batches').select('id, batch_name').order('batch_name');
                                    if (window._supabaseSdkFailing) {
                                        throw new Error('sdk_timeout');
                                    }
                                    let timerId;
                                    const timeoutPromise = new Promise((_, reject) => {
                                        timerId = setTimeout(() => reject(new Error('sdk_timeout')), 400);
                                    });
                                    try {
                                        const result = await Promise.race([sdkPromise, timeoutPromise]);
                                        batchesData = result.data;
                                        error = result.error;
                                    } finally {
                                        clearTimeout(timerId);
                                    }
                                    if (error) throw error;
                                    
                                    let optionsHTML = '<option value="" disabled selected class="text-black">Select Batch</option>';
                                    optionsHTML += '<option value="all" class="text-black">All Batches</option>';
                                    if (batchesData) {
                                        optionsHTML += batchesData.map(b => `<option value="${b.id}" class="text-black">${b.batch_name}</option>`).join('');
                                    }
                                    batchFilter.innerHTML = optionsHTML;
                                } catch(e) { 
                                    if (e.message === 'sdk_timeout') {
                                        window._supabaseSdkFailing = true;
                                        console.log("[SCHEDULE ADMIN] Supabase SDK hung, falling back to REST for batches");
                                        try {
                                            const url = `${_supabase.supabaseUrl}/rest/v1/batches?select=id,batch_name&order=batch_name.asc`;
                                            const res = await fetch(url, {
                                                headers: {
                                                    'apikey': _supabase.supabaseKey,
                                                    'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                                    'cache-control': 'no-cache'
                                                },
                                                cache: 'no-store'
                                            });
                                            if (res.ok) {
                                                const batchesData = await res.json();
                                                let optionsHTML = '<option value="" disabled selected class="text-black">Select Batch</option>';
                                                optionsHTML += '<option value="all" class="text-black">All Batches</option>';
                                                if (batchesData) {
                                                    optionsHTML += batchesData.map(b => `<option value="${b.id}" class="text-black">${b.batch_name}</option>`).join('');
                                                }
                                                batchFilter.innerHTML = optionsHTML;
                                            }
                                        } catch (fetchErr) {
                                            console.warn("REST fallback failed for batches", fetchErr);
                                        }
                                    } else {
                                        console.warn("Failed to load batches", e); 
                                    }
                                }
                            }
                        } else {
                            batchFilter.classList.add('hidden');
                        }
                    } else {
                        batchFilter.classList.add('hidden');
                    }
                }

                 // PART 9: For badge count
                
                const scheduleIds = schedulesList.map(s => s.id);
                if (window.ReactionService) await window.ReactionService.fetchReactionsForContent('schedule', scheduleIds);

                console.log(`[SCHEDULE] Successfully loaded ${schedulesList.length} schedules.`);
                if (!skipRender) {
                    filterSchedulesUI();
                    // Update schedule hub badge count
                    if (typeof window.updateScheduleBadgeCount === 'function') window.updateScheduleBadgeCount();
                    if (window.NoticeService && typeof window.NoticeService.injectDashboardNotices === 'function') window.NoticeService.injectDashboardNotices();
                }

            } catch (err) {
                if (err.name === 'AbortError' || (err.message && err.message.includes('AbortError'))) {
                    console.log("[SCHEDULE] Load aborted, ignoring.");
                    return;
                }
                console.error('[SCHEDULE LOAD ERROR]', err);
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-slate-400 px-8 text-center">
                            <i data-lucide="alert-circle" class="w-10 h-10 mb-3 text-red-300"></i>
                            <p class="text-sm font-bold text-red-500">Failed to load schedules</p>
                            <p class="text-[11px] text-slate-400 mt-1">${err.message || 'Unknown error'}</p>
                            <button onclick="loadScheduleList()" class="mt-4 px-4 py-2 bg-[#4226E9] text-white rounded-xl font-bold text-[12px]">Retry</button>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } finally {
                window.setModuleLoading('schedule', false);
                if (window.activeLoadControllers['schedule'] === localController) {
                    window.activeLoadControllers['schedule'] = null;
                }
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };

        // ----- FILTER + SORT SCHEDULES UI -----
        window.filterSchedulesUI = function () {
            const searchEl = document.getElementById('schedule-search');
            const sortEl = document.getElementById('schedule-filter-sort');
            const audienceEl = document.getElementById('schedule-filter-audience');
            const batchFilterEl = document.getElementById('admin-schedule-batch-filter');

            const searchVal = (searchEl ? searchEl.value : '').toLowerCase().trim();
            const sortVal = sortEl ? sortEl.value : 'newest';
            const audienceVal = audienceEl ? audienceEl.value : 'all';
            const batchVal = (batchFilterEl && !batchFilterEl.classList.contains('hidden')) ? batchFilterEl.value : 'all';

            if (batchFilterEl && !batchFilterEl.classList.contains('hidden')) {
                if (!batchVal || batchVal === '') {
                    console.log("[BATCH FILTER SELECT] Schedule batch changed to: undefined");
                    console.log("[SCHEDULE BATCH] No batch selected. Showing empty state.");
                    const list = document.getElementById('schedule-list-container');
                    if (list) {
                        list.innerHTML = `
                            <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <i data-lucide="layers" class="w-8 h-8 text-slate-400"></i>
                                </div>
                                <h3 class="text-lg font-bold text-slate-700">Please select a batch</h3>
                                <p class="text-sm text-slate-500 mt-1 max-w-[250px]">Select a batch from the dropdown above to view its schedules.</p>
                            </div>
                        `;
                        if (window.lucide) window.lucide.createIcons();
                    }
                    return; // DO NOT RENDER
                }
                console.log(`[BATCH FILTER SELECT] Schedule batch changed to: ${batchVal}`);
                console.log(`[SCHEDULE BATCH] Rendering schedules for batch: ${batchVal}`);
            }

            let filtered = [...schedulesList];

            // Audience filter
            if (audienceVal !== 'all') {
                filtered = filtered.filter(s => s.audience_type === audienceVal);
            }
            
            // Admin Batch Filter
            if (batchVal !== 'all') {
                filtered = filtered.filter(s => {
                    if (s.audience_type === 'all' || s.audience_type === 'all_students') return true;
                    let matchesBatch = false;
                    const tgt = scheduleCoursesMap[s.id] || [];
                    if (tgt.length > 0) {
                        matchesBatch = tgt.some(cid => {
                            const c = (allCoursesList || []).find(x => x.id === cid);
                            return c && c.batch_id === batchVal;
                        });
                    }
                    if (!matchesBatch && window.scheduleContentTargetsMap) {
                        const targets = window.scheduleContentTargetsMap[s.id] || [];
                        if (targets.length > 0) {
                            matchesBatch = targets.some(ct => {
                                if (['batch_students', 'batch_crs'].includes(ct.target_type)) return ct.target_id === batchVal;
                                if (ct.target_type === 'course_students') {
                                    const c = (allCoursesList || []).find(x => x.id === ct.target_id);
                                    return c && c.batch_id === batchVal;
                                }
                                return false;
                            });
                        }
                    }
                    return matchesBatch;
                });
            }

            // Search
            if (searchVal) {
                filtered = filtered.filter(s =>
                    (s.title || '').toLowerCase().includes(searchVal) ||
                    (s.message || '').toLowerCase().includes(searchVal)
                );
            }

            // Sort
            if (sortVal === 'newest') {
                filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            } else if (sortVal === 'oldest') {
                filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            } else if (sortVal === 'pinned') {
                filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
            }

            renderScheduleList(filtered);
        };

        // ----- RENDER SCHEDULE LIST -----
        function renderScheduleList(list = window.currentSchedulesList) {
            const container = document.getElementById('schedule-list-container');
            if (!container) return;

            // Dynamic Time-Aware Sorting
            const now = new Date();
            const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            list.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

                const dateA = new Date((a.schedule_date || toDateStr(now)) + 'T' + (a.schedule_time || '23:59:00'));
                const dateB = new Date((b.schedule_date || toDateStr(now)) + 'T' + (b.schedule_time || '23:59:00'));
                const aIsExpired = dateA < now;
                const bIsExpired = dateB < now;
                
                if (aIsExpired !== bIsExpired) {
                    return aIsExpired ? 1 : -1; // Active first, expired last
                }
                if (!aIsExpired) {
                    return dateA - dateB; // Upcoming: closest first
                } else {
                    return dateB - dateA; // Expired: most recent past first
                }
            });

            if (list.length === 0) {
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center">
                            <i data-lucide="calendar-x" class="w-12 h-12 text-slate-300 mb-3"></i>
                            <h3 class="text-[16px] font-bold text-slate-700">No schedules found</h3>
                            <p class="text-[11px] text-slate-400 mt-1">${((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail)) ? 'Tap + to add a new schedule.' : 'Check back when your admin posts a schedule.'}</p>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            const todayD = new Date();
            const tomorrowD = new Date(todayD);
            tomorrowD.setDate(todayD.getDate() + 1);
            const todayStr = toDateStr(todayD);
            const tomorrowStr = toDateStr(tomorrowD);

            container.innerHTML = list.map(s => {
                const msgPreview = (s.message || '').length > 80 ? s.message.substring(0, 80) + '…' : (s.message || '');
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                const hasAttachment = !!s.attachment_url;
                const isPinned = !!s.is_pinned;
                const isTodayOrTomorrow = s.schedule_date === todayStr || s.schedule_date === tomorrowStr;

                const schedD = new Date((s.schedule_date || todayStr) + 'T' + (s.schedule_time || '23:59:00'));
                const isExpired = schedD < new Date();

                let cardClasses = "w-full max-w-full box-border rounded-[16px] p-[16px] flex flex-col gap-1.5 cursor-pointer transition-all active:scale-[0.98] ";
                if (isExpired) {
                    cardClasses += "bg-slate-50 border border-slate-100 opacity-50 grayscale hover:opacity-80";
                } else if (isTodayOrTomorrow) {
                    cardClasses += "bg-purple-50/50 border-2 border-purple-400 hover:border-purple-500 shadow-purple-100";
                } else {
                    cardClasses += "bg-white shadow-sm border border-slate-100 hover:border-orange-200 hover:shadow-md";
                }

                let audTag = '';
                const aud = s.audience_type;
                if (aud === 'all_students') {
                    audTag = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] bg-indigo-50 border border-indigo-100 text-[#4226E9] uppercase">ALL STUDENTS</span>`;
                } else if (aud === 'all_crs') {
                    audTag = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] bg-purple-50 border border-purple-100 text-purple-600 uppercase">ALL CRs</span>`;
                } else if (aud === 'batch_students' || aud === 'batch_crs') {
                    audTag = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] bg-emerald-50 border border-emerald-100 text-emerald-600 uppercase">Specific Batch</span>`;
                } else if (aud === 'course_students' || aud === 'specific') {
                    const cIds = scheduleCoursesMap[s.id] || [];
                    if (cIds.length > 0) {
                        audTag = cIds.map(cid => {
                            const c = (allCoursesList || []).find(x => x.id === cid);
                            const name = c ? (c.short_name || c.course_name) : 'Course';
                            return `<span class="flex items-center gap-1 text-[10px] font-bold tracking-[0.03em] bg-blue-50 text-blue-600 border border-blue-100 px-[5px] py-[1.5px] rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ${window.sanitizeHTML(name)}</span>`;
                        }).join('');
                    } else {
                        audTag = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] bg-blue-100 text-blue-600 uppercase">SPECIFIC</span>`;
                    }
                } else if (aud === 'specific_student') {
                     audTag = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] bg-yellow-50 border border-yellow-100 text-yellow-600 uppercase">Specific</span>`;
                } else if (!aud || aud === 'general') {
                     audTag = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] bg-slate-100 text-slate-500 uppercase">ALL STUDENTS</span>`;
                }
                
                let badgeHtml = audTag;

                let courseTagsHtml = '';
                const cIds = scheduleCoursesMap[s.id] || [];
                if (cIds.length > 0 && !badgeHtml.includes('bg-blue-50')) { // if they aren't already generated above
                    courseTagsHtml = cIds.map(cid => {
                        const c = (allCoursesList || []).find(x => x.id === cid);
                        const name = c ? (c.short_name || c.course_name) : 'Course';
                        return `<span class="flex items-center gap-1 text-[10px] font-bold tracking-[0.03em] bg-blue-50 text-blue-600 border border-blue-100 px-[5px] py-[1.5px] rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ${window.sanitizeHTML(name)}</span>`;
                    }).join('');
                }

                // If audTag already built course tags (like for course_students or specific), use that for courseTagsHtml instead of duplicating
                if (aud === 'course_students' || aud === 'specific') {
                    courseTagsHtml = audTag;
                    badgeHtml = ''; // Clear badgeHtml since it's just course tags now
                }

                const extraBadgesHtml = `${badgeHtml}${courseTagsHtml}`;
                
                const createdDate = new Date(s.created_at);
                const diffMins = Math.floor((new Date() - createdDate) / 60000);
                let postedTimeStr = '';
                if (diffMins < 1) postedTimeStr = 'Just now';
                else if (diffMins < 60) postedTimeStr = `${diffMins}m ago`;
                else if (diffMins < 1440) postedTimeStr = `${Math.floor(diffMins/60)}h ago`;
                else postedTimeStr = createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                const pin = isPinned ? `<i data-lucide="pin" class="w-3 h-3 text-orange-500 fill-orange-500 ml-1"></i>` : '';
                const attach = hasAttachment ? `<i data-lucide="paperclip" class="w-3.5 h-3.5 text-indigo-500 ml-1"></i>` : '';

                let rightSideHtml = `<div class="flex items-center">`;
                rightSideHtml += pin + attach;
                rightSideHtml += `</div>`;

                let bottomEventTagsHtml = '';
                if (s.schedule_date || s.schedule_time) {
                    bottomEventTagsHtml = `
                        <div class="flex items-center justify-start gap-[8px]">
                            ${s.schedule_date ? `<span class="flex items-center gap-[6px] px-[4px] py-[2px] rounded-[6px] bg-slate-50 border border-[rgba(114,46,209,0.12)] text-[11px] whitespace-nowrap font-medium text-slate-600"><i data-lucide="calendar" class="w-[14px] h-[14px] text-[#4226E9]"></i> ${formatScheduleDate(s.schedule_date)}</span>` : ''}
                            ${s.schedule_time ? `<span class="flex items-center gap-[6px] px-[4px] py-[2px] rounded-[6px] bg-slate-50 border border-[rgba(114,46,209,0.12)] text-[11px] whitespace-nowrap font-medium text-slate-600"><i data-lucide="clock" class="w-[14px] h-[14px] text-[#4226E9]"></i> ${formatScheduleTime(s.schedule_time)}</span>` : ''}
                        </div>
                    `;
                }

                return `
                    <div onclick="openScheduleDetails('${s.id}')" class="${cardClasses} relative p-[16px] mt-2">
                        ${window.AuthorService ? window.AuthorService.renderAuthorBlock(s.profiles, postedTimeStr, extraBadgesHtml, rightSideHtml) : ''}
                        <div class="mt-1 flex flex-col">
                            <h4 class="font-[700] text-[16px] text-[#111827] mt-0 truncate leading-tight">${window.sanitizeHTML(s.title || 'Untitled')}</h4>
                            <p class="text-[14px] text-[#4b5563] line-clamp-2 overflow-hidden mt-[6px] leading-[1.5] w-full max-w-full box-border break-words">${window.sanitizeHTML(s.message || '')}</p>
                        </div>
                        <div class="w-full mt-[12px] !flex !flex-wrap !justify-between !items-center !gap-[8px]">
                            <div class="flex-1">${bottomEventTagsHtml}</div>
                            <div class="shrink-0 ml-3">
                                ${window.ReactionService ? window.ReactionService.renderReactionBlock('schedule', s.id) : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // ----- OPEN SCHEDULE DETAILS -----
        window.openScheduleDetails = async function (scheduleId) {
            selectedScheduleId = scheduleId;
            const s = schedulesList.find(x => x.id === scheduleId);
            if (!s) {
                window.showGlobalToast('Error', 'Schedule not found.');
                return;
            }

            window.navigate('screen-schedule-details');

            // Populate Header
            const pinBadge = document.getElementById('sd-pin-badge');
            const subtitle = document.getElementById('sd-subtitle');
            if (pinBadge) {
                if (s.is_pinned) pinBadge.classList.remove('hidden');
                else pinBadge.classList.add('hidden');
            }

            // Title + audience badge
            const titleEl = document.getElementById('sd-title');
            const audienceBadge = document.getElementById('sd-audience-badge');
            const dateEl = document.getElementById('sd-date');
            const timeEl = document.getElementById('sd-time');
            const messageEl = document.getElementById('sd-message');

            if (titleEl) titleEl.textContent = s.title || 'Untitled';
            if (dateEl) dateEl.textContent = formatScheduleDate(s.schedule_date);
            if (timeEl) timeEl.textContent = formatScheduleTime(s.schedule_time);
            if (messageEl) messageEl.textContent = s.message || '';

            if (audienceBadge) {
                const { text, cls } = getAudienceBadge(s.audience_type);
                audienceBadge.textContent = text;
                audienceBadge.className = `px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${cls}`;
            }

            // Target courses section
            const coursesSection = document.getElementById('sd-courses-section');
            const coursesList = document.getElementById('sd-courses-list');
            if (s.audience_type === 'specific') {
                if (coursesSection) coursesSection.classList.remove('hidden');
                const courseIds = scheduleCoursesMap[scheduleId] || [];
                if (courseIds.length > 0) {
                    // Load course names if not already cached
                    if (allCoursesList.length === 0) {
                        allCoursesList = await window.crPermissionService.getVisibleCourses();
                    }
                    if (coursesList) {
                        coursesList.innerHTML = courseIds.map(cid => {
                            const course = (allCoursesList || []).find(c => c.id === cid);
                            const label = course ? (course.short_name || course.course_name) : cid;
                            return `<span class="px-2.5 py-1 bg-indigo-100 text-[#4226E9] text-[11px] font-bold rounded-full">${label}</span>`;
                        }).join('');
                    }
                } else {
                    if (coursesList) coursesList.innerHTML = '<p class="text-[12px] text-slate-400">No specific courses listed.</p>';
                }
            } else {
                if (coursesSection) coursesSection.classList.add('hidden');
            }

            // Attachment
            const attachSection = document.getElementById('sd-attachment-section');
            const attachPreview = document.getElementById('sd-attachment-preview');
            const downloadBtn = document.getElementById('sd-download-btn');
            if (s.attachment_url) {
                if (attachSection) attachSection.classList.remove('hidden');
                if (downloadBtn) downloadBtn.href = s.attachment_url;
                if (attachPreview) {
                    const url = s.attachment_url;
                    const isPdf = url.toLowerCase().includes('.pdf');
                    const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);
                    if (isImage) {
                        attachPreview.innerHTML = `<img src="${url}" alt="Attachment" class="w-full rounded-[12px] object-contain max-h-48 border border-slate-100">`;
                    } else if (isPdf) {
                        attachPreview.innerHTML = `<iframe src="${url}#toolbar=0" class="w-full h-48 rounded-[12px] border border-slate-100" title="PDF Preview"></iframe>`;
                    } else {
                        attachPreview.innerHTML = `<a href="${url}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50 rounded-[12px] border border-slate-200 hover:bg-slate-100 transition">
                                <i data-lucide="file" class="w-5 h-5 text-orange-500 shrink-0"></i>
                                <span class="text-[12px] font-bold text-slate-700 truncate">View Attachment</span>
                            </a>`;
                    }
                }
            } else {
                if (attachSection) attachSection.classList.add('hidden');
            }

            // Admin actions
            const adminActions = document.getElementById('sd-admin-actions');
            if (adminActions) {
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                if (isAdmin) adminActions.classList.remove('hidden');
                else adminActions.classList.add('hidden');
            }

            if (window.ReactionService) {
                document.getElementById('sd-reaction-container').innerHTML = window.ReactionService.renderReactionBlock('schedule', scheduleId);
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        // ----- OPEN CREATE SCHEDULE -----
        window.openCreateSchedule = async function () {
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') return;

            // Reset form
            const titleEl = document.getElementById('cs-title');
            const msgEl = document.getElementById('cs-message');
            const dateEl = document.getElementById('cs-date');
            const timeEl = document.getElementById('cs-time');
            const pinEl = document.getElementById('cs-pin');

            if (titleEl) titleEl.value = '';
            if (msgEl) msgEl.value = '';
            if (dateEl) {
                // Default to today
                const today = new Date();
                dateEl.value = today.toISOString().split('T')[0];
            }
            if (timeEl) timeEl.value = '';
            if (pinEl) pinEl.checked = false;

            const remindersList = document.getElementById('schedule-reminders-list');
            if (remindersList) remindersList.innerHTML = '';

            currentScheduleFile = null;
            currentScheduleAudienceType = 'all_students';
            currentScheduleSelectedCourses = [];

            const filePreview = document.getElementById('cs-file-preview');
            if (filePreview) filePreview.classList.add('hidden');

            // Audience button states
            window.populateScheduleAudienceDropdown('cs');
            document.getElementById('cs-audience-type').value = 'all_students';
            await window.toggleScheduleAudience('cs');

            window.navigate('screen-create-schedule');
        };

        window.populateScheduleAudienceDropdown = function(prefix) {
            const select = document.getElementById(`${prefix}-audience-type`);
            if (!select) return;
            
            const currentVal = select.value;
            if (window.currentUserRole === 'cr') {
                select.innerHTML = `
                    <option value="all_students">All Students</option>
                    <option value="course_students">Specific Course Students</option>
                `;
            } else {
                select.innerHTML = `
                    <option value="all_students">All Students</option>
                    <option value="all_crs">All CRs</option>
                    <option value="batch_students">Specific Batch Students</option>
                    <option value="batch_crs">Specific Batch CRs</option>
                    <option value="course_students">Specific Course Students</option>
                    <option value="specific_student">Specific Student</option>
                `;
            }
            if (Array.from(select.options).some(o => o.value === currentVal)) {
                select.value = currentVal;
            } else {
                select.value = 'all_students';
            }
        };

        window.toggleScheduleAudience = async function(prefix) {
            const aud = document.getElementById(`${prefix}-audience-type`).value;
            const tList = document.getElementById(`${prefix}-target-selection`);
            if(!tList) return;
            tList.innerHTML = '';
            
            if (['batch_students', 'batch_crs'].includes(aud)) {
                tList.classList.remove('hidden');
                
                // Fetch batches if not loaded
                let batches = window.adminDirectoryBatches || window.currentBatchesList || [];
                if (batches.length === 0) {
                    try {
                        tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4"><span class="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>Loading batches...</p>';
                        const { data, error } = await _supabase.from('batches').select('id, batch_name, active').eq('active', true).order('batch_name', { ascending: true });
                        if (!error && data) {
                            batches = data;
                            window.currentBatchesList = data;
                        }
                    } catch (e) {
                        console.warn('[SCHEDULE AUDIENCE] Failed to fetch batches:', e);
                    }
                }
                
                if (batches.length === 0) {
                    tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No batches available.</p>';
                    return;
                }
                
                tList.innerHTML = batches.map(b => `
                    <label class="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                        <input type="checkbox" value="${b.id}" class="${prefix}-target-cb w-4 h-4 accent-[#4226E9]"${aud === 'batch_crs' ? ` onchange="window.refreshScheduleCRList('${prefix}')"` : ''}>
                        <span class="text-[13px] text-slate-700 font-semibold">${window.sanitizeHTML(b.batch_name)}</span>
                    </label>
                `).join('');
                
                if (aud === 'batch_crs') {
                    tList.innerHTML += `<div id="${prefix}-cr-list-container" class="mt-3 border-t border-slate-100 pt-3"><p class="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Select batch(es) above to see CRs</p></div>`;
                }
            } else if (aud === 'course_students') {
                tList.classList.remove('hidden');
                if (allCoursesList.length === 0) {
                    tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4"><span class="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>Loading courses...</p>';
                    allCoursesList = await window.crPermissionService.getVisibleCourses();
                }
                const crs = allCoursesList;
                if (crs.length === 0) {
                    tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No courses available.</p>';
                    return;
                }
                tList.innerHTML = crs.map(c => {
                    const batchName = c.batches ? c.batches.batch_name : c.batch_id;
                    return `
                    <label class="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                        <input type="checkbox" value="${c.id}" class="${prefix}-target-cb w-4 h-4 accent-[#4226E9]">
                        <span class="text-[13px] text-slate-700 font-semibold">[Batch ${window.sanitizeHTML(batchName)}] ${window.sanitizeHTML(c.course_name)} (${c.short_name || ''})</span>
                    </label>
                `}).join('');
            } else if (aud === 'specific_student') {
                tList.classList.remove('hidden');
                let students = window.adminDirectoryProfiles || [];
                if (students.length === 0) {
                    try {
                        tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4"><span class="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>Loading students...</p>';
                        const { data, error } = await _supabase.from('profiles').select('id, full_name, email').order('full_name');
                        if (!error && data) students = data;
                    } catch (e) {
                        console.warn('[SCHEDULE AUDIENCE] Failed to fetch students:', e);
                    }
                }
                if (students.length === 0) {
                    tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No students available.</p>';
                    return;
                }
                tList.innerHTML = `
                    <div class="mb-2">
                        <input type="text" id="${prefix}-student-search" oninput="window.filterScheduleStudents('${prefix}')" placeholder="Search students..." class="w-full h-9 px-3 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-[#4226E9]">
                    </div>
                    <div id="${prefix}-student-list" class="space-y-1 max-h-[200px] overflow-y-auto">
                        ${students.map(s => `
                            <label class="${prefix}-student-item flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" data-name="${(s.full_name||'').toLowerCase()}">
                                <input type="checkbox" value="${s.id}" class="${prefix}-target-cb w-4 h-4 accent-[#4226E9]">
                                <div class="flex flex-col">
                                    <span class="text-[13px] text-slate-700 font-semibold">${window.sanitizeHTML(s.full_name)}</span>
                                    <span class="text-[10px] text-slate-400">${window.sanitizeHTML(s.email || '')}</span>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                `;
            } else {
                tList.classList.add('hidden');
            }
        };
        
        // Dynamic CR list refresh for schedule batch_crs
        window.refreshScheduleCRList = async function(prefix) {
            const container = document.getElementById(`${prefix}-cr-list-container`);
            if (!container) return;
            
            const selectedBatches = Array.from(document.querySelectorAll(`.${prefix}-target-cb:checked`)).map(cb => cb.value);
            if (selectedBatches.length === 0) {
                container.innerHTML = '<p class="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Select batch(es) above to see CRs</p>';
                return;
            }
            
            container.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-2"><span class="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>Loading CRs...</p>';
            
            try {
                const { data: crData, error } = await _supabase
                    .from('batch_crs')
                    .select('user_id, batch_id, profiles!batch_crs_user_id_fkey(id, full_name, email)')
                    .eq('active', true)
                    .in('batch_id', selectedBatches);
                
                if (error) throw error;
                
                const crs = (crData || []).filter(r => r.profiles);
                if (crs.length === 0) {
                    container.innerHTML = '<p class="text-[13px] text-slate-400 text-center py-2">No CRs assigned to selected batch(es).</p>';
                    return;
                }
                
                const batches = window.currentBatchesList || window.adminDirectoryBatches || [];
                container.innerHTML = '<p class="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">CRs in selected batches</p>' +
                    crs.map(cr => {
                        const batchName = batches.find(b => b.id === cr.batch_id)?.batch_name || cr.batch_id;
                        return `<div class="flex items-center gap-3 p-2 bg-indigo-50 rounded-lg mb-1">
                            <i data-lucide="shield" class="w-4 h-4 text-indigo-500"></i>
                            <div class="flex flex-col">
                                <span class="text-[13px] text-slate-700 font-semibold">${window.sanitizeHTML(cr.profiles.full_name)}</span>
                                <span class="text-[10px] text-slate-400">Batch ${window.sanitizeHTML(String(batchName))}</span>
                            </div>
                        </div>`;
                    }).join('');
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } catch (e) {
                console.error('[SCHEDULE AUDIENCE] Failed to load CRs:', e);
                container.innerHTML = '<p class="text-[13px] text-red-400 text-center py-2">Failed to load CRs.</p>';
            }
        };
        
        window.filterScheduleStudents = function(prefix) {
            const searchEl = document.getElementById(`${prefix}-student-search`);
            if(!searchEl) return;
            const q = searchEl.value.toLowerCase();
            document.querySelectorAll(`.${prefix}-student-item`).forEach(item => {
                if (item.dataset.name.includes(q)) item.classList.remove('hidden');
                else item.classList.add('hidden');
            });
        };

        window.onScheduleFileSelected = function (input) {
            const file = input.files[0];
            if (!file) return;

            console.log("Selected file:", file.name, "Type:", file.type, "Size:", file.size);

            if (file.size > 5 * 1024 * 1024) {
                console.error("Upload Error: File is larger than 5 MB");
                window.showGlobalToast('File Too Large', 'Max attachment size is 5 MB.');
                input.value = '';
                return;
            }

            const allowedExtensions = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
            const ext = file.name.split('.').pop().toLowerCase();
            if (!allowedExtensions.includes(ext)) {
                console.error("Upload Error: Invalid file type - " + file.type);
                window.showGlobalToast('Invalid File Type', 'Please upload a valid image, PDF, or document.');
                input.value = '';
                return;
            }

            currentScheduleFile = file;
            const filePreview = document.getElementById('cs-file-preview');
            const fileName = document.getElementById('cs-file-name');
            const fileSize = document.getElementById('cs-file-size');

            if (filePreview) filePreview.classList.remove('hidden');
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatFileSize(file.size);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        window.clearScheduleFile = function () {
            currentScheduleFile = null;
            const filePreview = document.getElementById('cs-file-preview');
            const fileInput = document.getElementById('cs-file-input');
            if (filePreview) filePreview.classList.add('hidden');
            if (fileInput) fileInput.value = '';
        };

        // ----- HANDLE CREATE SCHEDULE -----
        window.handleCreateSchedule = async function () {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') return;

            const title = document.getElementById('cs-title')?.value?.trim();
            const message = document.getElementById('cs-message')?.value?.trim();
            const date = document.getElementById('cs-date')?.value;
            const time = document.getElementById('cs-time')?.value;
            let isPinned = document.getElementById('cs-pin')?.checked || false;
            
            if (isPinned) {
                const pinnedSchedules = window.currentSchedulesList.filter(s => s.is_pinned).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                if (pinnedSchedules.length >= 3) {
                    const oldest = pinnedSchedules[0];
                    const { error: unpinErr } = await _supabase.from('schedules').update({ is_pinned: false }).eq('id', oldest.id);
                    if (!unpinErr) {
                        window.showGlobalToast("Schedule", "Maximum 3 pins allowed. The oldest pinned schedule was unpinned.");
                    }
                }
            }

            // Validation
            if (!title) { window.showGlobalToast('Validation', 'Title is required.'); return; }
            if (!message) { window.showGlobalToast('Validation', 'Message is required.'); return; }
            if (!date) { window.showGlobalToast('Validation', 'Date is required.'); return; }
            if (!time) { window.showGlobalToast('Validation', 'Time is required.'); return; }
            
            const audience_type = document.getElementById('cs-audience-type').value;
            const checkedCbs = Array.from(document.querySelectorAll('.cs-target-cb:checked')).map(cb => cb.value);
            const isTargetSpecific = ['batch_students', 'batch_crs', 'course_students', 'specific_student'].includes(audience_type);

            if (isTargetSpecific && checkedCbs.length === 0) {
                window.showGlobalToast('Validation', 'Select at least one target for the specific audience.');
                return;
            }

            const isCR = window.crPermissionService && window.crPermissionService.isCR();
            if (isCR) {
                if (audience_type === 'course_students') {
                    for (const cid of checkedCbs) {
                        const c = (allCoursesList || []).find(x => x.id === cid);
                        if (c && !window.crPermissionService.canAccessBatch(c.batch_id)) {
                            window.showGlobalToast('Validation', 'You can only target courses in your assigned batches.');
                            return;
                        }
                    }
                } else if (['batch_students', 'batch_crs'].includes(audience_type)) {
                    for (const bid of checkedCbs) {
                        if (!window.crPermissionService.canAccessBatch(bid)) {
                            window.showGlobalToast("Access Denied", "You can only target your assigned batches.");
                            return;
                        }
                    }
                }
            }

            window.showLoader(true, 'Creating schedule...');
            try {
                // Upload attachment if exists
                let attachmentUrl = null;
                if (currentScheduleFile) {
                    const ext = currentScheduleFile.name.split('.').pop();
                    const safeName = currentScheduleFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const fileName = `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safeName}`;
                    console.log("Starting upload to Supabase Storage: bucket 'schedule-files' for file:", fileName);

                    const { data: uploadData, error: uploadError } = await _supabase.storage
                        .from('schedule-files')
                        .upload(fileName, currentScheduleFile);

                    if (uploadError) {
                        console.error("Upload Error:", uploadError);
                        if (uploadError.message.includes('bucket')) {
                            throw new Error('Storage bucket missing or incorrect configuration.');
                        }
                        throw new Error(`Upload failed: ${uploadError.message}`);
                    }
                    console.log("Upload Success:", uploadData);

                    const { data: urlData } = _supabase.storage.from('schedule-files').getPublicUrl(fileName);
                    attachmentUrl = urlData.publicUrl;
                    console.log("Generated Public URL:", attachmentUrl);
                }

                // No CR specific override

                // Insert schedule row
                const payload = {
                    title,
                    message,
                    schedule_date: date,
                    schedule_time: time,
                    audience_type: audience_type,
                    is_pinned: isPinned,
                    attachment_url: attachmentUrl,
                    created_by: window.authState.user?.id || null
                };

                const { data: newSchedule, error: insertError } = await _supabase
                    .from('schedules')
                    .insert([payload])
                    .select()
                    .single();

                if (insertError) throw insertError;

                const alsoSendNotice = document.getElementById('cs-send-notice')?.checked;
                if (alsoSendNotice) {
                    const noticePayload = {
                        title: title,
                        message: message,
                        notice_type: 'general',
                        is_pinned: isPinned,
                        publish_now: true,
                        publish_date: new Date().toISOString(),
                        audience_type: audience_type,
                        notice_date: date,
                        notice_time: time,
                        attachment_url: attachmentUrl,
                        created_by: window.authState.user?.id || null
                    };
                    const { data: noticeData, error: noticeError } = await _supabase.from('notices').insert([noticePayload]).select();
                    
                    if (noticeError) {
                        console.error("[SCHEDULE] Detailed Notice auto-create error:", JSON.stringify(noticeError));
                        window.showGlobalToast("Partial Success", "Schedule created, but auto-notice failed: " + noticeError.message);
                    } else if (noticeData && noticeData.length > 0) {
                        console.log("[SCHEDULE] Automatically created linked notice:", noticeData[0].id);
                        

                    }
                }

                // Insert content_targets rows for Schedule FIRST to prevent race condition
                if (isTargetSpecific) {
                    let scRows = [];
                    if (checkedCbs.length > 0) {
                        scRows = checkedCbs.map(tid => ({
                            content_type: 'schedule',
                            content_id: newSchedule.id,
                            target_type: audience_type,
                            target_id: tid
                        }));
                    }
                    if (scRows.length > 0) {
                        const { error: scError } = await _supabase.from('content_targets').insert(scRows);
                        if (scError) console.warn('[CONTENT TARGETS INSERT WARN]', scError);
                    }
                } else {
                    let globalTargetId = null;
                    if (window.currentUserRole === 'cr' && window.currentUserCRBatches && window.currentUserCRBatches.length > 0) {
                        globalTargetId = window.currentUserCRBatches[0];
                    }
                    const scRows = [{
                        content_type: 'schedule',
                        content_id: newSchedule.id,
                        target_type: audience_type,
                        target_id: globalTargetId
                    }];
                    const { error: scError } = await _supabase.from('content_targets').insert(scRows);
                    if (scError) console.warn('[CONTENT TARGETS INSERT WARN]', scError);
                }

                // If notice was auto-created, link its targets before queuing its notification
                if (alsoSendNotice && typeof noticeData !== 'undefined' && noticeData.length > 0) {
                    // Auto-link targets for the notice
                    if (isTargetSpecific && checkedCbs.length > 0) {
                        const targetLinks = checkedCbs.map(tid => ({
                            content_type: 'notice',
                            content_id: noticeData[0].id,
                            target_type: audience_type,
                            target_id: tid
                        }));
                        const { error: ncError } = await _supabase.from('content_targets').insert(targetLinks);
                        if (ncError) console.error("[SCHEDULE] Notice targets link error:", ncError);
                    } else {
                        const targetLinks = [{
                            content_type: 'notice',
                            content_id: noticeData[0].id,
                            target_type: audience_type,
                            target_id: null
                        }];
                        await _supabase.from('content_targets').insert(targetLinks);
                    }

                    // Auto-queue notification for the notice ONLY after targets are inserted
                    const noticePayload = {
                        parent_type: 'notice',
                        parent_id: noticeData[0].id,
                        reminder_title: title,
                        reminder_message: message,
                        sent: false,
                        created_by: window.authState.user?.id || null,
                        reminder_time: new Date(Date.now() + 30000).toISOString()
                    };
                    console.log('[QUEUE INSERT PAYLOAD]', noticePayload);
                    const { error: notifError } = await _supabase.from('notification_reminders').insert([noticePayload]);
                    if (notifError) console.error("[SCHEDULE] Notice push queue error:", notifError);
                }

                // Task 3: Insert Reminders and Automatic Push Notification for Schedule AFTER targets are securely saved
                try {
                    const reminderRows = [];
                    // Automatically queue push notification immediately for schedule
                    reminderRows.push({
                        parent_type: 'schedule',
                        parent_id: newSchedule.id,
                        reminder_time: new Date(Date.now() + 30000).toISOString(),
                        sent: false,
                        reminder_title: title,
                        reminder_message: message,
                        created_by: window.authState.user?.id || null
                    });

                    const reminderDivs = document.querySelectorAll('#schedule-reminders-list .reminder-row');
                    if (reminderDivs.length > 0) {
                        console.log(`[REMINDERS] Found ${reminderDivs.length} schedule reminder rows to insert.`);
                        const eventDateTime = new Date(date + 'T' + time);
                        
                        reminderDivs.forEach(div => {
                            const offsetSelect = div.querySelector('.reminder-offset');
                            const offsetVal = offsetSelect.value;
                            let targetTime;
                            
                            if (offsetVal === 'custom') {
                                const customInput = div.querySelector('.reminder-custom-time');
                                if (customInput && customInput.value) {
                                    targetTime = new Date(customInput.value);
                                }
                            } else {
                                const offsetMinutes = parseInt(offsetVal, 10);
                                if (!isNaN(offsetMinutes)) {
                                    targetTime = new Date(eventDateTime.getTime() - offsetMinutes * 60 * 1000);
                                }
                            }
                            
                            if (targetTime && !isNaN(targetTime.getTime())) {
                                reminderRows.push({
                                    parent_type: 'schedule',
                                    parent_id: newSchedule.id,
                                    reminder_time: targetTime.toISOString(),
                                    sent: false,
                                    reminder_title: title,
                                    reminder_message: message,
                                    created_by: window.authState.user?.id || null
                                });
                            }
                        });
                    }
                    
                    if (reminderRows.length > 0) {
                        console.log("[REMINDERS] Inserting schedule reminder rows...", reminderRows);
                        console.log('[QUEUE INSERT PAYLOAD]', reminderRows);
                        const { error: reminderError } = await _supabase
                            .from('notification_reminders')
                            .insert(reminderRows);
                            
                        if (reminderError) {
                            console.error("[REMINDERS] Error inserting schedule reminders:", reminderError);
                            window.showGlobalToast("Warning", "Schedule saved, but reminders failed to schedule.");
                        } else {
                            console.log("[REMINDERS] Successfully scheduled reminders bulk insert completed.");
                        }
                    }
                } catch (remErr) {
                    console.error("[REMINDERS] Exception during schedule reminder calculation or insert:", remErr);
                    window.showGlobalToast("Warning", "Schedule saved, but reminders calculation failed.");
                }

                window.showGlobalToast('Published', 'Schedule created successfully!');
                window.navigate('screen-schedule-list');
                await loadScheduleList();

            } catch (err) {
                console.error('[CREATE SCHEDULE ERROR]', err);
                window.showGlobalToast('Error', err.message || 'Failed to create schedule.');
            } finally {
                window.showLoader(false);
            }
        };

        // ----- OPEN EDIT SCHEDULE -----
        window.openEditSchedule = async function () {
            if ((window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') || !selectedScheduleId) return;

            const s = schedulesList.find(x => x.id === selectedScheduleId);
            if (!s) { window.showGlobalToast('Error', 'Schedule data missing.'); return; }

            window.showLoader(true, 'Loading editor...');
            try {
                if (allCoursesList.length === 0) {
                allCoursesList = await window.crPermissionService.getVisibleCourses();
            }

                // Populate form
                const titleEl = document.getElementById('es-title');
                const msgEl = document.getElementById('es-message');
                const dateEl = document.getElementById('es-date');
                const timeEl = document.getElementById('es-time');
                const pinEl = document.getElementById('es-pin');

                if (titleEl) titleEl.value = s.title || '';
                if (msgEl) msgEl.value = s.message || '';
                if (dateEl) dateEl.value = s.schedule_date || '';
                if (timeEl) timeEl.value = s.schedule_time ? s.schedule_time.substring(0, 5) : '';
                if (pinEl) pinEl.checked = !!s.is_pinned;

                currentEditScheduleFile = null;
                currentEditRemoveAttachment = false;
                currentEditAudienceType = s.audience_type || 'all_students';

                // Current attachment
                const curAttach = document.getElementById('es-current-attachment');
                const curAttachName = document.getElementById('es-current-attachment-name');
                if (s.attachment_url) {
                    const parts = s.attachment_url.split('/');
                    const fname = parts[parts.length - 1] || 'attachment';
                    if (curAttach) curAttach.classList.remove('hidden');
                    if (curAttachName) curAttachName.textContent = fname;
                } else {
                    if (curAttach) curAttach.classList.add('hidden');
                }

                const esFilePreview = document.getElementById('es-file-preview');
                if (esFilePreview) esFilePreview.classList.add('hidden');

                // Load enrolled courses for audience selection
                currentEditSelectedCourses = scheduleCoursesMap[selectedScheduleId] || [];
                window.populateScheduleAudienceDropdown('es');
                document.getElementById('es-audience-type').value = currentEditAudienceType;
                await window.toggleScheduleAudience('es');
                // The checkboxes are rendered asynchronously, we'll check them below if they are courses
                if (currentEditAudienceType === 'course_students') {
                    const cbs = document.querySelectorAll('.es-target-cb');
                    cbs.forEach(cb => {
                        if (currentEditSelectedCourses.includes(cb.value)) cb.checked = true;
                    });
                }

                // Fetch and render existing reminders
                const editRemindersList = document.getElementById('edit-schedule-reminders-list');
                if (editRemindersList) editRemindersList.innerHTML = '';
                
                try {
                    const { data: reminders, error } = await _supabase
                        .from('notification_reminders')
                        .select('*')
                        .eq('parent_type', 'schedule')
                        .eq('parent_id', s.id);
                        
                    if (error) throw error;
                    if (reminders && reminders.length > 0 && editRemindersList) {
                        console.log(`[EDIT SCHEDULE] Loaded ${reminders.length} existing reminders.`);
                        
                        const eventDateTime = new Date((s.schedule_date || '') + 'T' + (s.schedule_time || ''));
                        
                        reminders.forEach(rem => {
                            const rowId = 'reminder-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                            
                            let offsetValue = 'custom';
                            let customDateVal = '';
                            
                            if (rem.reminder_time) {
                                const utcDate = new Date(rem.reminder_time);
                                const offset = utcDate.getTimezoneOffset() * 60000;
                                customDateVal = new Date(utcDate.getTime() - offset).toISOString().slice(0, 16);
                                
                                if (eventDateTime && !isNaN(eventDateTime.getTime())) {
                                    const diffMs = eventDateTime.getTime() - utcDate.getTime();
                                    const diffMins = Math.round(diffMs / (60 * 1000));
                                    if (diffMins === 1440 || diffMins === 180 || diffMins === 30) {
                                        offsetValue = String(diffMins);
                                    }
                                }
                            }
                            
                            const rowHTML = `
                                <div id="${rowId}" class="reminder-row flex flex-col gap-2 p-3 bg-slate-50 rounded-[12px] border border-slate-200 relative group">
                                    <div class="flex items-center gap-3">
                                        <div class="flex-1">
                                            <select onchange="toggleCustomReminderTime(this)" class="reminder-offset w-full h-[40px] px-3 bg-white text-slate-700 text-[13px] font-bold rounded-[8px] border border-slate-200 focus:border-[#4226E9] outline-none">
                                                <option value="1440" ${offsetValue === '1440' ? 'selected' : ''}>1 day before</option>
                                                <option value="180" ${offsetValue === '180' ? 'selected' : ''}>3 hours before</option>
                                                <option value="30" ${offsetValue === '30' ? 'selected' : ''}>30 minutes before</option>
                                                <option value="custom" ${offsetValue === 'custom' ? 'selected' : ''}>Custom Date/Time</option>
                                            </select>
                                        </div>
                                        <button type="button" onclick="removeReminderRow('${rowId}')" class="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                                        </button>
                                    </div>
                                    <div class="custom-time-container ${offsetValue === 'custom' ? '' : 'hidden'}">
                                        <label class="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Custom DateTime</label>
                                        <input type="datetime-local" value="${customDateVal}" class="reminder-custom-time w-full h-[40px] px-3 bg-white text-slate-700 text-[13px] font-bold rounded-[8px] border border-slate-200 focus:border-[#4226E9] outline-none mt-1">
                                    </div>
                                </div>
                            `;
                            editRemindersList.insertAdjacentHTML('beforeend', rowHTML);
                        });
                    }
                } catch (remErr) {
                    console.error("[EDIT SCHEDULE] Error loading existing reminders:", remErr);
                }

                window.navigate('screen-edit-schedule');

                if (typeof lucide !== 'undefined') lucide.createIcons();
            } catch (err) {
                console.error('[OPEN EDIT ERROR]', err);
                window.showGlobalToast('Error', 'Failed to open editor.');
            } finally {
                window.showLoader(false);
            }
        };



        window.onEditScheduleFileSelected = function (input) {
            const file = input.files[0];
            if (!file) return;

            console.log("Selected file (Edit):", file.name, "Type:", file.type, "Size:", file.size);

            if (file.size > 5 * 1024 * 1024) {
                console.error("Upload Error: File is larger than 5 MB");
                window.showGlobalToast('File Too Large', 'Max attachment size is 5 MB.');
                input.value = '';
                return;
            }

            const allowedExtensions = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
            const ext = file.name.split('.').pop().toLowerCase();
            if (!allowedExtensions.includes(ext)) {
                console.error("Upload Error: Invalid file type - " + file.type);
                window.showGlobalToast('Invalid File Type', 'Please upload a valid image, PDF, or document.');
                input.value = '';
                return;
            }

            currentEditScheduleFile = file;
            const filePreview = document.getElementById('es-file-preview');
            const fileName = document.getElementById('es-file-name');
            const fileSize = document.getElementById('es-file-size');

            if (filePreview) filePreview.classList.remove('hidden');
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatFileSize(file.size);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        window.clearEditScheduleFile = function () {
            currentEditScheduleFile = null;
            const filePreview = document.getElementById('es-file-preview');
            const fileInput = document.getElementById('es-file-input');
            if (filePreview) filePreview.classList.add('hidden');
            if (fileInput) fileInput.value = '';
        };

        window.clearEditAttachment = function () {
            currentEditRemoveAttachment = true;
            const curAttach = document.getElementById('es-current-attachment');
            if (curAttach) curAttach.classList.add('hidden');
        };

        // ----- HANDLE UPDATE SCHEDULE -----
        window.handleUpdateSchedule = async function () {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if ((window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') || !selectedScheduleId) return;

            const title = document.getElementById('es-title')?.value?.trim();
            const message = document.getElementById('es-message')?.value?.trim();
            const date = document.getElementById('es-date')?.value;
            const time = document.getElementById('es-time')?.value;
            let isPinned = document.getElementById('es-pin')?.checked || false;
            
            if (isPinned) {
                const pinnedSchedules = window.currentSchedulesList.filter(s => s.is_pinned && s.id !== currentEditScheduleId).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                if (pinnedSchedules.length >= 3) {
                    const oldest = pinnedSchedules[0];
                    const { error: unpinErr } = await _supabase.from('schedules').update({ is_pinned: false }).eq('id', oldest.id);
                    if (!unpinErr) {
                        window.showGlobalToast("Schedule", "Maximum 3 pins allowed. The oldest pinned schedule was unpinned.");
                    }
                }
            }

            if (!title) { window.showGlobalToast('Validation', 'Title is required.'); return; }
            if (!message) { window.showGlobalToast('Validation', 'Message is required.'); return; }
            if (!date) { window.showGlobalToast('Validation', 'Date is required.'); return; }
            if (!time) { window.showGlobalToast('Validation', 'Time is required.'); return; }
            const audience_type = document.getElementById('es-audience-type').value;
            const checkedCbs = Array.from(document.querySelectorAll('.es-target-cb:checked')).map(cb => cb.value);
            const isTargetSpecific = ['batch_students', 'batch_crs', 'course_students', 'specific_student'].includes(audience_type);

            if (isTargetSpecific && checkedCbs.length === 0) {
                window.showGlobalToast('Validation', 'Select at least one target for the specific audience.');
                return;
            }

            const isCR = window.crPermissionService && window.crPermissionService.isCR();
            if (isCR) {
                const originalSchedule = schedulesList.find(s => s.id === selectedScheduleId);
                if (originalSchedule && originalSchedule.created_by !== window.authState.user.id) {
                    console.log(`[CR PERMISSION DENIED] Attempted to update schedule not created by them: ${selectedScheduleId}`);
                    window.showGlobalToast("Access Denied", "You can only edit schedules that you created.");
                    return;
                }
                
                if (audience_type === 'course_students') {
                    for (const cid of checkedCbs) {
                        const c = (allCoursesList || []).find(x => x.id === cid);
                        if (c && !window.crPermissionService.canAccessBatch(c.batch_id)) {
                            console.log(`[CR PERMISSION DENIED] Attempted to post schedule for unassigned course ${cid}`);
                            window.showGlobalToast("Access Denied", "You can only post schedules to courses in your assigned batches.");
                            return;
                        }
                    }
                } else if (['batch_students', 'batch_crs'].includes(audience_type)) {
                    for (const bid of checkedCbs) {
                        if (!window.crPermissionService.canAccessBatch(bid)) {
                            console.log(`[CR PERMISSION DENIED] Attempted to post schedule for unassigned batch ${bid}`);
                            window.showGlobalToast("Access Denied", "You can only target your assigned batches.");
                            return;
                        }
                    }
                }
                console.log(`[CR ACCESS CHECK] Validating schedule update - PASSED`);
                console.log(`[CR UPDATE] Schedule ${selectedScheduleId}`);
            }

            window.showLoader(true, 'Updating schedule...');
            try {
                const s = schedulesList.find(x => x.id === selectedScheduleId);
                let attachmentUrl = s ? s.attachment_url : null;

                // Remove old attachment if flagged
                if (currentEditRemoveAttachment && attachmentUrl) {
                    try {
                        const urlParts = attachmentUrl.split('/schedule-files/');
                        if (urlParts.length > 1) {
                            const storagePath = urlParts[1].split('?')[0];
                            await _supabase.storage.from('schedule-files').remove([storagePath]);
                        } else {
                            const oldUrlParts = attachmentUrl.split('/schedules/');
                            if (oldUrlParts.length > 1) {
                                const storagePath = oldUrlParts[1].split('?')[0];
                                await _supabase.storage.from('schedules').remove([storagePath]);
                            }
                        }
                    } catch (e) { console.warn('[STORAGE DELETE WARN]', e); }
                    attachmentUrl = null;
                }

                // Upload new file if selected
                if (currentEditScheduleFile) {
                    const ext = currentEditScheduleFile.name.split('.').pop();
                    const safeName = currentEditScheduleFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const fileName = `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safeName}`;
                    console.log("Starting upload to Supabase Storage: bucket 'schedule-files' for file:", fileName);

                    const { data: uploadData, error: uploadError } = await _supabase.storage
                        .from('schedule-files')
                        .upload(fileName, currentEditScheduleFile);

                    if (uploadError) {
                        console.error("Upload Error:", uploadError);
                        if (uploadError.message.includes('bucket')) {
                            throw new Error('Storage bucket missing or incorrect configuration.');
                        }
                        throw new Error(`Upload failed: ${uploadError.message}`);
                    }
                    console.log("Upload Success:", uploadData);

                    const { data: urlData } = _supabase.storage.from('schedule-files').getPublicUrl(fileName);
                    attachmentUrl = urlData.publicUrl;
                    console.log("Generated Public URL:", attachmentUrl);
                }

                // No CR specific override

                // Update schedule row
                const payload = {
                    title,
                    message,
                    schedule_date: date,
                    schedule_time: time,
                    audience_type: audience_type,
                    is_pinned: isPinned,
                    attachment_url: attachmentUrl
                };

                const { error: updateError } = await _supabase
                    .from('schedules')
                    .update(payload)
                    .eq('id', selectedScheduleId);

                if (updateError) throw updateError;

                // Task 3: Update Reminders
                try {
                    console.log("[SCHEDULE UPDATE] Cleaning up old reminders...");
                    await _supabase.from('notification_reminders').delete().eq('parent_id', selectedScheduleId).eq('parent_type', 'schedule');
                    
                    const reminderRows = [];
                    const reminderDivs = document.querySelectorAll('#edit-schedule-reminders-list .reminder-row');
                    
                    if (reminderDivs.length > 0) {
                        console.log(`[SCHEDULE UPDATE] Found ${reminderDivs.length} schedule reminder rows to insert.`);
                        
                        const eventDateTime = new Date(date + 'T' + time);
                        
                        reminderDivs.forEach(div => {
                            const offsetSelect = div.querySelector('.reminder-offset');
                            const offsetVal = offsetSelect.value;
                            let targetTime;
                            
                            if (offsetVal === 'custom') {
                                const customInput = div.querySelector('.reminder-custom-time');
                                if (customInput && customInput.value) {
                                    targetTime = new Date(customInput.value);
                                }
                            } else {
                                const offsetMinutes = parseInt(offsetVal, 10);
                                if (!isNaN(offsetMinutes)) {
                                    targetTime = new Date(eventDateTime.getTime() - offsetMinutes * 60 * 1000);
                                }
                            }
                            
                            if (targetTime && !isNaN(targetTime.getTime())) {
                                reminderRows.push({
                                    parent_type: 'schedule',
                                    parent_id: selectedScheduleId,
                                    reminder_time: targetTime.toISOString(),
                                    sent: false,
                                    reminder_title: title,
                                    reminder_message: message,
                                    created_by: window.authState.user?.id || null
                                });
                            }
                        });
                        
                        if (reminderRows.length > 0) {
                            console.log("[SCHEDULE UPDATE] Inserting schedule reminder rows...", reminderRows);
                            const { error: reminderError } = await _supabase
                                .from('notification_reminders')
                                .insert(reminderRows);
                                
                            if (reminderError) {
                                console.error("[SCHEDULE UPDATE] Error inserting schedule reminders:", reminderError);
                                window.showGlobalToast("Warning", "Schedule updated, but reminders failed to save.");
                            } else {
                                console.log("[SCHEDULE UPDATE] Successfully scheduled schedule reminders bulk insert completed.");
                            }
                        }
                    }
                } catch (remErr) {
                    console.error("[SCHEDULE UPDATE] Exception during schedule reminder update:", remErr);
                    window.showGlobalToast("Warning", "Schedule updated, but reminders update failed.");
                }

                // Update content_targets: delete old, insert new
                await _supabase.from('content_targets').delete().eq('content_type', 'schedule').eq('content_id', selectedScheduleId);

                if (isTargetSpecific) {
                    let scRows = [];
                    if (checkedCbs.length > 0) {
                        scRows = checkedCbs.map(tid => ({
                            content_type: 'schedule',
                            content_id: selectedScheduleId,
                            target_type: audience_type,
                            target_id: tid
                        }));
                    }
                    if (scRows.length > 0) {
                        const { error: scError } = await _supabase.from('content_targets').insert(scRows);
                        if (scError) console.warn('[CONTENT TARGETS UPDATE WARN]', scError);
                    }
                } else {
                    const scRows = [{
                        content_type: 'schedule',
                        content_id: selectedScheduleId,
                        target_type: audience_type,
                        target_id: null
                    }];
                    const { error: scError } = await _supabase.from('content_targets').insert(scRows);
                    if (scError) console.warn('[CONTENT TARGETS UPDATE WARN]', scError);
                }

                window.showGlobalToast('Updated', 'Schedule updated successfully!');
                await loadScheduleList();
                // Refresh details view
                const updated = schedulesList.find(x => x.id === selectedScheduleId);
                if (updated) {
                    // Rebuild scheduleCoursesMap for this schedule
                    if (currentEditAudienceType === 'specific') {
                        scheduleCoursesMap[selectedScheduleId] = [...currentEditSelectedCourses];
                    } else {
                        delete scheduleCoursesMap[selectedScheduleId];
                    }
                    await openScheduleDetails(selectedScheduleId);
                } else {
                    window.navigate('screen-schedule-list');
                }

            } catch (err) {
                console.error('[UPDATE SCHEDULE ERROR]', err);
                window.showGlobalToast('Error', err.message || 'Failed to update schedule.');
            } finally {
                window.showLoader(false);
            }
        };

        // ----- HANDLE DELETE SCHEDULE -----
        window.handleDeleteSchedule = async function () {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if ((window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') || !selectedScheduleId) return;

            const isCR = window.crPermissionService && window.crPermissionService.isCR();
            if (isCR) {
                const originalSchedule = schedulesList.find(s => s.id === selectedScheduleId);
                if (originalSchedule && originalSchedule.created_by !== window.authState.user.id) {
                    console.log(`[CR PERMISSION DENIED] Attempted to delete schedule not created by them: ${selectedScheduleId}`);
                    window.showGlobalToast("Access Denied", "You can only delete schedules that you created.");
                    return;
                }
                console.log(`[CR ACCESS CHECK] Validating schedule delete - PASSED`);
                console.log(`[CR DELETE] Schedule ${selectedScheduleId}`);
            }

            if (!confirm('Delete this schedule? This cannot be undone.')) return;

            window.showLoader(true, 'Deleting schedule...');
            try {
                const s = schedulesList.find(x => x.id === selectedScheduleId);

                // Delete attachment from storage if exists
                if (s && s.attachment_url) {
                    try {
                        const urlParts = s.attachment_url.split('/schedule-files/');
                        if (urlParts.length > 1) {
                            const storagePath = urlParts[1].split('?')[0];
                            await _supabase.storage.from('schedule-files').remove([storagePath]);
                        }
                    } catch (e) { console.warn('[STORAGE DELETE WARN]', e); }
                }

                // Delete content_targets rows first
                await _supabase.from('content_targets').delete().eq('content_type', 'schedule').eq('content_id', selectedScheduleId);

                // Task 2: Delete reminders from notification_reminders
                try {
                    console.log("[SCHEDULE DELETE] Deleting matching reminders...");
                    const { error: remError } = await _supabase.from('notification_reminders').delete().eq('parent_id', selectedScheduleId);
                    if (remError) {
                        console.error("[SCHEDULE DELETE] Error deleting reminders:", remError);
                    } else {
                        console.log("[SCHEDULE DELETE] Reminders deleted successfully.");
                    }
                } catch (remErr) {
                    console.error("[SCHEDULE DELETE] Exception during reminders delete:", remErr);
                }

                // Step 2.1: Delete schedule_courses relations
                console.log("[SCHEDULE DELETE] Deleting schedule_courses relations...");
                const { error: scError } = await _supabase.from('schedule_courses').delete().eq('schedule_id', selectedScheduleId);
                if (scError) {
                    console.error("[SCHEDULE DELETE] schedule_courses delete error:", scError);
                    throw scError;
                }

                // Step 2.2: Delete content_reactions
                console.log("[SCHEDULE DELETE] Deleting content_reactions relations...");
                try {
                    await _supabase.from('content_reactions').delete().eq('content_type', 'schedule').eq('content_id', selectedScheduleId);
                } catch (e) { console.warn("[SCHEDULE DELETE] Reactions cleanup error:", e); }

                // Delete the schedule row
                const { error } = await _supabase.from('schedules').delete().eq('id', selectedScheduleId);
                if (error) throw error;

                window.showGlobalToast('Deleted', 'Schedule deleted successfully.');
                selectedScheduleId = null;
                window.navigate('screen-schedule-list');
                await loadScheduleList();

            } catch (err) {
                console.error('[DELETE SCHEDULE ERROR]', err);
                window.showGlobalToast('Error', err.message || 'Failed to delete schedule.');
            } finally {
                window.showLoader(false);
            }
        };

        // Expose schedule functions globally
        window.openScheduleDetails = window.openScheduleDetails;
        window.openCreateSchedule = window.openCreateSchedule;
        window.openEditSchedule = window.openEditSchedule;
        window.handleCreateSchedule = window.handleCreateSchedule;
        window.handleUpdateSchedule = window.handleUpdateSchedule;
        window.handleDeleteSchedule = window.handleDeleteSchedule;
        window.filterSchedulesUI = window.filterSchedulesUI;

        window.onCourseCheckboxChange = window.onCourseCheckboxChange;
        window.onScheduleFileSelected = window.onScheduleFileSelected;
        window.clearScheduleFile = window.clearScheduleFile;
        window.onEditScheduleFileSelected = window.onEditScheduleFileSelected;
        window.clearEditScheduleFile = window.clearEditScheduleFile;
        window.clearEditAttachment = window.clearEditAttachment;
        window.renderScheduleList = renderScheduleList;



export const ScheduleService = {
    loadScheduleList: typeof loadScheduleList !== 'undefined' ? loadScheduleList : window.loadScheduleList,
    currentSchedulesList: typeof window.currentSchedulesList !== 'undefined' ? window.currentSchedulesList : window.currentSchedulesList,
    filterSchedulesUI: typeof filterSchedulesUI !== 'undefined' ? filterSchedulesUI : window.filterSchedulesUI,
    openScheduleDetails: typeof openScheduleDetails !== 'undefined' ? openScheduleDetails : window.openScheduleDetails,
    openCreateSchedule: typeof openCreateSchedule !== 'undefined' ? openCreateSchedule : window.openCreateSchedule,
    onCourseCheckboxChange: typeof onCourseCheckboxChange !== 'undefined' ? onCourseCheckboxChange : window.onCourseCheckboxChange,
    selectAudienceType: typeof selectAudienceType !== 'undefined' ? selectAudienceType : window.selectAudienceType,
    onScheduleFileSelected: typeof onScheduleFileSelected !== 'undefined' ? onScheduleFileSelected : window.onScheduleFileSelected,
    clearScheduleFile: typeof clearScheduleFile !== 'undefined' ? clearScheduleFile : window.clearScheduleFile,
    handleCreateSchedule: typeof handleCreateSchedule !== 'undefined' ? handleCreateSchedule : window.handleCreateSchedule,
    openEditSchedule: typeof openEditSchedule !== 'undefined' ? openEditSchedule : window.openEditSchedule,
    toggleScheduleAudience: typeof window.toggleScheduleAudience !== 'undefined' ? window.toggleScheduleAudience : function(){},
    onEditScheduleFileSelected: typeof onEditScheduleFileSelected !== 'undefined' ? onEditScheduleFileSelected : window.onEditScheduleFileSelected,
    clearEditScheduleFile: typeof clearEditScheduleFile !== 'undefined' ? clearEditScheduleFile : window.clearEditScheduleFile,
    clearEditAttachment: typeof clearEditAttachment !== 'undefined' ? clearEditAttachment : window.clearEditAttachment,
    handleUpdateSchedule: typeof handleUpdateSchedule !== 'undefined' ? handleUpdateSchedule : window.handleUpdateSchedule,
    handleDeleteSchedule: typeof handleDeleteSchedule !== 'undefined' ? handleDeleteSchedule : window.handleDeleteSchedule
};
console.log("[ARCHITECTURE]\nschedules loaded");
