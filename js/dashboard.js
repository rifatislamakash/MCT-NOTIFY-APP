import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, cancelActiveRequest, getGreeting } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

// Safari-safe Date parser (Strict WebKit compatibility)
window.getSafariSafeDate = function(dateInput) {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    const nativeDate = new Date(dateInput);
    if (!isNaN(nativeDate.getTime())) return nativeDate;
    const safeString = String(dateInput).replace(/-/g, '/').replace(/T/g, ' '); 
    const parsedDate = new Date(safeString);
    return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
};
const getSafariSafeDate = window.getSafariSafeDate;

        // ---- TIMERS ----
        let welcomeNotificationTimer = null;
        let goHomeTimer = null;
        let simulateReloadTimer = null;
        let openExamPanelTimer = null;

        // ---- DYNAMIC GREETING ----

        function updateDashboardGreetings() {
            const greet = getGreeting();
            const studentEl = document.getElementById('student-greeting-text');
            const adminEl = document.getElementById('admin-greeting-text');
            if (studentEl) studentEl.textContent = greet + " 👋";
            if (adminEl) adminEl.textContent = greet;
            
            const nameEl = document.getElementById('student-greeting-name');
            if (nameEl) {
                if (window.authState && window.authState.profile && window.authState.profile.full_name) {
                    nameEl.textContent = window.authState.profile.full_name;
                } else {
                    nameEl.textContent = "Welcome";
                }
            }
            if (typeof window.silentNotificationInit === 'function') window.silentNotificationInit();

            // --- ONE-TIME NEW REGISTRATION WELCOME PUSH NOTIFICATION ---
            if (window.authState && window.authState.user) {
                const welcomeStorageKey = `welcome_notified_${window.authState.user.id}`;
                const hasBeenNotified = localStorage.getItem(welcomeStorageKey);
                // CRITICAL SECURITY CHECK: Verify this is a brand-new registration event, 
                // and ensure they haven't already received this specific welcome card.
                const isFirstTimeRegistration = sessionStorage.getItem('isFirstTimeRegistration') === 'true';
                if (isFirstTimeRegistration && !hasBeenNotified) {
                    console.log("[ONBOARDING] Brand new registration detected. Queueing one-time welcome push...");
                    
                    if (typeof window.triggerImmediateNotification === 'function') {
                        // 1.5-second safety delay ensures the fresh device token transaction 
                        // is fully committed to the database before the edge function tries to read it.
                        if (welcomeNotificationTimer) clearTimeout(welcomeNotificationTimer);
                        welcomeNotificationTimer = setTimeout(() => {
                            window.triggerImmediateNotification(
                                'welcome',
                                window.authState.user.id,
                                '🚀 Welcome to MCT Notify!',
                                'Your campus feed is live. What you get:\n\n• ⚡ Instant Alerts (No delays)\n• 🗓️ Batch Feeds (No clutter)\n• 🎯 Zero Spam (Only essentials)\n\nKeep notifications enabled to stay in the loop!'
                            );
                            
                            // Instantly lock the local storage key so a standard login or page refresh can never trigger it again
                            localStorage.setItem(welcomeStorageKey, 'true');
                            console.log("[ONBOARDING] Welcome notification successfully delivered and locked.");
                        }, 1500);
                    } else {
                        console.warn("[ONBOARDING] window.triggerImmediateNotification function is missing.");
                    }
                } else {
                    console.log("[ONBOARDING] Standard login or returning session detected. Skipping onboarding welcome push.");
                }
            }
        }



        // Quick Access Badges for Today & Tomorrow events/notices/materials
        function updateDashboardQuickAccessBadges() {
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dayAfter = new Date(tomorrow);
                dayAfter.setDate(dayAfter.getDate() + 1);

                const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const todayStr = toDateStr(today);
                const tomorrowStr = toDateStr(tomorrow);

                // 1. Schedule Hub Quick Access Badge
                const scheduleBadge = document.getElementById('qa-schedule-badge');
                const now = new Date();
                if (scheduleBadge) {
                    const list = window.currentSchedulesList || [];
                    const count = list.filter(s => {
                        const date = s.schedule_date || s.date;
                        if (date !== todayStr && date !== tomorrowStr) return false;
                        const time = s.schedule_time || '23:59:00';
                        const sortDate = window.getSafariSafeDate ? window.getSafariSafeDate(date + 'T' + time) : new Date(date + 'T' + time);
                        return sortDate >= now;
                    }).length;
                    if (count > 0) {
                        scheduleBadge.textContent = count > 9 ? '9+' : count;
                        scheduleBadge.classList.remove('hidden');
                    } else {
                        scheduleBadge.classList.add('hidden');
                    }
                }

                // 2. Notices Quick Access Badge
                const noticeBadge = document.getElementById('qa-notices-badge');
                if (noticeBadge) {
                    const list = window.currentNoticesList || [];
                    const count = list.filter(n => {
                        const date = n.notice_date;
                        if (date !== todayStr && date !== tomorrowStr) return false;
                        const time = n.notice_time || '23:59:00';
                        const sortDate = window.getSafariSafeDate ? window.getSafariSafeDate(date + 'T' + time) : new Date(date + 'T' + time);
                        return sortDate >= now;
                    }).length;
                    if (count > 0) {
                        noticeBadge.textContent = count > 9 ? '9+' : count;
                        noticeBadge.classList.remove('hidden');
                    } else {
                        noticeBadge.classList.add('hidden');
                    }
                }
            } catch (err) {
                console.warn('[BADGE UPDATE ERROR]', err);
            }

            // AT GLANCE HOOK
            if (typeof window.updateTodayAtGlanceCounters === 'function') {
                window.updateTodayAtGlanceCounters();
            }
        }

        // Home redirection / Syncing action
        function goHome() {
            const currentScreen = document.querySelector('.screen:not(.hidden)')?.id || document.querySelector('.screen.active')?.id;
            const preferredRole = window.currentUserRole === 'cr' ? (sessionStorage.getItem('crPreferredRole') || 'student') : null;
            const targetScreen = (window.currentUserRole === 'admin' || (window.isAdminEmail && window.isAdminEmail(window.currentUserEmail)) || preferredRole === 'cr') ? 'screen-admin-dashboard' : 'screen-student-dashboard';
            
            if (currentScreen === targetScreen) {
                if (typeof window.showLoader === 'function') window.showLoader(true, 'Refreshing...');
                if (typeof window.loadDashboardTodayRoutine === 'function') window.loadDashboardTodayRoutine();
                if (typeof window.updateDashboardGreetings === 'function') window.updateDashboardGreetings();
                if (window.goHomeTimer) clearTimeout(window.goHomeTimer);
                window.goHomeTimer = setTimeout(() => {
                    if (typeof window.showLoader === 'function') window.showLoader(false);
                }, 500);
                return;
            }

            if (typeof window.navigate === 'function') window.navigate(targetScreen);
        }

        function updateBottomNavHighlights(screenId) {
            const isHome = screenId === 'screen-student-dashboard' || screenId === 'screen-admin-dashboard';
            const isProfile = screenId === 'screen-profile';
            const isGroups = ['screen-groups-list', 'screen-edit-group', 'screen-groups-detailed'].includes(screenId);
            const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || (window.isAdminEmail && window.isAdminEmail(window.currentUserEmail)));

            document.querySelectorAll('.nav-home-btn').forEach(btn => {
                if (btn && btn.classList) {
                    if (isHome) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                    else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                }
            });

            document.querySelectorAll('.nav-profile-btn').forEach(btn => {
                if (btn && btn.classList) {
                    if (isProfile) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                    else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                }
            });

            document.querySelectorAll('.nav-groups-btn').forEach(btn => {
                if (btn && btn.classList) {
                    if (!isAdmin) {
                        btn.classList.add('hidden');
                        return;
                    }
                    btn.classList.remove('hidden');
                    if (isGroups) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                    else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                }
            });
        }

        function simulateReload() {
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Syncing database data...");
            if (simulateReloadTimer) clearTimeout(simulateReloadTimer);
            simulateReloadTimer = setTimeout(() => {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }, 50);
        }

        // ---- DASHBOARD: Smart Today/Tomorrow Routine ----
        // ---- DASHBOARD: Smart Today/Tomorrow Routine ----
        export async function loadDashboardTodayRoutine(skipRender = false) {
            if (typeof window.__DASHBOARD_FETCH_COUNT !== 'undefined') window.__DASHBOARD_FETCH_COUNT++;
            if (window.isModuleLoading('dashboard')) {
                if (window.activeLoadControllers && (!window.activeLoadControllers['dashboard'] || window.activeLoadControllers['dashboard'].signal.aborted)) {
                    console.log("[DASHBOARD ROUTINE] Previous load was aborted. Forcing reset to allow new load.");
                    window.setModuleLoading('dashboard', false);
                } else {
                    console.log("[DASHBOARD ROUTINE] Load already in progress, ignoring duplicate call.");
                    return;
                }
            }
            window.setModuleLoading('dashboard', true);
            cancelActiveRequest('dashboard');
            const localController = new AbortController();
            window.activeLoadControllers['dashboard'] = localController;

            try {
                if (!window.authState || !window.authState.profile) {
                    console.warn("Auth state missing inside dashboard. Assuming unauthenticated.");
                    window.setModuleLoading('dashboard', false);
                    return;
                }
                
                let isExamModeOn = false;
                if (window.contentSettings && typeof window.contentSettings.is_exam_mode !== 'undefined') {
                    isExamModeOn = (window.contentSettings.is_exam_mode === true || String(window.contentSettings.is_exam_mode).toLowerCase() === 'true' || window.contentSettings.is_exam_mode === '1' || window.contentSettings.is_exam_mode === 1);
                } else {
                    const { data: dbSettings } = await _supabase.from('content_management').select('is_exam_mode').limit(1).abortSignal(localController.signal).single();
                    if (dbSettings) {
                        isExamModeOn = (dbSettings.is_exam_mode === true || String(dbSettings.is_exam_mode).toLowerCase() === 'true' || dbSettings.is_exam_mode === '1' || dbSettings.is_exam_mode === 1);
                        window.contentSettings = dbSettings;
                    }
                }
                
                const sectionHeader = document.getElementById('dashboard-routine-section-label');
                const dashContainer = document.getElementById('dashboard-today-routine');
                
                if (!dashContainer) {
                    window.setModuleLoading('dashboard', false);
                    return;
                }

                if (isExamModeOn) {
                    if (sectionHeader) {
                        sectionHeader.textContent = "Upcoming Exam";
                        if (sectionHeader.nextElementSibling) {
                            sectionHeader.nextElementSibling.textContent = "View full schedule";
                            sectionHeader.nextElementSibling.onclick = () => {
                                window.openDedicatedExamPanel();
                            };
                        }
                    }

                    if (!skipRender) {
                        dashContainer.innerHTML = `<div class="animate-pulse flex flex-col gap-3"><div class="h-[80px] bg-slate-100 rounded-[22px] border border-slate-50 w-full"></div></div>`;
                    }
                    
                    const d = new Date();
                    const todayStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    let query = _supabase.from('exam_schedules').select('*').gte('exam_date', todayStr).order('exam_date', { ascending: true }).order('start_time', { ascending: true }).abortSignal(localController.signal);
                    
                    if (window.currentUserRole !== 'admin') {
                         query = query.eq('target_batch', window.authState?.profile?.batch_id || 'none');
                    }
                    
                    const { data: exams, error } = await query;
                    window._currentExamsData = exams || [];
                    
                    let nextExam = null;
                    if (!error && exams && exams.length > 0) {
                        const now = new Date();
                        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

                        for (let ex of exams) {
                            if (ex.exam_date > todayStr) {
                                nextExam = ex;
                                break;
                            } else if (ex.exam_date === todayStr) {
                                let isPast = false;
                                if (ex.end_time) {
                                    const [h, m] = ex.end_time.split(':').map(Number);
                                    if ((h * 60 + m) <= currentTotalMinutes) {
                                        isPast = true;
                                    }
                                } else if (ex.start_time) {
                                    const [h, m] = ex.start_time.split(':').map(Number);
                                    if ((h * 60 + m) <= currentTotalMinutes) {
                                        isPast = true;
                                    }
                                }
                                
                                if (!isPast) {
                                    nextExam = ex;
                                    break;
                                }
                            }
                        }
                    }

                    if (nextExam) {
                        const exam = nextExam;
                        
                        let facultyName = '';
                        try {
                            const courses = await CourseStore.getCourses();
                            const faculties = await FacultyStore.getFaculty();
                            const matchedCourse = courses.find(c => 
                                c.course_code === exam.course_code || 
                                c.course_name.toLowerCase() === exam.course_name.toLowerCase()
                            );
                            if (matchedCourse && matchedCourse.faculty_id) {
                                const matchedFaculty = faculties.find(f => f.id === matchedCourse.faculty_id);
                                if (matchedFaculty) {
                                    facultyName = matchedFaculty.faculty_name;
                                }
                            }
                        } catch (err) {
                            console.warn("Failed to resolve faculty for dashboard exam card:", err);
                        }

                        const examDateObj = getSafariSafeDate(exam.exam_date + 'T00:00:00');
                        const examDate = examDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        
                        dashContainer.innerHTML = `<div class="space-y-3">
                            <div onclick="window.openDedicatedExamPanel()" class="bg-gradient-to-br from-indigo-50 to-white rounded-[24px] p-4 border border-indigo-100/80 relative cursor-pointer hover:shadow-md transition-all active:scale-[0.98]">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                                        <i data-lucide="graduation-cap" class="w-5 h-5"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h3 class="text-[14px] font-extrabold text-slate-800 leading-tight truncate">${window.sanitizeHTML(exam.course_name)}</h3>
                                        ${facultyName ? `<p class="text-[11px] text-slate-400 font-medium mt-0.5 truncate">${window.sanitizeHTML(facultyName)}</p>` : ''}
                                        
                                        <div class="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-slate-500 whitespace-nowrap overflow-hidden">
                                            <span class="flex items-center gap-1 text-indigo-600 shrink-0">
                                                <i data-lucide="calendar" class="w-3 h-3"></i>
                                                ${examDate}
                                            </span>
                                            <span class="text-slate-300 shrink-0">•</span>
                                            <span class="flex items-center gap-1 text-orange-600 shrink-0">
                                                <i data-lucide="clock" class="w-3 h-3"></i>
                                                ${window.formatTimeIfPossible(exam.start_time)} - ${window.formatTimeIfPossible(exam.end_time)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    } else {
                        dashContainer.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-sm px-6">
                            <i data-lucide="calendar-clock" class="w-8 h-8 text-indigo-300 mb-3 opacity-50"></i>
                            <h3 class="text-[14px] font-bold text-slate-700 mb-1">No exam info added</h3>
                            <p class="text-[11px] leading-relaxed max-w-[200px]">by class representatives.</p>
                        </div>`;
                    }
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    return; 
                }

                // LEGACY WEEKLY ROUTINE LOGIC
                const { dayName: targetDay, isToday } = getSmartDashboardDay();
                
                if (sectionHeader) {
                    sectionHeader.textContent = isToday ? "Today's Classes" : "Tomorrow's Classes";
                    if (sectionHeader.nextElementSibling) {
                        sectionHeader.nextElementSibling.textContent = "View full routine";
                        sectionHeader.nextElementSibling.onclick = () => {
                            navigate('screen-weekly-routine');
                            if(window.switchRoutineView) window.switchRoutineView('weekly');
                        };
                    }
                }

                if (!skipRender) {
                    dashContainer.innerHTML = `
                        <div class="animate-pulse flex flex-col gap-3">
                            <div class="h-[72px] bg-slate-100 rounded-[22px] border border-slate-50 w-full"></div>
                            <div class="h-[72px] bg-slate-100 rounded-[22px] border border-slate-50 w-full"></div>
                        </div>`;
                }

                console.log(`[DASHBOARD ROUTINE] Fetching routine for day: ${targetDay}`);
                
                if (!window.currentCoursesList && typeof window.fetchCourseList === 'function') {
                    await window.fetchCourseList();
                }
                
                let query = _supabase
                    .from('weekly_routines')
                    .select(`
                            id, batch_id, day_name, start_time, section_name, room_number, course_id, faculty_id,
                            courses ( id, course_name, short_name, sections_name ),
                            faculty ( id, faculty_name, teacher_initial ),
                            batches ( id, batch_name )
                        `)
                    .eq('day_name', targetDay)
                    .order('start_time', { ascending: true })
                    .limit(10)
                    .abortSignal(localController.signal);
                    
                if (window.currentUserRole !== 'admin') {
                    if (!window.authState.profile.batch_id) {
                        console.warn("[DASHBOARD] batch_id is missing, falling back to empty routine.");
                        window._dashboardRoutineHTML = `
                            <div class="bg-white rounded-[22px] border border-slate-100 shadow-2xs p-5 text-center">
                                <i data-lucide="calendar-check" class="w-8 h-8 text-slate-200 mx-auto mb-2"></i>
                                <p class="text-xs font-bold text-slate-400">Loading your batch details...</p>
                            </div>`;
                        if (!skipRender) window.renderDashboardTodayRoutine();
                        window.setModuleLoading('dashboard', false);
                        return;
                    }
                    query = query.eq('batch_id', window.authState.profile.batch_id);
                }
                
                const { data: dashboardClasses, error } = await query;
                
                if (error) {
                    console.error("[DASHBOARD] Failed to fetch classes:", error);
                    window.setModuleLoading('dashboard', false);
                    return;
                }
                
                const todayClassesData = dashboardClasses || [];

                if (localController.signal.aborted) {
                    console.log("[DASHBOARD ROUTINE] Aborted, ignoring rendering.");
                    return;
                }

                let todayClasses = (todayClassesData || []).sort((a, b) => {
                    return (a.start_time || '').localeCompare(b.start_time || '');
                });

                const enrolledCourses = window.currentUserCoursesList || [];

                if (window.currentUserRole !== 'admin') {
                    const enrolledCourseIds = enrolledCourses.map(uc => uc.course_id);
                    todayClasses = todayClasses.filter(c => {
                        if (!c.course_id || c.room_number === 'Break') return true;
                        if (!enrolledCourseIds.includes(c.course_id)) return false;
                        
                        const enrolledRecord = enrolledCourses.find(uc => uc.course_id === c.course_id);
                        if (c.section_name) {
                            if (!enrolledRecord || !enrolledRecord.section_name) return true;
                            
                            const userSecs = window.parseSectionsName(enrolledRecord.section_name).map(s => s.toLowerCase());
                            const classSections = window.parseSectionsName(c.section_name).map(s => s.toLowerCase());
                            if (classSections.length > 0 && !userSecs.some(us => classSections.includes(us))) return false;
                        }
                        return true;
                    });
                }

                if (isToday) window._todayClassesCount = todayClasses.length;
                else window._tomorrowClassesCount = todayClasses.length;
                
                if (todayClasses.length === 0) {
                    const emptyMsg = isToday ? 'No classes scheduled for today.' : `No classes scheduled for tomorrow (${targetDay}).`;
                    window._dashboardRoutineHTML = `
                            <div class="bg-white rounded-[22px] border border-slate-100 shadow-2xs p-5 text-center">
                                <i data-lucide="calendar-check" class="w-8 h-8 text-slate-200 mx-auto mb-2"></i>
                                <p class="text-xs font-bold text-slate-400">${emptyMsg}</p>
                            </div>`;
                    if (!skipRender) window.renderDashboardTodayRoutine();
                    return;
                }

                function getEndTime(startTimeStr, durationHrs) {
                    if (!startTimeStr) return '00:00';
                    const [hh, mm] = startTimeStr.split(':').map(Number);
                    const totalMins = hh * 60 + mm + durationHrs * 60;
                    const endHH = Math.floor(totalMins / 60) % 24;
                    const endMM = Math.round(totalMins % 60);
                    return `${String(endHH).padStart(2, '0')}:${String(endMM).padStart(2, '0')}`;
                }

                function formatRoutineTime(timeStr) {
                    if (!timeStr) return '--';
                    try {
                        const [h, m] = timeStr.split(':').map(Number);
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        const h12 = h % 12 || 12;
                        return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                    } catch (e) {
                        return timeStr;
                    }
                }

                const mergedClasses = todayClasses.map(c => ({...c, isMerged: false, durationHrs: 1.5}));
                const now = new Date();
                const nowMins = isToday ? (now.getHours() * 60 + now.getMinutes()) : -1;

                try {
                    window._dashboardRoutineHTML = mergedClasses.map(cls => {
                        const isBreak = !cls.course_id || cls.room_number === 'Break';
                        const timeDisplay = formatRoutineTime(cls.start_time);
                        const endTimeStr = getEndTime(cls.start_time, cls.durationHrs);
                        const endTimeDisplay = formatRoutineTime(endTimeStr);

                        const [hh, mm] = (cls.start_time || '00:00').split(':').map(Number);
                        const classMins = hh * 60 + mm;
                        const durationMins = cls.durationHrs * 60;

                        const isOngoing = isToday && classMins <= nowMins && nowMins < classMins + durationMins;
                        const isUpcoming = !isToday || classMins > nowMins;
                        const isPast = isToday && classMins + durationMins <= nowMins;

                        let dotColor = "";
                        let timeColor = "";
                        let statusBadge = "";
                        let contentHTML = "";

                        if (isBreak) {
                            timeColor = isOngoing ? 'text-amber-700' : isUpcoming ? 'text-amber-600' : 'text-slate-400';
                            statusBadge = isOngoing
                                ? `<span class="bg-amber-100 text-amber-750 text-[8.5px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 self-center">Ongoing Break</span>`
                                : isUpcoming
                                    ? `<span class="bg-amber-50/50 text-amber-600 text-[8px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 self-center">Upcoming Break</span>`
                                    : `<span class="bg-slate-100 text-slate-500 text-[8px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 self-center">Done</span>`;

                            contentHTML = `
                                    <div class="flex-1 min-w-0 bg-amber-50/30 p-3.5 rounded-[22px] border border-amber-100/50 shadow-2xs flex items-center justify-between gap-2 hover:border-amber-200/50 hover:shadow-xs transition-all ${isPast ? 'opacity-60' : ''}">
                                        <div class="flex items-center gap-3.5 min-w-0 flex-1">
                                            <div class="text-center border-r border-amber-100/50 pr-4 shrink-0 min-w-[70px] flex flex-col items-center justify-center">
                                                <p class="text-[11px] font-black ${timeColor} leading-none whitespace-nowrap">${timeDisplay}</p>
                                                <p class="text-[12px] font-bold text-amber-200/80 my-1 leading-none">|</p>
                                                <p class="text-[11px] font-black ${timeColor} leading-none whitespace-nowrap mt-0.5">${endTimeDisplay}</p>
                                            </div>
                                            <div class="min-w-0 flex-1 text-left">
                                                <h4 class="font-extrabold text-xs text-amber-800 leading-snug break-words">☕ Break Time</h4>
                                                <p class="text-[10px] text-amber-500/80 font-semibold mt-1 break-words">Take a break!</p>
                                            </div>
                                        </div>
                                        ${statusBadge}
                                    </div>
                                `;
                        } else {
                            timeColor = isOngoing ? 'text-[#4226E9]' : isUpcoming ? 'text-[#3B82F6]' : 'text-slate-400';
                            statusBadge = isOngoing
                                ? `<span class="bg-[#F3E8FF] text-[#8B5CF6] text-[8.5px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 self-center">Ongoing</span>`
                                : isUpcoming
                                    ? `<span class="bg-blue-50 text-blue-600 text-[8px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 self-center">Upcoming</span>`
                                    : `<span class="bg-slate-100 text-slate-500 text-[8px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 self-center">Done</span>`;

                            let sectionHTML = '';
                            if (cls.section_name) {
                                sectionHTML = `<span class="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded ml-2 whitespace-nowrap">Sec: ${window.sanitizeHTML(cls.section_name)}</span>`;
                            }

                            contentHTML = `
                                    <div class="flex-1 min-w-0 bg-white p-3.5 rounded-[22px] border border-slate-100 shadow-2xs flex items-center justify-between gap-2 hover:border-[#4226E9]/15 hover:shadow-xs transition-all ${isPast ? 'opacity-60' : ''}">
                                        <div class="flex items-center gap-3.5 min-w-0 flex-1">
                                            <div class="text-center border-r border-slate-100 pr-4 shrink-0 min-w-[70px] flex flex-col items-center justify-center">
                                                <p class="text-[11px] font-black ${timeColor} leading-none whitespace-nowrap">${timeDisplay}</p>
                                                <p class="text-[12px] font-bold text-slate-300 my-1 leading-none">|</p>
                                                <p class="text-[11px] font-black ${timeColor} leading-none whitespace-nowrap mt-0.5">${endTimeDisplay}</p>
                                            </div>
                                            <div class="min-w-0 flex-1 text-left">
                                                <h4 class="font-extrabold text-xs text-slate-900 leading-snug break-words flex flex-wrap items-center gap-1">${cls.courses?.course_name || 'Course'}${sectionHTML}</h4>
                                                <p class="text-[10px] text-slate-500 font-semibold mt-1 break-words">Room ${cls.room_number || 'N/A'} — ${cls.faculty?.faculty_name || 'Faculty'}</p>
                                            </div>
                                        </div>
                                        ${statusBadge}
                                    </div>
                                `;
                        }

                        return `
                                <div class="flex gap-2 items-center relative min-w-0">
                                    ${contentHTML}
                                </div>`;
                    }).join('');
                } catch (renderError) {
                    console.error("[SAFARI RENDER ERROR]", renderError);
                    window._dashboardRoutineHTML = `
                        <div style="padding: 15px; background: #ffebee; color: #c62828; border-radius: 8px; font-size: 12px; margin-top: 10px;">
                            <strong>iOS Render Error:</strong><br/>${renderError.message || renderError}
                        </div>
                    `;
                    if (!skipRender) window.renderDashboardTodayRoutine();
                }

                if (!skipRender) window.renderDashboardTodayRoutine();

            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log("[DASHBOARD ROUTINE] Aborted, ignoring errors.");
                    return;
                }
                console.error('[DASHBOARD ROUTINE ERROR]', err);
            } finally {
                window.setModuleLoading('dashboard', false);
                if (window.activeLoadControllers['dashboard'] === localController) {
                    window.activeLoadControllers['dashboard'] = null;
                }
            }
        }

        window.renderDashboardTodayRoutine = function() {
            if (typeof window.__DASHBOARD_RENDER_COUNT !== 'undefined') window.__DASHBOARD_RENDER_COUNT++;
            const dashContainer = document.getElementById('dashboard-today-routine');
            if (!dashContainer || typeof window._dashboardRoutineHTML === 'undefined') return;
            dashContainer.innerHTML = window._dashboardRoutineHTML;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            if (typeof window.updateTodayAtGlanceCounters === 'function') {
                window.updateTodayAtGlanceCounters();
            }
        };

        let isNavigatingToExams = false;
        window.openDedicatedExamPanel = async function() {
            if (isNavigatingToExams) return; // Break the infinite loop
            isNavigatingToExams = true;
            
            try {
                // 1. Visually wipe the DOM cache immediately to prevent stale UI
                const examContainer = document.getElementById('exams-routine-container');
                if (examContainer) examContainer.innerHTML = '';
                
                // 2. Show safe loader
                if (typeof window.showLoader === 'function') {
                    window.showLoader(true, 'Opening Exams...');
                }

                // 3. Force Router Navigation
                if (typeof navigate === 'function') navigate('screen-weekly-routine');
                
                // 4. Safely set view state immediately (no timeout race conditions)
                if (typeof window.switchToExamTab === 'function') {
                    window.switchToExamTab();
                } else {
                    const examTabBtn = document.getElementById('btn-view-exams') || document.getElementById('tab-exams');
                    if (examTabBtn) examTabBtn.click();
                }
            } catch (error) {
                console.error("[ROUTER ERROR] Failed to navigate to Exam Panel:", error);
            } finally {
                // Release the lock after a safe delay
                if (window.openExamPanelTimer) clearTimeout(window.openExamPanelTimer);
                window.openExamPanelTimer = setTimeout(() => { isNavigatingToExams = false; }, 800);
            }
        };

        window.switchToExamTab = function() {
            if (typeof window.switchRoutineView === 'function') {
                window.switchRoutineView('exams');
            } else {
                const examTabBtn = document.getElementById('btn-view-exams') || document.getElementById('tab-exams');
                if (examTabBtn) examTabBtn.click();
            }
        };

