import { _supabase } from './supabase-client.js';
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
        window.loadScheduleList = async function () {
            if (isModuleLoading('schedule')) {
                console.log("[SCHEDULE] Load already in progress, ignoring duplicate call.");
                return;
            }
            setModuleLoading('schedule', true);
            cancelActiveRequest('schedule');
            const localController = new AbortController();
            window.activeLoadControllers['schedule'] = localController;

            const container = document.getElementById('schedule-list-container');
            if (!container) {
                setModuleLoading('schedule', false);
                return;
            }

            // Show admin add button
            const addBtn = document.getElementById('schedule-admin-add-btn');
            if (addBtn) {
                const isAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
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
                    allCoursesList = await CourseStore.getCourses();
                }
                const { rawSchedules, scMap } = await fetchCachedOrDeduplicated('schedules', async () => {
                    const schedulesData = await fetchWithRetry(async (signal) => {
                        const { data, error } = await _supabase
                            .from('schedules')
                            .select('*, profiles (id, full_name, profile_url, role)')
                            .order('is_pinned', { ascending: false })
                            .order('created_at', { ascending: false })
                            .abortSignal(signal);
                        if (error) throw error;
                        return data || [];
                    }, 2, 1000, 8000, localController.signal);

                    const scheduleIds = schedulesData.filter(s => s.audience_type === 'specific').map(s => s.id);
                    let scMap = {};
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
                    }
                    return { rawSchedules: schedulesData, scMap };
                });

                if (localController.signal.aborted) {
                    console.log("[SCHEDULE] Load aborted, ignoring rendering.");
                    return;
                }

                let filteredSchedules = [...rawSchedules];
                scheduleCoursesMap = scMap;

                // Student visibility filter
                if (window.currentUserRole !== 'admin') {
                    const myCourseIds = (window.currentUserCoursesList || []).map(uc => uc.course_id);
                    filteredSchedules = filteredSchedules.filter(s => {
                        if (s.audience_type === 'all_students') return true;
                        if (s.audience_type === 'specific') {
                            const tgt = scMap[s.id] || [];
                            return tgt.some(cid => myCourseIds.includes(cid));
                        }
                        return true;
                    });
                }

                schedulesList = filteredSchedules;
                window.currentSchedulesList = schedulesList;
                 // PART 9: For badge count
                
                const scheduleIds = schedulesList.map(s => s.id);
                if (window.ReactionService) await window.ReactionService.fetchReactionsForContent('schedule', scheduleIds);

                console.log(`[SCHEDULE] Successfully loaded ${schedulesList.length} schedules.`);
                filterSchedulesUI();
                // Update schedule hub badge count
                if (typeof window.updateScheduleBadgeCount === 'function') window.updateScheduleBadgeCount();

            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log("[SCHEDULE] Abort detected, resetting to welcome screen.");
                    if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                    if (isScreenActive('screen-schedule-list') && typeof window.navigate === 'function') {
                        /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                    }
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
                setModuleLoading('schedule', false);
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

            const searchVal = (searchEl ? searchEl.value : '').toLowerCase().trim();
            const sortVal = sortEl ? sortEl.value : 'newest';
            const audienceVal = audienceEl ? audienceEl.value : 'all';

            let filtered = [...schedulesList];

            // Audience filter
            if (audienceVal !== 'all') {
                filtered = filtered.filter(s => s.audience_type === audienceVal);
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
        function renderScheduleList(list) {
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
                            <p class="text-[11px] text-slate-400 mt-1">${(window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail)) ? 'Tap + to add a new schedule.' : 'Check back when your admin posts a schedule.'}</p>
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
                const isAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
                const hasAttachment = !!s.attachment_url;
                const isPinned = !!s.is_pinned;
                const isTodayOrTomorrow = s.schedule_date === todayStr || s.schedule_date === tomorrowStr;

                const schedD = new Date((s.schedule_date || todayStr) + 'T' + (s.schedule_time || '23:59:00'));
                const isExpired = schedD < new Date();

                let cardClasses = "rounded-[16px] p-3 flex flex-col gap-1.5 cursor-pointer transition-all active:scale-[0.98] ";
                if (isExpired) {
                    cardClasses += "bg-slate-50 border border-slate-100 opacity-50 grayscale hover:opacity-80";
                } else if (isTodayOrTomorrow) {
                    cardClasses += "bg-purple-50/50 border-2 border-purple-400 hover:border-purple-500 shadow-purple-100";
                } else {
                    cardClasses += "bg-white shadow-sm border border-slate-100 hover:border-orange-200 hover:shadow-md";
                }

                let badgeHtml = s.audience_type === 'all_students'
                    ? `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-emerald-100 text-emerald-600 uppercase">ALL STUDENTS</span>`
                    : '';
                if (s.audience_type === 'specific') {
                    const cIds = scheduleCoursesMap[s.id] || [];
                    if (cIds.length > 0) {
                        badgeHtml = cIds.map(cid => {
                            const c = allCoursesList.find(x => x.id === cid);
                            const name = c ? (c.short_name || c.course_name) : 'Specific';
                            return `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-blue-100 text-blue-600 uppercase ml-1">${window.sanitizeHTML(name)}</span>`;
                        }).join('');
                    } else {
                        badgeHtml = `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-blue-100 text-blue-600 uppercase">SPECIFIC</span>`;
                    }
                }

                let dateTimeBadgeHtml = `
                    <div class="flex items-center gap-1 bg-[#4226E9]/10 text-[#4226E9] px-1.5 py-[3px] rounded-[4px] ml-1">
                        <i data-lucide="calendar-days" class="w-[9px] h-[9px]"></i>
                        <span class="text-[8.5px] font-bold tracking-wide leading-none">${formatScheduleDate(s.schedule_date)}</span>
                    </div>
                    <div class="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-[3px] rounded-[4px] ml-1">
                        <i data-lucide="clock" class="w-[9px] h-[9px]"></i>
                        <span class="text-[8.5px] font-bold tracking-wide leading-none">${formatScheduleTime(s.schedule_time)}</span>
                    </div>
                `;
                badgeHtml = badgeHtml + dateTimeBadgeHtml;

                const pin = isPinned ? `<i data-lucide="pin" class="w-3 h-3 text-orange-500 fill-orange-500 ml-1"></i>` : '';
                const attach = hasAttachment ? `<i data-lucide="paperclip" class="w-3.5 h-3.5 text-indigo-500 ml-1"></i>` : '';

                let rightSideHtml = `<div class="flex items-center">`;
                rightSideHtml += pin + attach;
                rightSideHtml += `</div>`;

                return `
                    <div onclick="openScheduleDetails('${s.id}')" class="${cardClasses} relative pb-4 px-4 pt-3 mt-2">
                        ${window.AuthorService ? window.AuthorService.renderAuthorBlock(s.profiles, '', badgeHtml, rightSideHtml) : ''}
                        <div class="mt-1 flex flex-col">
                            <h4 class="font-extrabold text-[15px] text-slate-900 truncate leading-tight">${window.sanitizeHTML(s.title || 'Untitled')}</h4>
                            <p class="text-[13px] text-slate-500 line-clamp-2 overflow-hidden mt-0.5 leading-snug">${window.sanitizeHTML(s.message || '')}</p>
                        </div>
                        ${window.ReactionService ? window.ReactionService.renderReactionBlock('schedule', s.id) : ''}
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
                        allCoursesList = await CourseStore.getCourses();
                    }
                    if (coursesList) {
                        coursesList.innerHTML = courseIds.map(cid => {
                            const course = allCoursesList.find(c => c.id === cid);
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
                const isAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
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
            if (window.currentUserRole !== 'admin') return;

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
            selectAudienceType('all_students');

            // Load courses
            await loadCoursesForCreateForm();

            window.navigate('screen-create-schedule');
        };

        export async function loadCoursesForCreateForm() {
            if (allCoursesList.length === 0) {
                allCoursesList = await CourseStore.getCourses();
            }
            renderCourseCheckboxes('cs-course-checkboxes', currentScheduleSelectedCourses, 'cs');
        }

        function renderCourseCheckboxes(containerId, selectedIds, prefix) {
            const container = document.getElementById(containerId);
            if (!container) return;

            if (allCoursesList.length === 0) {
                container.innerHTML = `<p class="text-[11px] text-slate-400 py-2">No courses found.</p>`;
                return;
            }

            container.innerHTML = allCoursesList.map(c => {
                const isChecked = selectedIds.includes(c.id);
                const label = c.short_name ? `${window.sanitizeHTML(c.course_name)} (${window.sanitizeHTML(c.short_name)})` : c.course_name;
                return `
                    <label class="flex items-center gap-3 p-2.5 rounded-[10px] border border-slate-100 cursor-pointer hover:bg-slate-50 transition ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white'}">
                        <input type="checkbox" value="${c.id}" onchange="onCourseCheckboxChange('${prefix}', '${c.id}', this.checked)"
                            class="w-4 h-4 rounded text-[#4226E9] accent-[#4226E9]" ${isChecked ? 'checked' : ''}>
                        <span class="text-[12px] font-semibold text-slate-700 flex-1">${label}</span>
                        ${c.short_name ? `<span class="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${window.sanitizeHTML(c.short_name)}</span>` : ''}
                    </label>`;
            }).join('');
        }

        window.onCourseCheckboxChange = function (prefix, courseId, checked) {
            if (prefix === 'cs') {
                if (checked && !currentScheduleSelectedCourses.includes(courseId)) {
                    currentScheduleSelectedCourses.push(courseId);
                } else if (!checked) {
                    currentScheduleSelectedCourses = currentScheduleSelectedCourses.filter(id => id !== courseId);
                }
                updateSelectedCoursesPreview('cs-selected-courses-preview', currentScheduleSelectedCourses);
                renderCourseCheckboxes('cs-course-checkboxes', currentScheduleSelectedCourses, 'cs');
            } else if (prefix === 'es') {
                if (checked && !currentEditSelectedCourses.includes(courseId)) {
                    currentEditSelectedCourses.push(courseId);
                } else if (!checked) {
                    currentEditSelectedCourses = currentEditSelectedCourses.filter(id => id !== courseId);
                }
                updateSelectedCoursesPreview('es-selected-courses-preview', currentEditSelectedCourses);
                renderCourseCheckboxes('es-course-checkboxes', currentEditSelectedCourses, 'es');
            }
        };

        function updateSelectedCoursesPreview(containerId, selectedIds) {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (selectedIds.length === 0) {
                container.innerHTML = '';
                return;
            }
            container.innerHTML = selectedIds.map(id => {
                const c = allCoursesList.find(x => x.id === id);
                if (!c) return '';
                const label = c.short_name || c.course_name;
                return `<span class="px-2.5 py-1 bg-indigo-100 text-[#4226E9] text-[10px] font-bold rounded-full">${label}</span>`;
            }).join('');
        }

        window.selectAudienceType = function (type) {
            currentScheduleAudienceType = type;
            const allBtn = document.getElementById('cs-audience-all-btn');
            const specificBtn = document.getElementById('cs-audience-specific-btn');
            const specificSection = document.getElementById('cs-specific-courses-section');

            const activeClass = ['border-[#4226E9]', 'bg-[#4226E9]/10', 'text-[#4226E9]'];
            const inactiveClass = ['border-slate-200', 'bg-white', 'text-slate-500'];

            if (type === 'all_students') {
                if (allBtn) { allBtn.classList.add(...activeClass); allBtn.classList.remove(...inactiveClass); }
                if (specificBtn) { specificBtn.classList.remove(...activeClass); specificBtn.classList.add(...inactiveClass); }
                if (specificSection) specificSection.classList.add('hidden');
            } else {
                if (specificBtn) { specificBtn.classList.add(...activeClass); specificBtn.classList.remove(...inactiveClass); }
                if (allBtn) { allBtn.classList.remove(...activeClass); allBtn.classList.add(...inactiveClass); }
                if (specificSection) specificSection.classList.remove('hidden');
                renderCourseCheckboxes('cs-course-checkboxes', currentScheduleSelectedCourses, 'cs');
            }
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
            if (window.currentUserRole !== 'admin') return;

            const title = document.getElementById('cs-title')?.value?.trim();
            const message = document.getElementById('cs-message')?.value?.trim();
            const date = document.getElementById('cs-date')?.value;
            const time = document.getElementById('cs-time')?.value;
            const isPinned = document.getElementById('cs-pin')?.checked || false;

            // Validation
            if (!title) { window.showGlobalToast('Validation', 'Title is required.'); return; }
            if (!message) { window.showGlobalToast('Validation', 'Message is required.'); return; }
            if (!date) { window.showGlobalToast('Validation', 'Date is required.'); return; }
            if (!time) { window.showGlobalToast('Validation', 'Time is required.'); return; }
            if (currentScheduleAudienceType === 'specific' && currentScheduleSelectedCourses.length === 0) {
                window.showGlobalToast('Validation', 'Select at least one course for specific audience.');
                return;
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

                // Insert schedule row
                const payload = {
                    title,
                    message,
                    schedule_date: date,
                    schedule_time: time,
                    audience_type: currentScheduleAudienceType,
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
                        audience_type: currentScheduleAudienceType,
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
                        
                        // Fix 1: Auto-link courses if specific
                        if (currentScheduleAudienceType === 'specific' && currentScheduleSelectedCourses.length > 0) {
                            const courseLinks = currentScheduleSelectedCourses.map(courseId => ({
                                notice_id: noticeData[0].id,
                                course_id: courseId
                            }));
                            const { error: ncError } = await _supabase.from('notice_courses').insert(courseLinks);
                            if (ncError) console.error("[SCHEDULE] Notice courses link error:", ncError);
                        }

                        // Fix 2: Auto-queue notification for the notice
                        const noticePayload = {
                            parent_type: 'notice',
                            parent_id: noticeData[0].id,
                            reminder_title: title,
                            reminder_message: message,
                            sent: false,
                            created_by: window.authState.user?.id || null,
                            reminder_time: new Date(Date.now() + 60000).toISOString()
                        };
                        console.log('[QUEUE INSERT PAYLOAD]', noticePayload);
                        const { error: notifError } = await _supabase.from('notification_reminders').insert([noticePayload]);
                        if (notifError) console.error("[SCHEDULE] Notice push queue error:", notifError);
                    }
                }

                // Task 3: Insert Reminders and Automatic Push Notification
                try {
                    const reminderRows = [];
                    // Automatically queue push notification immediately for schedule
                    reminderRows.push({
                        parent_type: 'schedule',
                        parent_id: newSchedule.id,
                        reminder_time: new Date(Date.now() + 60000).toISOString(),
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

                // If specific, insert schedule_courses rows
                if (currentScheduleAudienceType === 'specific' && currentScheduleSelectedCourses.length > 0) {
                    const scRows = currentScheduleSelectedCourses.map(cid => ({
                        schedule_id: newSchedule.id,
                        course_id: cid
                    }));
                    const { error: scError } = await _supabase.from('schedule_courses').insert(scRows);
                    if (scError) console.warn('[SCHEDULE COURSES INSERT WARN]', scError);
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
            if (window.currentUserRole !== 'admin' || !selectedScheduleId) return;

            const s = schedulesList.find(x => x.id === selectedScheduleId);
            if (!s) { window.showGlobalToast('Error', 'Schedule data missing.'); return; }

            window.showLoader(true, 'Loading editor...');
            try {
                if (allCoursesList.length === 0) {
                allCoursesList = await CourseStore.getCourses();
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
                selectEditAudienceType(currentEditAudienceType);
                renderCourseCheckboxes('es-course-checkboxes', currentEditSelectedCourses, 'es');
                updateSelectedCoursesPreview('es-selected-courses-preview', currentEditSelectedCourses);

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

        window.selectEditAudienceType = function (type) {
            currentEditAudienceType = type;
            const allBtn = document.getElementById('es-audience-all-btn');
            const specificBtn = document.getElementById('es-audience-specific-btn');
            const specificSection = document.getElementById('es-specific-courses-section');

            const activeClass = ['border-[#4226E9]', 'bg-[#4226E9]/10', 'text-[#4226E9]'];
            const inactiveClass = ['border-slate-200', 'bg-white', 'text-slate-500'];

            if (type === 'all_students') {
                if (allBtn) { allBtn.classList.add(...activeClass); allBtn.classList.remove(...inactiveClass); }
                if (specificBtn) { specificBtn.classList.remove(...activeClass); specificBtn.classList.add(...inactiveClass); }
                if (specificSection) specificSection.classList.add('hidden');
            } else {
                if (specificBtn) { specificBtn.classList.add(...activeClass); specificBtn.classList.remove(...inactiveClass); }
                if (allBtn) { allBtn.classList.remove(...activeClass); allBtn.classList.add(...inactiveClass); }
                if (specificSection) specificSection.classList.remove('hidden');
                renderCourseCheckboxes('es-course-checkboxes', currentEditSelectedCourses, 'es');
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
            if (window.currentUserRole !== 'admin' || !selectedScheduleId) return;

            const title = document.getElementById('es-title')?.value?.trim();
            const message = document.getElementById('es-message')?.value?.trim();
            const date = document.getElementById('es-date')?.value;
            const time = document.getElementById('es-time')?.value;
            const isPinned = document.getElementById('es-pin')?.checked || false;

            if (!title) { window.showGlobalToast('Validation', 'Title is required.'); return; }
            if (!message) { window.showGlobalToast('Validation', 'Message is required.'); return; }
            if (!date) { window.showGlobalToast('Validation', 'Date is required.'); return; }
            if (!time) { window.showGlobalToast('Validation', 'Time is required.'); return; }
            if (currentEditAudienceType === 'specific' && currentEditSelectedCourses.length === 0) {
                window.showGlobalToast('Validation', 'Select at least one course for specific audience.');
                return;
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

                // Update schedule row
                const payload = {
                    title,
                    message,
                    schedule_date: date,
                    schedule_time: time,
                    audience_type: currentEditAudienceType,
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

                // Update schedule_courses: delete old, insert new
                await _supabase.from('schedule_courses').delete().eq('schedule_id', selectedScheduleId);

                if (currentEditAudienceType === 'specific' && currentEditSelectedCourses.length > 0) {
                    const scRows = currentEditSelectedCourses.map(cid => ({
                        schedule_id: selectedScheduleId,
                        course_id: cid
                    }));
                    const { error: scError } = await _supabase.from('schedule_courses').insert(scRows);
                    if (scError) console.warn('[SCHEDULE COURSES UPDATE WARN]', scError);
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
            if (window.currentUserRole !== 'admin' || !selectedScheduleId) return;
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

                // Delete schedule_courses rows first
                await _supabase.from('schedule_courses').delete().eq('schedule_id', selectedScheduleId);

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
        window.selectAudienceType = window.selectAudienceType;
        window.selectEditAudienceType = window.selectEditAudienceType;
        window.onCourseCheckboxChange = window.onCourseCheckboxChange;
        window.onScheduleFileSelected = window.onScheduleFileSelected;
        window.clearScheduleFile = window.clearScheduleFile;
        window.onEditScheduleFileSelected = window.onEditScheduleFileSelected;
        window.clearEditScheduleFile = window.clearEditScheduleFile;
        window.clearEditAttachment = window.clearEditAttachment;



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
    selectEditAudienceType: typeof selectEditAudienceType !== 'undefined' ? selectEditAudienceType : window.selectEditAudienceType,
    onEditScheduleFileSelected: typeof onEditScheduleFileSelected !== 'undefined' ? onEditScheduleFileSelected : window.onEditScheduleFileSelected,
    clearEditScheduleFile: typeof clearEditScheduleFile !== 'undefined' ? clearEditScheduleFile : window.clearEditScheduleFile,
    clearEditAttachment: typeof clearEditAttachment !== 'undefined' ? clearEditAttachment : window.clearEditAttachment,
    handleUpdateSchedule: typeof handleUpdateSchedule !== 'undefined' ? handleUpdateSchedule : window.handleUpdateSchedule,
    handleDeleteSchedule: typeof handleDeleteSchedule !== 'undefined' ? handleDeleteSchedule : window.handleDeleteSchedule
};
console.log("[ARCHITECTURE]\nschedules loaded");
