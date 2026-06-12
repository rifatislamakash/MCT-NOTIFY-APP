import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, cancelActiveRequest, getGreeting } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // ---- DYNAMIC GREETING ----

        function updateDashboardGreetings() {
            const greet = getGreeting();
            const studentEl = document.getElementById('student-greeting-text');
            const adminEl = document.getElementById('admin-greeting-text');
            if (studentEl) studentEl.textContent = greet;
            if (adminEl) adminEl.textContent = greet;
            if (typeof window.silentNotificationInit === 'function') window.silentNotificationInit();
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
                if (scheduleBadge) {
                    const list = window.currentSchedulesList || [];
                    const count = list.filter(s => {
                        const date = s.schedule_date || s.date;
                        return date === todayStr || date === tomorrowStr;
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
                        return date === todayStr || date === tomorrowStr;
                    }).length;
                    if (count > 0) {
                        noticeBadge.textContent = count > 9 ? '9+' : count;
                        noticeBadge.classList.remove('hidden');
                    } else {
                        noticeBadge.classList.add('hidden');
                    }
                }


            } catch (err) {
                console.warn("[BADGE UPDATE ERROR]", err);
            }
        }

        // Home redirection / Syncing action
        function goHome() {
            const currentScreen = document.querySelector('.screen:not(.hidden)')?.id || document.querySelector('.screen.active')?.id;
            const preferredRole = window.currentUserRole === 'cr' ? (sessionStorage.getItem('crPreferredRole') || 'student') : null;
            const targetScreen = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail) || preferredRole === 'cr') ? 'screen-admin-dashboard' : 'screen-student-dashboard';
            
            if (currentScreen === targetScreen) {
                if (typeof showLoader === 'function') showLoader(true, "Refreshing...");
                window.location.reload();
                return;
            }

            simulateReload();
            window.navigate(targetScreen);
        }

        function updateBottomNavHighlights(screenId) {
            const isHome = screenId === 'screen-student-dashboard' || screenId === 'screen-admin-dashboard';
            const isProfile = screenId === 'screen-profile';
            const isGroups = ['screen-groups-list', 'screen-edit-group', 'screen-groups-detailed'].includes(screenId);
            const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));

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


        }





        function simulateReload() {
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Syncing database data...");
            setTimeout(() => {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }, 50);
        }

        // ---- DASHBOARD: Smart Today/Tomorrow Routine ----
        // ---- DASHBOARD: Smart Today/Tomorrow Routine ----
        export async function loadDashboardTodayRoutine() {
            if (window.isModuleLoading('dashboard')) {
                console.log("[DASHBOARD ROUTINE] Load already in progress, ignoring duplicate call.");
                return;
            }
            window.setModuleLoading('dashboard', true);
            cancelActiveRequest('dashboard');
            const localController = new AbortController();
            window.activeLoadControllers['dashboard'] = localController;

            try {
                const { dayName: targetDay, isToday } = getSmartDashboardDay();
                const dashContainer = document.getElementById('dashboard-today-routine');
                const sectionLabel = document.getElementById('dashboard-routine-section-label');
                if (!dashContainer) {
                    window.setModuleLoading('dashboard', false);
                    return;
                }

                // Update section heading label dynamically
                if (sectionLabel) {
                    sectionLabel.textContent = isToday ? "Today's Classes" : "Tomorrow's Classes";
                }

                // Always fetch fresh from Supabase with retry and abort signal
                console.log(`[DASHBOARD ROUTINE] Fetching routine for day: ${targetDay}`);
                const allRoutines = await RoutineStore.getRoutines();
                const todayClassesData = allRoutines.filter(r => r.day_name === targetDay);

                if (localController.signal.aborted) {
                    console.log("[DASHBOARD ROUTINE] Aborted, ignoring rendering.");
                    return;
                }

                let todayClasses = (todayClassesData || []).sort((a, b) => {
                    if (a.class_order !== b.class_order) return (a.class_order || 0) - (b.class_order || 0);
                    return (a.start_time || '').localeCompare(b.start_time || '');
                });

                const enrolledCourses = window.currentUserCoursesList || [];

                if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') {
                    const enrolledCourseIds = enrolledCourses.map(uc => uc.course_id);
                    todayClasses = todayClasses.filter(c => {
                        if (!c.course_id || c.room_number === 'Break') return true;
                        if (!enrolledCourseIds.includes(c.course_id)) return false;
                        
                        const enrolledRecord = enrolledCourses.find(uc => uc.course_id === c.course_id);
                        if (c.section_name) {
                            if (!enrolledRecord || !enrolledRecord.section_name) return false;
                            if (c.section_name.trim().toLowerCase() !== enrolledRecord.section_name.trim().toLowerCase()) return false;
                        }
                        return true;
                    });
                } else if (window.currentUserRole === 'cr' && !window.isAdminEmail(window.currentUserEmail)) {
                    const allowedCourseIds = (window.currentCoursesList || []).map(c => c.id);
                    todayClasses = todayClasses.filter(c => {
                        if (!c.course_id || c.room_number === 'Break') return true;
                        if (!allowedCourseIds.includes(c.course_id)) return false;

                        const enrolledRecord = enrolledCourses.find(uc => uc.course_id === c.course_id);
                        if (enrolledRecord && c.section_name) {
                            if (!enrolledRecord.section_name) return false;
                            if (c.section_name.trim().toLowerCase() !== enrolledRecord.section_name.trim().toLowerCase()) return false;
                        }
                        return true;
                    });
                }

                if (todayClasses.length === 0) {
                    const emptyMsg = isToday ? 'No classes scheduled for today.' : `No classes scheduled for tomorrow (${targetDay}).`;
                    dashContainer.innerHTML = `
                            <div class="bg-white rounded-[22px] border border-slate-100 shadow-2xs p-5 text-center">
                                <i data-lucide="calendar-check" class="w-8 h-8 text-slate-200 mx-auto mb-2"></i>
                                <p class="text-xs font-bold text-slate-400">${emptyMsg}</p>
                            </div>`;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    return;
                }

                // Helper to calculate end time string
                function getEndTime(startTimeStr, durationHrs) {
                    if (!startTimeStr) return '00:00';
                    const [hh, mm] = startTimeStr.split(':').map(Number);
                    const totalMins = hh * 60 + mm + durationHrs * 60;
                    const endHH = Math.floor(totalMins / 60) % 24;
                    const endMM = Math.round(totalMins % 60);
                    return `${String(endHH).padStart(2, '0')}:${String(endMM).padStart(2, '0')}`;
                }

                // Helper to merge consecutive routine blocks
                const mergedClasses = [];
                let i = 0;
                while (i < todayClasses.length) {
                    const current = { ...todayClasses[i], isMerged: false, durationHrs: 1.5 };
                    const isBreak = !current.course_id || current.room_number === 'Break';

                    if (!isBreak) {
                        while (i + 1 < todayClasses.length) {
                            const next = todayClasses[i + 1];
                            const nextIsBreak = !next.course_id || next.room_number === 'Break';
                            if (nextIsBreak) break;

                            const sameCourse = current.course_id === next.course_id;
                            const sameFaculty = current.faculty_id === next.faculty_id;
                            const sameDay = current.day_name === next.day_name;

                            // Parse times
                            const [currHH, currMM] = current.start_time.split(':').map(Number);
                            const [nextHH, nextMM] = next.start_time.split(':').map(Number);
                            const currMins = currHH * 60 + currMM;
                            const nextMins = nextHH * 60 + nextMM;

                            const timeDiff = nextMins - currMins;
                            const expectedDiff = current.durationHrs * 60;

                            if (sameCourse && sameFaculty && sameDay && timeDiff === expectedDiff) {
                                current.durationHrs += 1.5;
                                current.isMerged = true;
                                i++; // merge it (advance pointer)
                            } else {
                                break;
                            }
                        }
                    }
                    mergedClasses.push(current);
                    i++;
                }

                const now = new Date();
                // When showing tomorrow: use nowMins=-1 so all classes are Upcoming, not Done
                const nowMins = isToday ? (now.getHours() * 60 + now.getMinutes()) : -1;

                dashContainer.innerHTML = mergedClasses.map(cls => {
                    const isBreak = !cls.course_id || cls.room_number === 'Break';
                    const timeDisplay = formatRoutineTime(cls.start_time);
                    const endTimeStr = getEndTime(cls.start_time, cls.durationHrs);
                    const endTimeDisplay = formatRoutineTime(endTimeStr);
                    const timeRangeStr = `${timeDisplay} - ${endTimeDisplay}`;

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
                        dotColor = isOngoing ? 'bg-amber-500' : isUpcoming ? 'bg-amber-400' : 'bg-slate-300';
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
                        dotColor = isOngoing ? 'bg-[#8B5CF6]' : isUpcoming ? 'bg-[#3B82F6]' : 'bg-slate-300';
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



                if (typeof lucide !== 'undefined') lucide.createIcons();
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
console.log("[ARCHITECTURE]\ndashboard loaded");