export const DashboardService = {
    updateDashboardGreetings: updateDashboardGreetings,
    updateDashboardQuickAccessBadges: updateDashboardQuickAccessBadges,
    goHome: goHome,
    updateBottomNavHighlights: updateBottomNavHighlights,

    simulateReload: simulateReload,
    loadDashboardTodayRoutine: loadDashboardTodayRoutine,
    applyCRDashboardRestrictions: function() {
        if (!window.crPermissionService) return;
        const isCR = window.crPermissionService.isCR();
        const isAdmin = window.crPermissionService.isAdmin();
        
        // Only handle the legacy admin buttons on the admin dashboard if any

        // Also handle the legacy admin buttons on the admin dashboard if any
        const facultyBtn = document.getElementById('admin-action-faculty');
        const supportBtn = document.getElementById('admin-action-support');
        const checkUploadBtn = document.getElementById('admin-action-check-upload');
        
        if (facultyBtn) { isCR ? facultyBtn.classList.add('hidden') : facultyBtn.classList.remove('hidden'); }
        if (supportBtn) { isCR ? supportBtn.classList.add('hidden') : supportBtn.classList.remove('hidden'); }
        if (checkUploadBtn) { isCR ? checkUploadBtn.classList.add('hidden') : checkUploadBtn.classList.remove('hidden'); }
    }
};



