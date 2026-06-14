import { _supabase } from './supabase-client.js';
import { crPermissionService } from './services/crPermissionService.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest, fetchWithRetry } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // ----------------- NOTICES SYSTEM -----------------
        let currentNoticesList = [];
        let currentNoticeFile = null;
        let selectedNoticeIdForDetails = null;
        let allCoursesList = [];
        let currentNoticeFilter = 'all';

        export async function loadNotices() {
            if (window.isModuleLoading('notices')) return;
            window.setModuleLoading('notices', true);
            cancelActiveRequest('notices');
            const localController = new AbortController();
            window.activeLoadControllers['notices'] = localController;

            window.showLoader(true, "Loading notices...");
            console.log("[NOTICES] Loading notices list...");
            try {
                if (allCoursesList.length === 0) {
                    allCoursesList = await CourseStore.getCourses();
                }
                
                let noticesData;
                if (crPermissionService.isCR()) {
                    noticesData = await crPermissionService.getVisibleNotices();
                } else {
                    noticesData = await fetchWithRetry(async (signal) => {
                        const { data, error } = await _supabase
                            .from('notices')
                            .select(`
                                    *,
                                    notice_courses ( course_id ),
                                    profiles (id, full_name, profile_url, role)
                                `)
                            .order('is_pinned', { ascending: false })
                            .order('created_at', { ascending: false })
                            .abortSignal(signal);

                        if (error) {
                            console.error("[NOTICES] Query error:", error);
                            throw error;
                        }
                        return data;
                    }, 3, 1000, 10000, localController.signal);
                }

                // Fetch content_targets separately (no FK relationship)
                if (noticesData && noticesData.length > 0) {
                    try {
                        const noticeIds = noticesData.map(n => n.id);
                        const { data: ctData } = await _supabase
                            .from('content_targets')
                            .select('content_id, target_type, target_id')
                            .eq('content_type', 'notice')
                            .in('content_id', noticeIds);
                        
                        if (ctData && ctData.length > 0) {
                            const ctMap = {};
                            ctData.forEach(ct => {
                                if (!ctMap[ct.content_id]) ctMap[ct.content_id] = [];
                                ctMap[ct.content_id].push(ct);
                            });
                            noticesData.forEach(n => {
                                n.content_targets = ctMap[n.id] || [];
                                // Bridge content_targets to notice_courses for legacy compatibility
                                if (!n.notice_courses || n.notice_courses.length === 0) {
                                    n.notice_courses = n.content_targets
                                        .filter(ct => ct.target_type === 'course_students' || ct.target_type === 'specific')
                                        .map(ct => ({ course_id: ct.target_id }));
                                }
                            });
                        } else {
                            noticesData.forEach(n => {
                                n.content_targets = [];
                                if (!n.notice_courses) n.notice_courses = [];
                            });
                        }
                        console.log('[TARGET LOAD] Loaded content_targets for notices');
                    } catch (ctErr) {
                        console.warn('[TARGET LOAD] Failed to load content_targets, using empty:', ctErr);
                        noticesData.forEach(n => {
                            n.content_targets = [];
                            if (!n.notice_courses) n.notice_courses = [];
                        });
                    }
                }

                if (localController.signal.aborted) {
                    console.log("[NOTICES] Fetch aborted, ignoring rendering.");
                    return;
                }

                console.log(`[AUTH] Authenticated User: ${window.currentUserEmail}`);
                console.log(`[AUTH] Detected Role: ${window.currentUserRole}`);

                const btnCreateNotice = document.getElementById('btn-admin-create-notice');
                const batchFilter = document.getElementById('admin-notices-batch-filter');
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                if (isAdmin) {
                    console.log("[AUTH] Admin permission state: GRANTED. Showing admin controls.");
                    let allNotices = noticesData || [];
                    
                    window.currentNoticesList = allNotices;
                    if (btnCreateNotice) btnCreateNotice.classList.remove('hidden');
                    
                    // Populate and show batch filter
                    if (batchFilter) {
                        const isStrictAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
                        if (isStrictAdmin) {
                            batchFilter.classList.remove('hidden');
                            
                            console.log("[BATCH FILTER LOAD] Populating notices batch filter");
                            if (batchFilter.options.length <= 1) {
                                try {
                                    const { data: batchesData } = await _supabase.from('batches').select('id, batch_name').order('batch_name');
                                    let optionsHTML = '<option value="" disabled selected class="text-black">Select Batch</option>';
                                    if (batchesData) {
                                        optionsHTML += batchesData.map(b => `<option value="${b.id}" class="text-black">${b.batch_name}</option>`).join('');
                                    }
                                    batchFilter.innerHTML = optionsHTML;
                                } catch(e) { console.warn("Failed to load batches", e); }
                            }
                        } else {
                            batchFilter.classList.add('hidden');
                        }
                    }
                } else {
                    console.log("[AUTH] Admin permission state: DENIED. Filtering for student.");
                    if (btnCreateNotice) btnCreateNotice.classList.add('hidden');
                    if (batchFilter) batchFilter.classList.add('hidden');

                    const studentCourses = window.currentUserCoursesList.map(uc => uc.course_id);
                    const courseEnrolledBatches = [...new Set(studentCourses.map(cid => {
                        const c = (allCoursesList || []).find(x => x.id === cid);
                        return c ? c.batch_id : null;
                    }).filter(Boolean))];

                    const profileBatchId = window.authState?.profile?.batch_id;
                    const secondaryBatches = window.authState?.profile?.secondary_batches || [];
                    const ownedBatches = [profileBatchId, ...secondaryBatches].filter(Boolean);

                    // --- SEND TO SERVICE WORKER VIA CACHE ---
                    if ('caches' in window) {
                        caches.open('mct-profile-rules').then(cache => {
                            cache.put('/rules.json', new Response(JSON.stringify({
                                profileBatchId,
                                ownedBatches,
                                courseEnrolledBatches,
                                studentCourses,
                                userId: window.authState?.user?.id
                            })));
                        }).catch(e => console.warn('[CACHE] Failed to save profile rules:', e));
                    }

                    window.currentNoticesList = (noticesData || []).filter(n => {
                        let evaluationResult = false;
                        let target_type = null;
                        let target_id = null;

                        // Global Targets & All Students
                        if (n.audience_type === 'all') {
                            evaluationResult = true;
                            target_type = 'all';
                        } else if (n.audience_type === 'all_students') {
                            if (n.content_targets && n.content_targets.length > 0) {
                                evaluationResult = n.content_targets.some(ct => {
                                    if (ct.target_type === 'all_students') {
                                        target_type = ct.target_type;
                                        target_id = ct.target_id;
                                        if (!ct.target_id) return true; // Global admin notice
                                        return ownedBatches.includes(ct.target_id) || courseEnrolledBatches.includes(ct.target_id);
                                    }
                                    return false;
                                });
                            } else {
                                evaluationResult = true;
                            }
                        } else if (n.notice_courses && n.notice_courses.length > 0) {
                            evaluationResult = n.notice_courses.some(nc => studentCourses.includes(nc.course_id));
                        } else if (n.content_targets && n.content_targets.length > 0) {
                            evaluationResult = n.content_targets.some(ct => {
                                target_type = ct.target_type;
                                target_id = ct.target_id;
                                if (ct.target_type === 'course_students') {
                                    return studentCourses.includes(ct.target_id);
                                }
                                if (ct.target_type === 'batch_students') {
                                    // STRICT BATCH OWNERSHIP ONLY
                                    return ownedBatches.includes(ct.target_id);
                                }
                                if (ct.target_type === 'specific_student') {
                                    return ct.target_id === window.authState.user.id;
                                }
                                return false;
                            });
                        }
                        
                        console.log('[SECURITY TRACE]', { 
                            noticeId: n.id,
                            title: n.title,
                            studentMainBatch: profileBatchId, 
                            targetType: target_type || n.audience_type, 
                            targetId: target_id, 
                            accessGranted: evaluationResult 
                        });
                        
                        return evaluationResult;
                    });
                }

                console.log(`[NOTICES] Successfully loaded ${window.currentNoticesList.length} notices.`);
                const noticeIds = window.currentNoticesList.map(n => n.id);
                if (window.ReactionService) await window.ReactionService.fetchReactionsForContent('notice', noticeIds);

                injectDashboardNotices();
                renderNoticesList();
                if (typeof window.updateDashboardQuickAccessBadges === 'function') window.updateDashboardQuickAccessBadges();
                if (typeof window.fetchNotificationCenterNotices === 'function') window.fetchNotificationCenterNotices();
            } catch (err) {
                if (err.name === 'AbortError' || (err.message && err.message.includes('AbortError'))) {
                    console.log("[NOTICES] Load aborted, ignoring.");
                    return;
                }
                console.error("Error loading notices:", err);
                window.showGlobalToast("Error", "Could not load notices.");
            } finally {
                if (window.activeLoadControllers['notices'] === localController) {
                    window.activeLoadControllers['notices'] = null;
                    window.showLoader(false);
                }
                window.setModuleLoading('notices', false);
            }
        }

        function setNoticeFilter(type) {
            currentNoticeFilter = type;
            document.querySelectorAll('.notice-filter-btn').forEach(btn => {
                btn.className = "notice-filter-btn px-4 py-1.5 bg-white/10 text-slate-300 border border-white/10 text-[11px] font-bold rounded-full whitespace-nowrap transition-colors";
                if (btn.dataset.filter === type) {
                    btn.className = "notice-filter-btn active px-4 py-1.5 bg-indigo-600 text-white border border-transparent text-[11px] font-bold rounded-full whitespace-nowrap transition-colors";
                }
            });
            window.filterNotices();
        }

        window.filterNotices = function () {
            const batchFilterEl = document.getElementById('admin-notices-batch-filter');
            if (batchFilterEl && !batchFilterEl.classList.contains('hidden')) {
                const batchVal = batchFilterEl.value;
                if (!batchVal || batchVal === '') {
                    console.log("[BATCH FILTER SELECT] Notice batch changed to: undefined");
                    console.log("[NOTICE BATCH] No batch selected. Showing empty state.");
                    const list = document.getElementById('notices-list-container');
                    if (list) {
                        list.innerHTML = `
                            <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <i data-lucide="layers" class="w-8 h-8 text-slate-400"></i>
                                </div>
                                <h3 class="text-lg font-bold text-slate-700">Please select a batch</h3>
                                <p class="text-sm text-slate-500 mt-1 max-w-[250px]">Select a batch from the dropdown above to view its notices.</p>
                            </div>
                        `;
                        if (window.lucide) window.lucide.createIcons();
                    }
                    return; // DO NOT RENDER
                }
                console.log(`[BATCH FILTER SELECT] Notice batch changed to: ${batchVal}`);
                console.log(`[NOTICE BATCH] Rendering notices for batch: ${batchVal}`);
            }
            renderNoticesList();
        }

        function renderNoticesList() {
            const container = document.getElementById('notices-list-container');
            if (!container) return;

            const q = document.getElementById('notices-search')?.value.toLowerCase() || '';

            let filtered = window.currentNoticesList.filter(n => {
                if (n.notice_type === 'poll') return false; // Exclude polls from the general Notices list
                const matchQuery = n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
                const matchType = currentNoticeFilter === 'all' || n.notice_type === currentNoticeFilter;
                
                let matchBatch = true;
                const batchFilterEl = document.getElementById('admin-notices-batch-filter');
                if (batchFilterEl && !batchFilterEl.classList.contains('hidden') && batchFilterEl.value !== 'all') {
                    const batchVal = batchFilterEl.value;
                    let matchesBatch = false;
                    if (n.audience_type === 'all' || n.audience_type === 'all_students') {
                        matchesBatch = true;
                    } else {
                        if (n.notice_courses && n.notice_courses.length > 0) {
                            matchesBatch = n.notice_courses.some(nc => {
                                const c = (window.allCoursesList || []).find(x => x.id === nc.course_id);
                                return c && c.batch_id === batchVal;
                            });
                        }
                        if (!matchesBatch && n.content_targets && n.content_targets.length > 0) {
                            matchesBatch = n.content_targets.some(ct => {
                                if (['batch_students', 'batch_crs'].includes(ct.target_type)) return ct.target_id === batchVal;
                                if (ct.target_type === 'course_students') {
                                    const c = (window.allCoursesList || []).find(x => x.id === ct.target_id);
                                    return c && c.batch_id === batchVal;
                                }
                                return false;
                            });
                        }
                    }
                    matchBatch = matchesBatch;
                }

                return matchQuery && matchType && matchBatch;
            });

            // Dynamic Time-Aware Sorting
            const now = new Date();
            const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            filtered.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

                const dateA = new Date((a.notice_date || toDateStr(now)) + 'T' + (a.notice_time || '23:59:00'));
                const dateB = new Date((b.notice_date || toDateStr(now)) + 'T' + (b.notice_time || '23:59:00'));
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

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <i data-lucide="bell-off" class="w-8 h-8 text-slate-300"></i>
                        </div>
                        <p class="text-[14px] font-bold text-slate-500">No notices found.</p>
                    </div>
                `;
            } else {
                const todayD = new Date();
                const tomorrowD = new Date(todayD);
                tomorrowD.setDate(todayD.getDate() + 1);
                const todayStr = toDateStr(todayD);
                const tomorrowStr = toDateStr(tomorrowD);

                container.innerHTML = filtered.map(n => {
                    const isUrgent = n.notice_type === 'urgent';
                    let badgeHtml = isUrgent 
                        ? `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-red-100 text-red-600 uppercase">URGENT</span>`
                        : `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-indigo-100 text-[#4226E9] uppercase">GENERAL</span>`;

                    let courseTagsHtml = '';
                    const aud = n.audience_type;
                    if ((aud === 'course_students' || aud === 'specific') && n.notice_courses && n.notice_courses.length > 0) {
                        courseTagsHtml = n.notice_courses.map(nc => {
                            const c = (allCoursesList || []).find(x => x.id === nc.course_id);
                            const name = c ? (c.short_name || c.course_name) : 'Course';
                            return `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ${window.sanitizeHTML(name)}</span>`;
                        }).join('');
                    } else if (aud === 'all_students' || !aud || aud === 'general') {
                        badgeHtml += `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-indigo-50 border border-indigo-100 text-[#4226E9] uppercase ml-1">ALL STUDENTS</span>`;
                    } else if (aud === 'all_crs') {
                        badgeHtml += `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-purple-50 border border-purple-100 text-purple-600 uppercase ml-1">ALL CRs</span>`;
                    } else if (aud === 'batch_students' || aud === 'batch_crs') {
                        badgeHtml += `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-emerald-50 border border-emerald-100 text-emerald-600 uppercase ml-1">Specific Batch</span>`;
                    } else if (aud === 'specific_student') {
                         badgeHtml += `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-yellow-50 border border-yellow-100 text-yellow-600 uppercase ml-1">Specific</span>`;
                    }

                    const pin = n.is_pinned ? `<i data-lucide="pin" class="w-4.5 h-4.5 text-orange-500 fill-orange-500"></i>` : '';

                    let dateStr = '';
                    let dateTagHtml = '';
                    let timeTagHtml = '';
                    if (n.notice_date) {
                        const d = new Date(n.notice_date + 'T00:00:00');
                        dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        dateTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ${dateStr}</span>`;
                    }
                    if (n.notice_time) {
                        const [h, m] = n.notice_time.split(':');
                        const ampm = +h >= 12 ? 'PM' : 'AM';
                        const h12 = +h % 12 || 12;
                        dateStr += (dateStr ? '   ' : '') + `${h12}:${m} ${ampm}`;
                        timeTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="clock" class="w-3 h-3"></i> ${h12}:${m} ${ampm}</span>`;
                    }
                    if (!dateStr) {
                        dateStr = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        dateTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ${dateStr}</span>`;
                    }

                    const noticeD = new Date((n.notice_date || todayStr) + 'T' + (n.notice_time || '23:59:00'));
                    const isExpired = noticeD < new Date();

                    const isTodayOrTomorrow = n.notice_date === todayStr || n.notice_date === tomorrowStr;
                    let cardClasses = "p-3 rounded-[16px] shadow-sm flex flex-col gap-1.5 cursor-pointer transition-all active:scale-[0.98] ";
                    if (isExpired) {
                        cardClasses += "bg-slate-50 border border-slate-100 opacity-50 grayscale hover:opacity-80";
                    } else if (isTodayOrTomorrow) {
                        cardClasses += "bg-purple-50/50 border-2 border-purple-400 hover:border-purple-500 shadow-purple-100";
                    } else {
                        cardClasses += "bg-white border border-slate-100 hover:border-indigo-200";
                    }

                    let rightSideHtml = `<div class="flex items-center">`;
                    rightSideHtml += pin;
                    rightSideHtml += `</div>`;
                    
                    const displayTagsHtml = `${dateTagHtml}${timeTagHtml}${courseTagsHtml}`;

                    return `
                            <div onclick="openNoticeDetails('${window.sanitizeHTML(n.id)}')" class="${cardClasses} relative pb-4 px-4 pt-3 mt-2">
                                ${window.AuthorService ? window.AuthorService.renderAuthorBlock(n.profiles, displayTagsHtml, badgeHtml, rightSideHtml) : ''}
                                <div class="mt-1 flex flex-col">
                                    <h4 class="font-extrabold text-[15px] text-slate-900 truncate leading-tight">${window.sanitizeHTML(n.title)}</h4>
                                    <p class="text-[13px] text-slate-500 line-clamp-2 overflow-hidden mt-0.5 leading-snug">${window.sanitizeHTML(n.message)}</p>
                                </div>
                                <div class="mt-3">
                                    ${window.ReactionService ? window.ReactionService.renderReactionBlock('notice', n.id) : ''}
                                </div>
                            </div>
                        `;
                }).join('');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        
        async function injectDashboardNotices() {
            if (!allCoursesList || allCoursesList.length === 0) {
                try {
                    allCoursesList = await CourseStore.getCourses();
                } catch(e) {
                    console.warn('[DASHBOARD NOTICES] Course load failed', e);
                }
            }

            // Top Urgent Notice for dashboard
            const urgentCard = document.getElementById('dashboard-urgent-notice');
            if (urgentCard) {
                const latestUrgent = (window.currentNoticesList || []).find(n => n.notice_type === 'urgent');
                if (latestUrgent) {
                    
                    urgentCard.classList.remove('hidden');
                    const dashTitle = document.getElementById('dash-urgent-title');
                    const dashDesc = document.getElementById('dash-urgent-desc');
                    if (dashTitle) dashTitle.innerText = latestUrgent.title;
                    if (dashDesc) {
                        let text = (latestUrgent.message || '').replace(/\n+/g, ' ').trim();
                        if (text.length > 80) text = text.substring(0, 80) + '......... click to read';
                        else text = text + '......... click to read';
                        dashDesc.innerText = text;
                    }
                    urgentCard.onclick = () => openNoticeDetails(latestUrgent.id);
                } else {
                    
                    urgentCard.classList.add('hidden');
                }
                
                if (typeof window.triggerUrgentPopupModal === 'function') {
                    window._urgentNoticeForPopup = latestUrgent;
                    triggerUrgentPopupModal();
                }
            }

            // Recent Updates Feed
            const recentContainer = document.getElementById('dashboard-recent-notices');
            if (recentContainer) {
                // Collect Notices
                const noticesArray = (window.currentNoticesList || []).filter(n => n.notice_type === 'general' || n.notice_type === 'poll').map(n => {
                    const noticeD = new Date((n.notice_date || n.created_at.split('T')[0]) + 'T' + (n.notice_time || '23:59:00'));
                    return { ...n, __type: 'notice', sortDate: noticeD };
                });
                
                // Collect Schedules
                const schedulesArray = (window.currentSchedulesList || []).map(s => {
                    const schedD = new Date((s.schedule_date || s.created_at.split('T')[0]) + 'T' + (s.schedule_time || '23:59:00'));
                    return { ...s, __type: 'schedule', sortDate: schedD };
                });
                
                // Combine, sort, and slice
                const combinedUpdates = [...noticesArray, ...schedulesArray]
                    .sort((a, b) => {
                        if (a.is_pinned && !b.is_pinned) return -1;
                        if (!a.is_pinned && b.is_pinned) return 1;
                        // Sort by created_at so newest polls/notices appear exactly at the top
                        return new Date(b.created_at) - new Date(a.created_at);
                    })
                    .slice(0, 3);
                
                if (combinedUpdates.length === 0) {
                    recentContainer.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No recent updates</p>`;
                } else {
                    recentContainer.innerHTML = combinedUpdates.map(item => {
                        const now = new Date();
                        const isExpired = item.sortDate < now;
                        const expiredClass = isExpired ? 'opacity-60 grayscale hover:opacity-80' : '';
                        const pin = item.is_pinned ? `<i data-lucide="pin" class="w-4.5 h-4.5 text-orange-500 fill-orange-500"></i>` : '';
                        let rightSideHtml = `<div class="flex items-center">${pin}</div>`;
                        
                        if (item.__type === 'notice') {
                            const n = item;
                            let dateStr = '';
                            if (n.notice_date) {
                                const d = new Date(n.notice_date + 'T00:00:00');
                                dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                            }
                            if (n.notice_time) {
                                const [h, m] = n.notice_time.split(':');
                                const ampm = +h >= 12 ? 'PM' : 'AM';
                                const h12 = +h % 12 || 12;
                                dateStr += (dateStr ? '   ' : '') + `${h12}:${m} ${ampm}`;
                            }
                            if (!dateStr) dateStr = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                            const isPoll = n.notice_type === 'poll';
                            let badgeHtml = isPoll 
                                ? `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-indigo-100 text-[#4226E9] uppercase">POLL</span>` 
                                : `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-indigo-100 text-[#4226E9] uppercase">NOTICE</span>`;
                            
                            let courseTagsHtml = '';
                            if (n.notice_courses && n.notice_courses.length > 0) {
                                courseTagsHtml = n.notice_courses.map(nc => {
                                    const c = (allCoursesList || []).find(x => x.id === nc.course_id);
                                    const name = c ? (c.short_name || c.course_name) : 'Specific';
                                    return `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ${window.sanitizeHTML(name)}</span>`;
                                }).join('');
                            }
                            
                            let dateTagHtml = '';
                            let timeTagHtml = '';
                            if (n.notice_date) {
                                const d = new Date(n.notice_date + 'T00:00:00');
                                dateTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`;
                            }
                            if (n.notice_time) {
                                const [h, m] = n.notice_time.split(':');
                                const ampm = +h >= 12 ? 'PM' : 'AM';
                                const h12 = +h % 12 || 12;
                                timeTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="clock" class="w-3 h-3"></i> ${h12}:${m} ${ampm}</span>`;
                            }
                            if (!dateTagHtml && !timeTagHtml) {
                                const d = new Date(n.created_at);
                                dateTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`;
                            }
                            
                            const displayTagsHtml = `${dateTagHtml}${timeTagHtml}${courseTagsHtml}`;
                            const clickAction = isPoll ? `window.PollService.openPollDetails('${window.sanitizeHTML(n.id)}')` : `openNoticeDetails('${window.sanitizeHTML(n.id)}')`;

                            return `
                                <div class="flex flex-col pb-3 px-3 pt-3 bg-white rounded-[20px] shadow-sm shadow-slate-200/50 border border-slate-100 mb-2.5 ${expiredClass} transition-all active:scale-[0.98] cursor-pointer" onclick="${clickAction}">
                                    ${window.AuthorService ? window.AuthorService.renderAuthorBlock(n.profiles, displayTagsHtml, badgeHtml, rightSideHtml) : ''}
                                    <div class="mt-1 flex flex-col">
                                        <h4 class="font-bold text-[14px] text-slate-900 leading-tight truncate">${window.sanitizeHTML(n.title)}</h4>
                                        <p class="text-[12px] font-medium text-slate-500 leading-snug line-clamp-2 mt-0.5">${window.sanitizeHTML(n.message)}</p>
                                    </div>
                                    <div class="mt-3">
                                        ${window.ReactionService ? window.ReactionService.renderReactionBlock(isPoll ? 'poll' : 'notice', n.id) : ''}
                                    </div>
                                </div>
                            `;
                        } else {
                            const s = item;
                            let dateStr = '';
                            if (s.schedule_date) {
                                const d = new Date(s.schedule_date + 'T00:00:00');
                                dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                            }
                            if (s.schedule_time) {
                                const [h, m] = s.schedule_time.split(':');
                                const ampm = +h >= 12 ? 'PM' : 'AM';
                                const h12 = +h % 12 || 12;
                                dateStr += (dateStr ? '   ' : '') + `${h12}:${m} ${ampm}`;
                            }
                            if (!dateStr) dateStr = new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                            let badgeHtml = `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-emerald-100 text-emerald-600 uppercase">SCHEDULE</span>`;
                            const scMap = window.scheduleCoursesMap || {};
                            const courseIds = scMap[s.id] || [];
                            
                            let courseTagsHtml = '';
                            if (courseIds.length > 0) {
                                courseTagsHtml = courseIds.map(cid => {
                                    const c = (allCoursesList || []).find(x => x.id === cid);
                                    const name = c ? (c.short_name || c.course_name) : 'Specific';
                                    return `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ${window.sanitizeHTML(name)}</span>`;
                                }).join('');
                            }
                            
                            let dateTagHtml = '';
                            let timeTagHtml = '';
                            if (s.schedule_date) {
                                const d = new Date(s.schedule_date + 'T00:00:00');
                                dateTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`;
                            }
                            if (s.schedule_time) {
                                const [h, m] = s.schedule_time.split(':');
                                const ampm = +h >= 12 ? 'PM' : 'AM';
                                const h12 = +h % 12 || 12;
                                timeTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="clock" class="w-3 h-3"></i> ${h12}:${m} ${ampm}</span>`;
                            }
                            if (!dateTagHtml && !timeTagHtml) {
                                const d = new Date(s.created_at);
                                dateTagHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-wide bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-[6px]"><i data-lucide="calendar" class="w-3 h-3"></i> ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`;
                            }
                            
                            const displayTagsHtml = `${dateTagHtml}${timeTagHtml}${courseTagsHtml}`;

                            return `
                                <div class="flex flex-col pb-3 px-3 pt-3 bg-white rounded-[20px] shadow-sm shadow-slate-200/50 border border-slate-100 mb-2.5 ${expiredClass} transition-all active:scale-[0.98] cursor-pointer" onclick="openScheduleDetails('${window.sanitizeHTML(s.id)}')">
                                    ${window.AuthorService ? window.AuthorService.renderAuthorBlock(s.profiles, displayTagsHtml, badgeHtml, rightSideHtml) : ''}
                                    <div class="mt-1 flex flex-col">
                                        <h4 class="font-bold text-[14px] text-slate-900 leading-tight truncate">${window.sanitizeHTML(s.title)}</h4>
                                        <p class="text-[12px] font-medium text-slate-500 leading-snug line-clamp-2 mt-0.5">${window.sanitizeHTML(s.message)}</p>
                                    </div>
                                    <div class="mt-3">
                                        ${window.ReactionService ? window.ReactionService.renderReactionBlock('schedule', s.id) : ''}
                                    </div>
                                </div>
                            `;
                        }
                    }).join('');
                }
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // --- Create / Edit ---
        window.populateAudienceDropdown = function() {
            const select = document.getElementById('notice-audience-type');
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

        window.toggleNoticeAudience = async function() {
            const aud = document.getElementById('notice-audience-type').value;
            const tList = document.getElementById('notice-target-selection');
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
                        console.warn('[NOTICE AUDIENCE] Failed to fetch batches:', e);
                    }
                }
                
                if (batches.length === 0) {
                    tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No batches available.</p>';
                    return;
                }
                
                tList.innerHTML = batches.map(b => `
                    <label class="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                        <input type="checkbox" value="${b.id}" class="notice-target-cb w-4 h-4 accent-[#4226E9]"${aud === 'batch_crs' ? ` onchange="window.refreshNoticeCRList()"` : ''}>
                        <span class="text-[13px] text-slate-700 font-semibold">${window.sanitizeHTML(b.batch_name)}</span>
                    </label>
                `).join('');
                
                // For batch_crs, add a CR list container below
                if (aud === 'batch_crs') {
                    tList.innerHTML += '<div id="notice-cr-list-container" class="mt-3 border-t border-slate-100 pt-3"><p class="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Select batch(es) above to see CRs</p></div>';
                }
            } else if (aud === 'course_students') {
                tList.classList.remove('hidden');
                tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4"><span class="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>Loading courses...</p>';
                
                try {
                    let query = _supabase.from('courses').select('*, batches(batch_name)').order('course_name');
                    if (window.currentUserRole === 'cr' && window.authState?.user) {
                        const { data: crBatches } = await _supabase.from('batch_crs').select('batch_id').eq('user_id', window.authState.user.id).eq('active', true);
                        if (crBatches && crBatches.length > 0) {
                            query = query.in('batch_id', crBatches.map(b => b.batch_id));
                        } else {
                            query = query.eq('id', '00000000-0000-0000-0000-000000000000'); 
                        }
                    }
                    const { data: crs, error } = await query;
                    if (error) throw error;
                    
                    if (!crs || crs.length === 0) {
                        tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No courses available.</p>';
                        return;
                    }
                    
                    tList.innerHTML = crs.map(c => {
                    const batchName = c.batches ? c.batches.batch_name : c.batch_id;
                    return `
                    <label class="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                        <input type="checkbox" value="${c.id}" class="notice-target-cb w-4 h-4 accent-[#4226E9]">
                        <span class="text-[13px] text-slate-700 font-semibold">[Batch ${window.sanitizeHTML(batchName)}] ${window.sanitizeHTML(c.course_name)} (${c.course_code || c.short_name || ''})</span>
                    </label>
                `}).join('');
                } catch (err) {
                    console.error("Error loading courses:", err);
                    tList.innerHTML = '<p class="text-[13px] text-red-500 text-center py-4">Failed to load courses.</p>';
                }
            } else if (aud === 'specific_student') {
                tList.classList.remove('hidden');
                let students = window.adminDirectoryProfiles || [];
                if (students.length === 0) {
                    try {
                        tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4"><span class="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>Loading students...</p>';
                        const { data, error } = await _supabase.from('profiles').select('id, full_name, email').order('full_name');
                        if (!error && data) students = data;
                    } catch (e) {
                        console.warn('[NOTICE AUDIENCE] Failed to fetch students:', e);
                    }
                }
                if (students.length === 0) {
                    tList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No students available.</p>';
                    return;
                }
                tList.innerHTML = `
                    <div class="mb-2">
                        <input type="text" id="notice-student-search" oninput="window.filterNoticeStudents()" placeholder="Search students..." class="w-full h-9 px-3 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-[#4226E9]">
                    </div>
                    <div id="notice-student-list" class="space-y-1 max-h-[200px] overflow-y-auto">
                        ${students.map(s => `
                            <label class="notice-student-item flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" data-name="${(s.full_name||'').toLowerCase()}">
                                <input type="checkbox" value="${s.id}" class="notice-target-cb w-4 h-4 accent-[#4226E9]">
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
        
        // Dynamic CR list refresh for batch_crs audience type
        window.refreshNoticeCRList = async function() {
            const container = document.getElementById('notice-cr-list-container');
            if (!container) return;
            
            const selectedBatches = Array.from(document.querySelectorAll('.notice-target-cb:checked')).map(cb => cb.value);
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
                console.error('[NOTICE AUDIENCE] Failed to load CRs:', e);
                container.innerHTML = '<p class="text-[13px] text-red-400 text-center py-2">Failed to load CRs.</p>';
            }
        };
        
        window.filterNoticeStudents = function() {
            const q = document.getElementById('notice-student-search').value.toLowerCase();
            document.querySelectorAll('.notice-student-item').forEach(item => {
                if (item.dataset.name.includes(q)) item.classList.remove('hidden');
                else item.classList.add('hidden');
            });
        };

        function togglePublishDate(checked) {
            const container = document.getElementById('notice-publish-date-container');
            if (container) {
                if (!checked) container.classList.remove('hidden');
                else container.classList.add('hidden');
            }
        }

        function onNoticeFileSelected(input) {
            const file = input.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                window.showGlobalToast("File Too Large", "Max attachment is 5MB");
                input.value = '';
                return;
            }
            currentNoticeFile = file;
            document.getElementById('notice-file-dropzone').classList.add('hidden');
            document.getElementById('notice-selected-file-preview').classList.remove('hidden');
            document.getElementById('notice-selected-filename').innerText = file.name;
            document.getElementById('notice-selected-filesize').innerText = (file.size / 1024).toFixed(1) + ' KB';
        }

        function clearNoticeFile() {
            currentNoticeFile = null;
            document.getElementById('notice-file-input').value = '';
            document.getElementById('notice-file-dropzone').classList.remove('hidden');
            document.getElementById('notice-selected-file-preview').classList.add('hidden');
            document.getElementById('notice-edit-attachment-url').value = '';
        }

        export async function openCreateNotice() {
            document.getElementById('create-notice-title').innerText = "Create Notice";
            document.getElementById('form-create-notice').reset();
            document.getElementById('notice-edit-id').value = '';
            clearNoticeFile();
            const remindersList = document.getElementById('notice-reminders-list');
            if (remindersList) remindersList.innerHTML = '';

            // Set default date/time to now
            const now = new Date();
            document.getElementById('notice-date-input').value = now.toISOString().split('T')[0];
            document.getElementById('notice-time-input').value = now.toTimeString().slice(0, 5);

            // Pre-fetch courses so dropdown is ready
            if (!window.currentCoursesList || window.currentCoursesList.length === 0) {
                try {
                    window.currentCoursesList = await CourseStore.getCourses();
                    console.log("[NOTICE SYSTEM] Pre-loaded", window.currentCoursesList.length, "courses for Create Notice.");
                } catch (e) { console.warn("[NOTICE SYSTEM] Course pre-fetch error:", e); }
            }

            window.populateAudienceDropdown();
            await window.toggleNoticeAudience();
            togglePublishDate(true);
            document.getElementById('btn-delete-notice').classList.add('hidden');
            // Reset radio buttons to general
            const generalRadio = document.querySelector('input[name="notice-type-radio"][value="general"]');
            if (generalRadio) generalRadio.checked = true;
            document.getElementById('notice-type').value = 'general';
            window.navigate('screen-create-notice');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        export async function handleSaveNotice(e) {
            e.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            window.showLoader(true, "Saving Notice...");
            try {
                const id = document.getElementById('notice-edit-id').value;
                const title = document.getElementById('notice-title').value;
                const message = document.getElementById('notice-message').value;
                const notice_type = document.getElementById('notice-type').value;
                let is_pinned = document.getElementById('notice-pinned').checked;
                
                if (is_pinned) {
                    const pinnedNotices = window.currentNoticesList.filter(n => n.is_pinned && n.id !== id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                    if (pinnedNotices.length >= 3) {
                        const oldest = pinnedNotices[0];
                        const { error: unpinErr } = await _supabase.from('notices').update({ is_pinned: false }).eq('id', oldest.id);
                        if (!unpinErr) {
                            window.showGlobalToast("Notice", "Maximum 3 pins allowed. The oldest pinned notice was unpinned.");
                        }
                    }
                }
                const publish_now = document.getElementById('notice-publish-now').checked;
                const publish_date = publish_now ? new Date().toISOString() : document.getElementById('notice-publish-date').value;
                let audience_type = document.getElementById('notice-audience-type').value;

                const isAdmin = window.crPermissionService && window.crPermissionService.isAdmin();
                const isCR = window.crPermissionService && window.crPermissionService.isCR();
                const checkedCbs = Array.from(document.querySelectorAll('.notice-target-cb:checked')).map(cb => cb.value);

                if (id && isCR) {
                    const originalNotice = window.currentNoticesList.find(n => n.id === id);
                    if (originalNotice && originalNotice.created_by !== window.authState.user.id) {
                        console.log(`[CR PERMISSION DENIED] Attempted to update notice not created by them: ${id}`);
                        window.showGlobalToast("Access Denied", "You can only edit notices that you created.");
                        window.showLoader(false);
                        return;
                    }
                }

                if (isCR) {
                    if (audience_type === 'course_students') {
                        for (const cid of checkedCbs) {
                            const c = window.currentCoursesList.find(x => x.id === cid);
                            if (c && !window.crPermissionService.canAccessBatch(c.batch_id)) {
                                console.log(`[CR PERMISSION DENIED] Attempted to post notice for unassigned course ${cid}`);
                                window.showGlobalToast("Access Denied", "You can only post notices to courses in your assigned batches.");
                                window.showLoader(false);
                                return;
                            }
                        }
                    } else if (['batch_students', 'batch_crs'].includes(audience_type)) {
                        for (const bid of checkedCbs) {
                            if (!window.crPermissionService.canAccessBatch(bid)) {
                                console.log(`[CR PERMISSION DENIED] Attempted to post notice for unassigned batch ${bid}`);
                                window.showGlobalToast("Access Denied", "You can only target your assigned batches.");
                                window.showLoader(false);
                                return;
                            }
                        }
                    }
                }

                if (isCR) console.log(`[CR ACCESS CHECK] Validating notice save - PASSED`);
                if (isCR) console.log(`[CR ${id ? 'UPDATE' : 'CREATE'}] Notice ${id || 'new'}`);
                // New date/time columns
                const notice_date = document.getElementById('notice-date-input').value || null;
                const notice_time = document.getElementById('notice-time-input').value || null;

                let attachmentUrl = document.getElementById('notice-edit-attachment-url').value || null;

                if (currentNoticeFile) {
                    console.log("[NOTICE SYSTEM] Uploading attachment:", currentNoticeFile.name);
                    const ext = currentNoticeFile.name.split('.').pop();
                    const safeName = currentNoticeFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const fileName = `notice_${Date.now()}_${safeName}`;
                    const { data: uploadData, error: uploadError } = await _supabase.storage.from('notice-files').upload(fileName, currentNoticeFile);
                    if (uploadError) {
                        console.error("[NOTICE SYSTEM] Attachment upload error:", uploadError);
                        throw uploadError;
                    }
                    console.log("[NOTICE SYSTEM] Attachment upload successful");
                    const { data: urlData } = _supabase.storage.from('notice-files').getPublicUrl(fileName);
                    attachmentUrl = urlData.publicUrl;
                }

                const payload = {
                    title, message, notice_type, is_pinned, publish_now, publish_date,
                    audience_type, notice_date, notice_time,
                    attachment_url: attachmentUrl,
                    created_by: window.authState.user.id
                };
                console.log("[NOTICE SYSTEM] Notice payload:", payload);

                let savedNoticeId = id;
                if (id) {
                    const { error } = await _supabase.from('notices').update(payload).eq('id', id);
                    if (error) {
                        console.error("[NOTICE SYSTEM] Supabase Update error:", error);
                        throw error;
                    }
                } else {
                    const { data, error } = await _supabase.from('notices').insert([payload]).select();
                    if (error) {
                        console.error("[NOTICE SYSTEM] Supabase Insert error:", error);
                        throw error;
                    }
                    console.log("[NOTICE SYSTEM] Notice insert response:", data);
                    savedNoticeId = data[0].id;
                }



                // Handle Audience Targeting via content_targets FIRST to prevent race condition
                // Delete old targets
                await _supabase.from('content_targets').delete().eq('content_type', 'notice').eq('content_id', savedNoticeId);
                console.log("[TARGET SAVE] Old targets deleted.");

                const isTargetSpecific = ['batch_students', 'batch_crs', 'course_students', 'specific_student'].includes(audience_type);
                
                if (isTargetSpecific) {
                    const cbs = document.querySelectorAll('.notice-target-cb:checked');
                    const selectedIds = Array.from(cbs).map(cb => cb.value);

                    if (selectedIds.length > 0) {
                        const targetInserts = selectedIds.map(tid => ({
                            content_type: 'notice',
                            content_id: savedNoticeId,
                            target_type: audience_type,
                            target_id: tid
                        }));
                        console.log("[CONTENT TARGETS] Inserting targets:", targetInserts);
                        const { error: targetError } = await _supabase.from('content_targets').insert(targetInserts);
                        if (targetError) {
                            console.error("[TARGET SAVE] content_targets insert error:", targetError);
                            throw targetError;
                        }
                    }
                } else {
                    // all_students or all_crs
                    let globalTargetId = null;
                    if (window.currentUserRole === 'cr' && window.currentUserCRBatches && window.currentUserCRBatches.length > 0) {
                        // If CR creates an 'all_students' notice, it is implicitly targeted to their primary batch
                        globalTargetId = window.currentUserCRBatches[0];
                    }

                    const targetInsert = {
                        content_type: 'notice',
                        content_id: savedNoticeId,
                        target_type: audience_type,
                        target_id: globalTargetId
                    };
                    console.log("[CONTENT TARGETS] Inserting global target:", targetInsert);
                    const { error: targetError } = await _supabase.from('content_targets').insert([targetInsert]);
                    if (targetError) {
                        console.error("[TARGET SAVE] content_targets global insert error:", targetError);
                        throw targetError;
                    }
                }

                // Task 3: Insert/Update Reminders and Automatic Push Notification AFTER targets are securely saved
                try {
                    // Always delete old reminders first when saving (handles both update and insert safely)
                    console.log("[REMINDERS] Cleaning up old reminders for notice ID:", savedNoticeId);
                    await _supabase.from('notification_reminders').delete().eq('parent_id', savedNoticeId).eq('parent_type', 'notice');

                    const reminderRows = [];
                    
                    // Automatically queue push notification immediately for notice creation
                    if (!id || publish_now) {
                        reminderRows.push({
                            parent_type: 'notice',
                            parent_id: savedNoticeId,
                            reminder_time: new Date(Date.now() + 30000).toISOString(),
                            sent: false,
                            reminder_title: title,
                            reminder_message: message,
                            created_by: window.authState.user.id
                        });
                    }

                    const reminderDivs = document.querySelectorAll('#notice-reminders-list .reminder-row');
                    if (reminderDivs.length > 0) {
                        console.log(`[REMINDERS] Found ${reminderDivs.length} reminder rows to insert/update.`);
                        const eventDateTime = new Date(notice_date + 'T' + notice_time);
                        
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
                                    parent_type: 'notice',
                                    parent_id: savedNoticeId,
                                    reminder_time: targetTime.toISOString(),
                                    sent: false,
                                    reminder_title: title,
                                    reminder_message: message,
                                    created_by: window.authState.user.id
                                });
                            }
                        });
                    }
                    
                    if (reminderRows.length > 0) {
                        console.log("[REMINDERS] Inserting/updating reminder rows...", reminderRows);
                        console.log('[QUEUE INSERT PAYLOAD]', reminderRows);
                        const { error: reminderError } = await _supabase
                            .from('notification_reminders')
                            .insert(reminderRows);
                            
                        if (reminderError) {
                            console.error("[REMINDERS] Error inserting reminders into notification_reminders:", reminderError);
                            window.showGlobalToast("Warning", "Notice saved, but reminders failed to schedule.");
                        } else {
                            console.log("[REMINDERS] Successfully scheduled reminders bulk insert completed.");
                        }
                    }
                } catch (remErr) {
                    console.error("[REMINDERS] Exception during reminder calculation or insert:", remErr);
                    window.showGlobalToast("Warning", "Notice saved, but reminders calculation failed.");
                }

                window.showGlobalToast("Success", "Notice saved successfully.");
                window.navigateBack();
                await loadNotices();
            } catch (err) {
                console.error("[NOTICE SYSTEM] Unhandled Error:", err);
                window.showGlobalToast("Error", "Failed to save notice. Check logs.");
            } finally {
                window.showLoader(false);
            }
        }

        export async function openNoticeDetails(id) {
            const notice = window.currentNoticesList.find(n => n.id === id);
            if (!notice) return;
            selectedNoticeIdForDetails = id;

            document.getElementById('nd-title').innerText = notice.title;
            document.getElementById('nd-message').innerText = notice.message;

            // Build date/time from notice_date + notice_time columns
            let ndDateStr = '';
            if (notice.notice_date) {
                const d = new Date(notice.notice_date + 'T00:00:00');
                ndDateStr = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            }
            if (notice.notice_time) {
                const [h, m] = notice.notice_time.split(':');
                const ampm = +h >= 12 ? 'PM' : 'AM';
                const h12 = +h % 12 || 12;
                ndDateStr += (ndDateStr ? ' • ' : '') + `${h12}:${m} ${ampm}`;
            }
            if (!ndDateStr) ndDateStr = new Date(notice.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            document.getElementById('nd-date').innerText = ndDateStr;

            const badge = document.getElementById('nd-type-badge');
            if (notice.notice_type === 'urgent') {
                badge.className = "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-red-100 text-red-700";
                badge.innerText = "Urgent Notice";
            } else {
                badge.className = "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-indigo-100 text-indigo-700";
                badge.innerText = "General Notice";
            }

            const attCont = document.getElementById('nd-attachment-container');
            const preview = document.getElementById('nd-attachment-preview');
            const dlBtn = document.getElementById('nd-download-btn');

            if (notice.attachment_url) {
                attCont.classList.remove('hidden');
                dlBtn.href = notice.attachment_url;

                const url = notice.attachment_url;
                const isPdf = url.toLowerCase().includes('.pdf');
                const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);

                if (isImage) {
                    preview.innerHTML = `<img src="${url}" class="w-full max-h-[300px] object-contain rounded-[12px] bg-slate-100">`;
                } else if (isPdf) {
                    preview.innerHTML = `<iframe src="${url}#toolbar=0" class="w-full h-[300px] rounded-[12px]"></iframe>`;
                } else {
                    preview.innerHTML = `<div class="p-8 text-center text-slate-500 font-bold"><i data-lucide="file-text" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>Document File</div>`;
                }
            } else {
                attCont.classList.add('hidden');
            }

            const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
            if (isAdmin) {
                document.getElementById('btn-edit-notice').classList.remove('hidden');
            } else {
                document.getElementById('btn-edit-notice').classList.add('hidden');
            }
            if (window.ReactionService) {
                document.getElementById('nd-reaction-container').innerHTML = window.ReactionService.renderReactionBlock('notice', id);
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.navigate('screen-notice-details');
        }

        export async function openEditNotice() {
            const notice = window.currentNoticesList.find(n => n.id === selectedNoticeIdForDetails);
            if (!notice) return;

            document.getElementById('create-notice-title').innerText = "Edit Notice";
            document.getElementById('notice-edit-id').value = notice.id;
            document.getElementById('notice-title').value = notice.title;
            document.getElementById('notice-message').value = notice.message;
            document.getElementById('notice-type').value = notice.notice_type;
            document.getElementById('notice-pinned').checked = notice.is_pinned;
            document.getElementById('notice-publish-now').checked = notice.publish_now;
            document.getElementById('notice-audience-type').value = notice.audience_type;

            // Populate notice_date and notice_time
            document.getElementById('notice-date-input').value = notice.notice_date || '';
            document.getElementById('notice-time-input').value = notice.notice_time || '';

            // Sync radio button for notice type
            const radioBtn = document.querySelector(`input[name="notice-type-radio"][value="${notice.notice_type}"]`);
            if (radioBtn) radioBtn.checked = true;

            togglePublishDate(notice.publish_now);
            if (!notice.publish_now && notice.publish_date) {
                document.getElementById('notice-publish-date').value = new Date(notice.publish_date).toISOString().slice(0, 16);
            }
            clearNoticeFile();
            if (notice.attachment_url) {
                document.getElementById('notice-edit-attachment-url').value = notice.attachment_url;
                document.getElementById('notice-file-dropzone').classList.add('hidden');
                document.getElementById('notice-selected-file-preview').classList.remove('hidden');
                document.getElementById('notice-selected-filename').innerText = "Existing File Attached";
                document.getElementById('notice-selected-filesize').innerText = "Keep or replace";
            }

            window.populateAudienceDropdown();
            // Force the value to match notice after population
            document.getElementById('notice-audience-type').value = notice.audience_type;

            await window.toggleNoticeAudience();
            
            // Query content_targets to populate specific targets correctly
            try {
                const { data: targets, error: targetError } = await _supabase
                    .from('content_targets')
                    .select('target_id')
                    .eq('content_type', 'notice')
                    .eq('content_id', notice.id);
                    
                console.log("[EDIT NOTICE] Target Rows fetched from DB:", targets);
                    
                if (!targetError && targets && targets.length > 0) {
                    const targetIds = targets.map(t => String(t.target_id).trim());
                    const checkboxes = document.querySelectorAll('.notice-target-cb');
                    
                    console.log(`[EDIT NOTICE] Found ${checkboxes.length} checkboxes on UI. Attempting to map states...`);
                    
                    checkboxes.forEach(checkbox => {
                        const cbVal = String(checkbox.value).trim();
                        // If a checkbox's value matches a batch identifier returned from our database query, explicitly set its state to true:
                        if (targetIds.includes(cbVal)) {
                            checkbox.checked = true;
                            console.log(`[EDIT NOTICE] Mapped and checked target: ${cbVal}`);
                        }
                    });
                }
            } catch (e) {
                console.error("[EDIT NOTICE] Failed to load targets:", e);
            }

            // Backward compatibility for old architecture if needed
            if (notice.audience_type === 'specific' && notice.notice_courses) {
                const cbs = document.querySelectorAll('.notice-course-cb');
                const courseIds = notice.notice_courses.map(nc => nc.course_id);
                cbs.forEach(cb => {
                    if (courseIds.includes(cb.value)) cb.checked = true;
                });
            }

            document.getElementById('btn-delete-notice').classList.remove('hidden');

            // Fetch and render existing reminders
            const listContainer = document.getElementById('notice-reminders-list');
            if (listContainer) listContainer.innerHTML = '';

            try {
                const { data: reminders, error } = await _supabase
                    .from('notification_reminders')
                    .select('*')
                    .eq('parent_type', 'notice')
                    .eq('parent_id', notice.id);

                if (error) throw error;
                if (reminders && reminders.length > 0 && listContainer) {
                    console.log(`[EDIT NOTICE] Loaded ${reminders.length} existing reminders.`);
                    
                    const eventDateTime = new Date((notice.notice_date || '') + 'T' + (notice.notice_time || ''));
                    
                    reminders.forEach(rem => {
                        const rowId = 'reminder-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                        
                        let offsetValue = 'custom';
                        let customDateVal = '';
                        
                        if (rem.reminder_time && eventDateTime && !isNaN(eventDateTime.getTime())) {
                            const remTime = new Date(rem.reminder_time);
                            const diffMs = eventDateTime.getTime() - remTime.getTime();
                            const diffMins = Math.round(diffMs / (60 * 1000));
                            
                            if (diffMins === 1440 || diffMins === 180 || diffMins === 30) {
                                offsetValue = String(diffMins);
                            } else {
                                offsetValue = 'custom';
                                customDateVal = rem.reminder_time.slice(0, 16);
                            }
                        } else if (rem.reminder_time) {
                            customDateVal = rem.reminder_time.slice(0, 16);
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
                        listContainer.insertAdjacentHTML('beforeend', rowHTML);
                    });
                }
            } catch (err) {
                console.error("[EDIT NOTICE] Error loading existing reminders:", err);
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.navigate('screen-create-notice');
        }

        export async function deleteNoticeAction() {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (!confirm("Are you sure you want to delete this notice?")) return;
            const id = document.getElementById('notice-edit-id').value;
            if (!id) {
                console.error("[NOTICE DELETE] No notice ID found in form.");
                window.showGlobalToast("Error", "No notice selected for deletion.");
                return;
            }

            const isAdmin = window.crPermissionService && window.crPermissionService.isAdmin();
            const isCR = window.crPermissionService && window.crPermissionService.isCR();
            if (isCR) {
                const originalNotice = window.currentNoticesList.find(n => n.id === id);
                if (originalNotice && originalNotice.created_by !== window.authState.user.id) {
                    console.log(`[CR PERMISSION DENIED] Attempted to delete notice not created by them: ${id}`);
                    window.showGlobalToast("Access Denied", "You can only delete notices that you created.");
                    return;
                }
                console.log(`[CR ACCESS CHECK] Validating notice delete - PASSED`);
                console.log(`[CR DELETE] Notice ${id}`);
            }
            console.log("[NOTICE DELETE] Starting deletion for notice ID:", id);
            window.showLoader(true, "Deleting notice...");
            try {
                // Step 1: Delete attachment file from storage if exists
                const attachmentUrl = document.getElementById('notice-edit-attachment-url').value;
                if (attachmentUrl) {
                    try {
                        const urlParts = attachmentUrl.split('/notice-files/');
                        if (urlParts.length > 1) {
                            const storagePath = urlParts[1].split('?')[0];
                            console.log("[NOTICE DELETE] Removing storage file:", storagePath);
                            await _supabase.storage.from('notice-files').remove([storagePath]);
                        }
                    } catch (e) { console.warn("[NOTICE DELETE] Storage cleanup error (non-fatal):", e); }
                }

                // Step 2: Delete content_targets relations FIRST (FK constraint)
                console.log("[NOTICE DELETE] Deleting content_targets relations...");
                const { error: relError } = await _supabase.from('content_targets').delete().eq('content_type', 'notice').eq('content_id', id);
                if (relError) {
                    console.error("[NOTICE DELETE] content_targets delete error:", relError);
                    throw relError;
                }
                console.log("[NOTICE DELETE] content_targets relations deleted successfully.");

                // Task 2: Delete reminders from notification_reminders
                try {
                    console.log("[NOTICE DELETE] Deleting matching reminders...");
                    const { error: remError } = await _supabase.from('notification_reminders').delete().eq('parent_id', id);
                    if (remError) {
                        console.error("[NOTICE DELETE] Error deleting reminders:", remError);
                    } else {
                        console.log("[NOTICE DELETE] Reminders deleted successfully.");
                    }
                } catch (remErr) {
                    console.error("[NOTICE DELETE] Exception during reminders delete:", remErr);
                }

                // Step 2.1: Delete notice_courses relations
                console.log("[NOTICE DELETE] Deleting notice_courses relations...");
                const { error: ncError } = await _supabase.from('notice_courses').delete().eq('notice_id', id);
                if (ncError) {
                    console.error("[NOTICE DELETE] notice_courses delete error:", ncError);
                    throw ncError;
                }

                // Step 2.2: Delete content_reactions
                console.log("[NOTICE DELETE] Deleting content_reactions relations...");
                try {
                    await _supabase.from('content_reactions').delete().eq('content_type', 'notice').eq('content_id', id);
                } catch (e) { console.warn("[NOTICE DELETE] Reactions cleanup error:", e); }

                // Step 3: Delete the notice itself
                console.log("[NOTICE DELETE] Deleting notice row...");
                const { error: noticeError } = await _supabase.from('notices').delete().eq('id', id);
                if (noticeError) {
                    console.error("[NOTICE DELETE] notice delete error:", noticeError);
                    throw noticeError;
                }
                console.log("[NOTICE DELETE] Notice deleted successfully from database.");

                // Step 4: Remove from local state
                window.currentNoticesList = window.currentNoticesList.filter(n => n.id !== id);

                window.showGlobalToast("Success", "Notice deleted.");
                window.navigate('screen-notices-list');
                renderNoticesList();
                injectDashboardNotices();
            } catch (e) {
                console.error("[NOTICE DELETE] FAILED:", e);
                window.showGlobalToast("Error", "Failed to delete notice. Check console.");
            } finally {
                window.showLoader(false);
            }
        }

        // Expose notice functions globally
        
        
        
        
        
        
        
        
        
        
        
        
        
        



export const NoticeService = {
    _urgentNoticeForPopup: typeof _urgentNoticeForPopup !== 'undefined' ? _urgentNoticeForPopup : window._urgentNoticeForPopup,
    _urgentNoticeForPopup: typeof _urgentNoticeForPopup !== 'undefined' ? _urgentNoticeForPopup : window._urgentNoticeForPopup,
    _urgentNoticeForPopup: typeof _urgentNoticeForPopup !== 'undefined' ? _urgentNoticeForPopup : window._urgentNoticeForPopup,
    loadNotices: typeof loadNotices !== 'undefined' ? loadNotices : window.loadNotices,
    renderNoticesList: typeof renderNoticesList !== 'undefined' ? renderNoticesList : window.renderNoticesList,
    injectDashboardNotices: typeof injectDashboardNotices !== 'undefined' ? injectDashboardNotices : window.injectDashboardNotices,
    setNoticeFilter: typeof setNoticeFilter !== 'undefined' ? setNoticeFilter : window.setNoticeFilter,
    filterNotices: typeof filterNotices !== 'undefined' ? filterNotices : window.filterNotices,
    toggleNoticeAudience: typeof window.toggleNoticeAudience !== 'undefined' ? window.toggleNoticeAudience : function(){},
    togglePublishDate: typeof togglePublishDate !== 'undefined' ? togglePublishDate : window.togglePublishDate,
    onNoticeFileSelected: typeof onNoticeFileSelected !== 'undefined' ? onNoticeFileSelected : window.onNoticeFileSelected,
    clearNoticeFile: typeof clearNoticeFile !== 'undefined' ? clearNoticeFile : window.clearNoticeFile,
    openCreateNotice: typeof openCreateNotice !== 'undefined' ? openCreateNotice : window.openCreateNotice,
    handleSaveNotice: typeof handleSaveNotice !== 'undefined' ? handleSaveNotice : window.handleSaveNotice,
    openNoticeDetails: typeof openNoticeDetails !== 'undefined' ? openNoticeDetails : window.openNoticeDetails,
    openEditNotice: typeof openEditNotice !== 'undefined' ? openEditNotice : window.openEditNotice,
    deleteNoticeAction: typeof deleteNoticeAction !== 'undefined' ? deleteNoticeAction : window.deleteNoticeAction
};
console.log("[ARCHITECTURE]\nnotices loaded");