// ----------------------------------------------------
// Quick Access Pagination Logic
// ----------------------------------------------------
function updateQuickAccessPagination() {
    const container = document.getElementById('quick-access-scroll-container');
    if (!container) return;
    
    // Calculate which page we are on based on scroll position
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    
    if (width === 0) return;
    
    const pageIndex = Math.round(scrollLeft / width);
    const dots = document.querySelectorAll('.qa-dot');
    
    dots.forEach((dot, index) => {
        if (index === pageIndex) {
            dot.classList.remove('bg-slate-200');
            dot.classList.add('bg-blue-600');
        } else {
            dot.classList.remove('bg-blue-600');
            dot.classList.add('bg-slate-200');
        }
    });
}

// Attach event listener passively for better scroll performance
function initQuickAccessPagination() {
    const container = document.getElementById('quick-access-scroll-container');
    if (container) {
        container.addEventListener('scroll', updateQuickAccessPagination, { passive: true });
        window.addEventListener('resize', updateQuickAccessPagination, { passive: true });
        
        // Mouse wheel scrolling for PC
        container.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                container.scrollBy({ left: e.deltaY > 0 ? container.clientWidth : -container.clientWidth, behavior: 'smooth' });
            }
        }, { passive: false });
    }
}

window.scrollToQuickAccess = function(index) {
    const container = document.getElementById('quick-access-scroll-container');
    if (!container) return;
    const width = container.clientWidth;
    container.scrollTo({ left: width * index, behavior: 'smooth' });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuickAccessPagination);
} else {
    initQuickAccessPagination();
}

// ----------------------------------------------------
// Today At a Glance Metrics
// ----------------------------------------------------

window.startTAGAutoScroll = function() {
    const container = document.getElementById('tag-scroll-container');
    if (!container) return;

    if (window._tagScrollRAF) {
        cancelAnimationFrame(window._tagScrollRAF);
    }
    
    let speed = 1; 
    let delayFrames = 90;
    let isPaused = false;
    let currentScroll = container.scrollLeft;
    let isResetting = false;

    container.addEventListener('touchstart', () => { isPaused = true; }, {passive: true});
    container.addEventListener('touchend', () => { isPaused = false; delayFrames = 60; currentScroll = container.scrollLeft; }, {passive: true});
    container.addEventListener('mousedown', () => { isPaused = true; });
    container.addEventListener('mouseup', () => { isPaused = false; delayFrames = 60; currentScroll = container.scrollLeft; });
    container.addEventListener('mouseleave', () => { isPaused = false; });
    container.addEventListener('scroll', () => { 
        if(isPaused && !isResetting) currentScroll = container.scrollLeft; 
    }, {passive: true});

    let lastTime = 0;
    const pixelsPerSecond = 30; // Smooth 30px per second

    function step(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = timestamp - lastTime;
        lastTime = timestamp;

        if (!isPaused && container.scrollWidth > container.clientWidth) {
            if (delayFrames > 0) {
                delayFrames--;
                currentScroll = container.scrollLeft;
            } else if (!isResetting) {
                currentScroll += pixelsPerSecond * (dt / 1000);
                
                if (currentScroll >= (container.scrollWidth - container.clientWidth - 1)) {
                    delayFrames = 120;
                    isResetting = true;
                    container.scrollTo({ left: 0, behavior: 'smooth' });
                    setTimeout(() => {
                        isResetting = false;
                        currentScroll = 0;
                    }, 400);
                } else {
                    container.scrollLeft = currentScroll;
                }
            }
        }
        window._tagScrollRAF = requestAnimationFrame(step);
    }

    container.scrollLeft = 0;
    window._tagScrollRAF = requestAnimationFrame(step);
};

window.updateTodayAtGlanceCounters = function() {
    try {
        const now = new Date();
        const hour = now.getHours();
        
        let targetDate = new Date();
        let isTomorrow = false;
        
        if (hour >= 18) {
            targetDate.setDate(targetDate.getDate() + 1);
            isTomorrow = true;
        }
        
        const toDateStr = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        const targetDateStr = toDateStr(targetDate);
        
        const headerEl = document.getElementById('tag-header');
        if (headerEl) {
            headerEl.textContent = isTomorrow ? "Tomorrow at a Glance" : "Today at a Glance";
        }

        const container = document.getElementById('tag-scroll-container');
        if (!container) return;

        let noticesCount = 0;
        const notices = window.currentNoticesList || [];
        if (window.globalUserNoticeReads) {
            noticesCount = notices.filter(n => !window.globalUserNoticeReads.has(n.id)).length;
        } else {
            noticesCount = notices.filter(n => n.notice_date === targetDateStr).length;
        }

        let examsCount = 0;
        if (window._currentExamsData) {
             examsCount += window._currentExamsData.filter(ex => ex.exam_date === targetDateStr).length;
        }
        const schedules = window.currentSchedulesList || [];
        examsCount += schedules.filter(s => (s.schedule_date || s.date) === targetDateStr && s.schedule_type === 'Exam').length;

        let classesCount = 0;
        if (window.dashboardClasses) {
            classesCount += window.dashboardClasses.filter(c => (c.routine_date || c.date || c.targetDate) === targetDateStr || isTomorrow).length;
            if (typeof window.dashboardClasses.length !== 'undefined' && window.dashboardClasses[0] && (window.dashboardClasses[0].routine_date === undefined)) {
                classesCount = isTomorrow ? (window._tomorrowClassesCount || 0) : (window._todayClassesCount || 0);
            }
        }
        classesCount += schedules.filter(s => (s.schedule_date || s.date) === targetDateStr && s.schedule_type === 'Class').length;

        const assignmentsCount = schedules.filter(s => (s.schedule_date || s.date) === targetDateStr && s.schedule_type === 'Assignment').length;
        const presentationsCount = schedules.filter(s => (s.schedule_date || s.date) === targetDateStr && s.schedule_type === 'Presentation').length;

        const items = [
            { id: 'exams', label: 'Exams', count: examsCount, priority: 1, icon: '<i data-lucide="file-check-2" class="w-[18px] h-[18px] text-orange-500"></i>', color: 'text-orange-500', action: "window.openDedicatedExamPanel ? window.openDedicatedExamPanel() : null" },
            { id: 'classes', label: 'Classes', count: classesCount, priority: 2, icon: '<i data-lucide="book-open" class="w-[18px] h-[18px] text-indigo-500"></i>', color: 'text-indigo-500', action: "navigate('screen-weekly-routine'); loadWeeklyRoutine();" },
            { id: 'notices', label: 'Notices', count: noticesCount, priority: 3, icon: '<i data-lucide="megaphone" class="w-[18px] h-[18px] text-red-500"></i>', color: 'text-red-500', action: "navigate('screen-notices-list'); loadNotices();" },
            { id: 'assignments', label: 'Assignments', count: assignmentsCount, priority: 4, icon: '<i data-lucide="clipboard-list" class="w-[18px] h-[18px] text-purple-500"></i>', color: 'text-purple-500', action: "navigate('screen-weekly-routine');" },
            { id: 'presentations', label: 'Presentation', count: presentationsCount, priority: 5, icon: '<i data-lucide="monitor-play" class="w-[18px] h-[18px] text-pink-500"></i>', color: 'text-pink-500', action: "navigate('screen-weekly-routine');" }
        ];

        items.sort((a, b) => a.priority - b.priority);

        container.innerHTML = items.map(item => `
            <div class="flex items-center justify-center gap-2 px-2 flex-[0_0_33.333%] h-full border-r border-slate-100 last:border-0 cursor-pointer transition-transform active:scale-95" onclick="${item.action}">
                ${item.icon}
                <div class="flex flex-col items-start leading-none gap-0.5">
                    <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis max-w-full block">${item.label}</span>
                    <span class="text-[14px] font-extrabold text-slate-800 leading-none">${item.count > 99 ? '99+' : item.count}</span>
                </div>
            </div>`).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: container });
        }

        window.startTAGAutoScroll();

    } catch (e) {
        console.warn("Failed to update Today at Glance counters", e);
    }
};



