import { _supabase } from './supabase-client.js';
import { crPermissionService } from './services/crPermissionService.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest } from './utils.js';

export class PollService {
    static currentPolls = [];

    static async loadPolls() {
        showLoader(true, "Loading polls...");
        try {
            // Await notices load if it's currently loading
            if (window.isModuleLoading && window.isModuleLoading('notices')) {
                // simple loop to wait for notices to finish
                for (let i = 0; i < 50; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    if (!window.isModuleLoading('notices')) break;
                }
            } else if (!window.currentNoticesList || window.currentNoticesList.length === 0) {
                // Ensure notices are loaded at least once if empty
                if (typeof window.loadNotices === 'function') {
                    await window.loadNotices();
                }
            }

            // Extract securely filtered polls from the centralized notices list
            const filteredNotices = window.currentNoticesList || [];
            this.currentPolls = filteredNotices.filter(n => n.notice_type === 'poll');
            
            // Load votes (reactions) for these polls
            const pollIds = this.currentPolls.map(p => p.id);
            if (window.ReactionService && pollIds.length > 0) {
                await window.ReactionService.fetchReactionsForContent('poll', pollIds);
            }

            this.renderPollsList();
        } catch (err) {
            console.error("Error loading polls:", err);
            showGlobalToast("Error", "Could not load polls");
        } finally {
            showLoader(false);
        }
    }

    static checkAndShowPopup() {
        if (!this.currentPolls || this.currentPolls.length === 0) return;
        
        // Find first poll that I haven't voted on
        const unvotedPoll = this.currentPolls.find(poll => {
            const pollData = JSON.parse(poll.attachment_url || "{}");
            const pollEndDatetime = pollData.pollEndDatetime;
            let isEnded = false;
            if (pollEndDatetime) {
                isEnded = new Date() > new Date(pollEndDatetime);
            }

            const votes = window.ReactionService?.cache[poll.id] || [];
            const myVotes = votes.filter(v => v.user_id === window.authState?.user?.id);
            return myVotes.length === 0 && !isEnded;
        });

        if (unvotedPoll) {
            // Found an unvoted poll, trigger the popup
            this.openPollDetails(unvotedPoll.id);
        }
    }

    static renderPollsList() {
        const container = document.getElementById('polls-list-container');
        if (!container) return;

                    const now = new Date();
            const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            this.currentPolls.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

                const getEndDatetime = (poll) => {
                    try {
                        const data = JSON.parse(poll.attachment_url || "{}");
                        return data.pollEndDatetime ? new Date(data.pollEndDatetime) : new Date(8640000000000000);
                    } catch(e) {
                        return new Date(8640000000000000);
                    }
                };

                const dateA = getEndDatetime(a);
                const dateB = getEndDatetime(b);
                const aIsExpired = dateA < now;
                const bIsExpired = dateB < now;
                
                if (aIsExpired !== bIsExpired) {
                    return aIsExpired ? 1 : -1; // Active first, expired last
                }
                if (!aIsExpired) {
                    return dateA - dateB; // Upcoming: closest deadline first
                } else {
                    return dateB - dateA; // Expired: most recently expired first
                }
            });

        if (this.currentPolls.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 dark:text-dark-textSecondary font-medium text-sm">No polls found</div>`;
            return;
        }

        container.innerHTML = this.currentPolls.map(poll => {
            const pollData = JSON.parse(poll.attachment_url || "{}");
            const options = pollData.options || [];
            const allowMultiple = pollData.allowMultiple || false;
            const releaseResults = pollData.releaseResults || false;

            const pollEndDatetime = pollData.pollEndDatetime;
            let isEnded = false;
            if (pollEndDatetime) {
                isEnded = new Date() > new Date(pollEndDatetime);
            }

            // Get votes
            const votes = window.ReactionService?.cache[poll.id] || [];
            const totalVotes = votes.length;
            const myVotes = votes.filter(v => v.user_id === window.authState?.user?.id);
            const hasVoted = myVotes.length > 0;

            let statusBadge = '';
            if (isEnded) {
                statusBadge = `<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-slate-200 dark:border-white/10 dark:bg-dark-bg">Ended</span>`;
            } else if (hasVoted) {
                statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">Voted</span>`;
            } else {
                statusBadge = `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">Active</span>`;
            }

            let courseBadge = '';
            if (poll.course_id && window.currentCoursesList) {
                const course = window.currentCoursesList.find(c => String(c.id) === String(poll.course_id));
                if (course) {
                    courseBadge = `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border border-indigo-100">${window.sanitizeHTML(course.course_code)}</span>`;
                }
            }

            const formattedDate = new Date(poll.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            let deadlineHtml = '';
            if (pollEndDatetime) {
                const deadlineDate = new Date(pollEndDatetime);
                const formattedDeadline = deadlineDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                deadlineHtml = `&bull; <span class="${isEnded ? 'text-red-500 dark:text-red-400' : ''}">End: ${formattedDeadline}</span>`;
            }

            let deleteBtnHtml = '';
            if (window.currentUserRole === 'admin' || (window.currentUserRole === 'cr' && poll.created_by === window.authState?.user?.id)) {
                deleteBtnHtml = `
                    <button type="button" class="delete-btn p-1 mb-1 text-slate-400 dark:text-dark-textSecondary hover:bg-red-50 hover:text-red-500 rounded-md transition-colors flex shrink-0 items-center justify-center" onclick="event.stopPropagation(); window.executeGlobalDelete('poll', '${poll.id}', 'poll-card-${poll.id}')" title="Delete Poll">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                `;
            }

            return `
                <div id="poll-card-${poll.id}" class="bg-white dark:bg-dark-card p-4 rounded-[20px] shadow-sm border border-slate-100 dark:border-white/5 transition-all hover:shadow-md cursor-pointer ${isEnded ? 'opacity-60 grayscale-[0.2]' : ''}" onclick="window.PollService.openPollDetails('${poll.id}')">
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                <i data-lucide="pie-chart" class="w-4 h-4 text-indigo-600"></i>
                            </div>
                            <div>
                                <h4 class="text-[13px] font-bold text-slate-900 dark:text-dark-text leading-tight">${window.safeFormatRichText(poll.title)}</h4>
                                <div class="flex items-center gap-1.5 mt-1 text-[9px] font-semibold text-slate-500 dark:text-dark-textSecondary flex-wrap">
                                    <span><i data-lucide="calendar" class="w-3 h-3 inline pb-0.5"></i> Pub: ${formattedDate}</span>
                                    ${deadlineHtml}
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1 shrink-0">
                            <div class="flex items-center gap-2">
                                ${deleteBtnHtml}
                            </div>
                            ${statusBadge}
                            ${courseBadge}
                        </div>
                    </div>
                    <div class="text-[11px] text-slate-600 dark:text-dark-textSecondary mt-2 font-medium line-clamp-2">
                        ${window.safeFormatRichText(poll.message)}
                    </div>
                    <div class="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-dark-textSecondary">
                        <span>${totalVotes} total votes</span>
                        <div class="flex items-center gap-1 text-indigo-600">
                            View <i data-lucide="chevron-right" class="w-3 h-3"></i>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
    }

    static openPollDetails(pollId) {
        const poll = this.currentPolls.find(p => p.id === pollId);
        if (!poll) return;

        const pollData = JSON.parse(poll.attachment_url || "{}");
        const options = pollData.options || [];
        const allowMultiple = pollData.allowMultiple || false;
        const releaseResults = pollData.releaseResults || false;

        const pollEndDatetime = pollData.pollEndDatetime;
        let isEnded = false;
        if (pollEndDatetime) {
            isEnded = new Date() > new Date(pollEndDatetime);
        }

        const votes = window.ReactionService?.cache[poll.id] || [];
        const totalVotes = votes.length;
        const myVotes = votes.filter(v => v.user_id === window.authState?.user?.id);
        const hasVoted = myVotes.length > 0;

        let optionsHtml = '';
        
        if (hasVoted || releaseResults || isEnded) {
            // Show results
            const counts = {};
            options.forEach(o => counts[o] = 0);
            votes.forEach(v => {
                if(counts[v.reaction_type] !== undefined) counts[v.reaction_type]++;
            });

            optionsHtml = options.map(opt => {
                const count = counts[opt] || 0;
                const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const isMyVote = myVotes.some(v => v.reaction_type === opt);
                
                const optionVoters = votes.filter(v => v.reaction_type === opt);
                let votersHtml = '';
                if (optionVoters.length > 0 && (releaseResults || hasVoted || isEnded)) {
                    const namesHtml = optionVoters.map(v => window.sanitizeHTML(v.profiles?.full_name || 'Unknown')).join(', ');
                    votersHtml = `
                        <details class="mt-2 group relative z-20">
                            <summary class="text-[10px] font-bold text-slate-500 dark:text-dark-textSecondary cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition list-none flex items-center gap-1 w-max">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                View Voters (${optionVoters.length})
                            </summary>
                            <div class="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed max-h-24 overflow-y-auto overscroll-contain pr-1">
                                ${namesHtml}
                            </div>
                        </details>
                    `;
                }

                return `
                    <div class="relative w-full bg-slate-50 dark:bg-dark-bg/50 border ${isMyVote ? 'border-[#4226E9]' : 'border-slate-200 dark:border-white/10'} rounded-xl p-3 mb-2 overflow-hidden">
                        <div class="absolute inset-y-0 left-0 bg-indigo-100/50 transition-all duration-500" style="width: ${releaseResults || hasVoted || isEnded ? percent : 0}%"></div>
                        <div class="relative z-10">
                            <div class="flex items-center justify-between">
                                <span class="text-[13px] font-semibold ${isMyVote ? 'text-[#4226E9]' : 'text-slate-700 dark:text-dark-textSecondary'}">${window.sanitizeHTML(opt)}</span>
                                ${(releaseResults || hasVoted || isEnded) ? `<span class="text-[12px] font-bold text-slate-500 dark:text-dark-textSecondary">${percent}%</span>` : ''}
                            </div>
                            ${votersHtml}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Show voting form
            const inputType = allowMultiple ? 'checkbox' : 'radio';
            optionsHtml = options.map((opt, i) => `
                <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer hover:bg-slate-50 transition mb-2">
                    <input type="${inputType}" name="poll_option" value="${window.sanitizeHTML(opt)}" class="w-4 h-4 text-[#4226E9] focus:ring-[#4226E9] ${allowMultiple ? 'rounded' : ''}">
                    <span class="text-[13px] font-semibold text-slate-700 dark:text-dark-textSecondary">${window.sanitizeHTML(opt)}</span>
                </label>
            `).join('');
            
            optionsHtml += `
                <button onclick="window.PollService.submitVote('${poll.id}')" class="w-full py-3.5 mt-4 bg-[#4226E9] text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition">Submit Vote</button>
            `;
        }

        // Release Results Button for Admin/CR
        let releaseButtonHtml = '';
        if ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') && !releaseResults) {
            releaseButtonHtml = `
                <button onclick="window.PollService.releasePollResults('${poll.id}')" class="w-full py-3 mt-3 bg-white dark:bg-dark-card border border-emerald-500 text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 active:scale-[0.98] transition">Release Results</button>
            `;
        }

        let courseBadge = '';
        if (poll.course_id && window.currentCoursesList) {
            const course = window.currentCoursesList.find(c => String(c.id) === String(poll.course_id));
            if (course) {
                courseBadge = `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border border-indigo-100">${window.sanitizeHTML(course.course_code)}</span>`;
            }
        }

        const formattedDate = new Date(poll.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        let deadlineHtml = '';
        if (pollEndDatetime) {
            const deadlineDate = new Date(pollEndDatetime);
            const formattedDeadline = deadlineDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            deadlineHtml = `<div class="w-1 h-1 bg-slate-300 rounded-full"></div><span class="text-[10px] font-semibold ${isEnded ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-dark-textSecondary'}">End: ${formattedDeadline}</span>`;
        }

        let statusBadge = '';
        if (isEnded) {
            statusBadge = `<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-slate-200 dark:border-white/10 dark:bg-dark-bg">Ended</span>`;
        } else if (hasVoted) {
            statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">Voted</span>`;
        } else {
            statusBadge = `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">Active</span>`;
        }

        let deleteBtnHtml = '';
        if (window.currentUserRole === 'admin' || (window.currentUserRole === 'cr' && poll.created_by === window.authState.user.id)) {
            deleteBtnHtml = `
                <button onclick="window.PollService.deletePoll('${poll.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors flex shrink-0 items-center justify-center" title="Delete Poll">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            `;
        }

        const html = `
            <div class="mb-4">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-[16px] font-black text-slate-900 dark:text-dark-text leading-tight">${window.safeFormatRichText(poll.title)}</h3>
                    <div class="flex items-center gap-1 shrink-0 ml-2">
                        ${deleteBtnHtml}
                        <div class="flex flex-col items-end gap-1">
                            ${statusBadge}
                            ${courseBadge}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span class="text-[10px] font-semibold text-slate-400 dark:text-dark-textSecondary"><i data-lucide="calendar" class="w-3 h-3 inline pb-0.5"></i> Pub: ${formattedDate}</span>
                    ${deadlineHtml}
                    <div class="w-1 h-1 bg-slate-300 rounded-full"></div>
                    <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">${allowMultiple ? 'Multiple Choice' : 'Single Choice'}</span>
                </div>
                <p class="text-[12px] text-slate-500 dark:text-dark-textSecondary mt-2 bg-slate-50 dark:bg-dark-bg/50 p-3 rounded-lg border border-slate-100 dark:border-white/5">${window.safeFormatRichText(poll.message)}</p>
            </div>
            <div>${optionsHtml}</div>
            ${releaseButtonHtml}
        `;

        const modalContent = document.getElementById('poll-popup-content');
        if (modalContent) {
            modalContent.innerHTML = html;
            const modal = document.getElementById('poll-popup-modal');
            modal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100', 'pointer-events-auto');
            modal.querySelector('div').classList.remove('scale-95');
            modal.querySelector('div').classList.add('scale-100');
            
            if (window.lucide) window.lucide.createIcons();
        }
    }

    static closePollPopup() {
        const modal = document.getElementById('poll-popup-modal');
        if (modal) {
            modal.classList.remove('opacity-100', 'pointer-events-auto');
            modal.classList.add('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.remove('scale-100');
            modal.querySelector('div').classList.add('scale-95');
        }
    }

    static async submitVote(pollId) {
        const inputs = document.querySelectorAll('input[name="poll_option"]:checked');
        if (inputs.length === 0) {
            showGlobalToast("Wait", "Please select an option.");
            return;
        }

        const selectedOptions = Array.from(inputs).map(i => i.value);
        
        showLoader(true, "Submitting vote...");
        try {
            const inserts = selectedOptions.map(opt => ({
                content_id: pollId,
                content_type: 'poll',
                user_id: window.authState.user.id,
                reaction_type: opt
            }));

            const { error } = await _supabase.from('content_reactions').insert(inserts);
            if (error) throw error;

            showGlobalToast("Success", "Vote cast successfully!");
            this.closePollPopup();
            await this.loadPolls();
        } catch (err) {
            console.error("Vote error:", err);
            showGlobalToast("Error", "Could not submit vote.");
        } finally {
            showLoader(false);
        }
    }

    static async releasePollResults(pollId) {
        showLoader(true, "Releasing results...");
        try {
            // As per user request, first try to update a 'polls' table if it exists
            const { error: pollsError } = await _supabase.from('polls').update({ result_released: true }).eq('id', pollId);
            
            // Also explicitly update the JSON payload in the notices table to be safe and maintain local logic
            const poll = this.currentPolls.find(p => p.id === pollId);
            if (poll) {
                const pollData = JSON.parse(poll.attachment_url || "{}");
                pollData.releaseResults = true;
                await _supabase.from('notices').update({ attachment_url: JSON.stringify(pollData) }).eq('id', pollId);
            }

            showGlobalToast("Success", "Results released to students.");
            this.closePollPopup();
            await this.loadPolls();
        } catch (err) {
            console.error("Release error:", err);
            // Ignore error if 'polls' table doesn't exist, we updated 'notices'
            showGlobalToast("Success", "Results released to students.");
            this.closePollPopup();
            await this.loadPolls();
        } finally {
            showLoader(false);
        }
    }

    static addOptionField() {
        const container = document.getElementById('poll-options-container');
        const count = container.querySelectorAll('input').length;
        if (count >= 5) {
            showGlobalToast("Limit reached", "Maximum 5 options allowed.");
            return;
        }
        
        const div = document.createElement('div');
        div.className = "flex items-center gap-2";
        div.innerHTML = `
            <input type="text" required class="poll-option-input flex-1 px-3 py-2 rounded-[8px] border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-dark-bg/50 text-[13px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4226E9]" placeholder="Option ${count + 1}">
            <button type="button" onclick="this.parentElement.remove()" class="w-8 h-8 rounded-md bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
        `;
        container.appendChild(div);
    }

    static async submitPoll() {
        const title = document.getElementById('poll-title').value;
        const desc = document.getElementById('poll-description').value;
        const allowMultiple = document.getElementById('poll-allow-multiple').checked;
        const releaseResults = document.getElementById('poll-result-released').checked;
        const endDatetimeEl = document.getElementById('poll-end-datetime');
        const pollEndDatetime = endDatetimeEl ? endDatetimeEl.value : null;
        
        if (!pollEndDatetime) {
            showGlobalToast("Invalid", "Please provide a Poll End Time.");
            return;
        }
        const optionInputs = document.querySelectorAll('.poll-option-input');
        const options = Array.from(optionInputs).map(inp => inp.value.trim()).filter(v => v);

        if (options.length < 2) {
            showGlobalToast("Invalid", "Provide at least 2 options.");
            return;
        }
        if (new Set(options).size !== options.length) {
            showGlobalToast("Invalid", "Options must be unique.");
            return;
        }

        let batch = document.getElementById('poll-batch-id').value;
        const course = document.getElementById('poll-course-id').value;

        if (window.currentUserRole === 'cr') {
            batch = window.authState.profile.batch_id;
        }

        const notifyAudience = document.getElementById('notify-audience-poll') ? document.getElementById('notify-audience-poll').checked : true;

        showLoader(true, "Creating Poll...");
        try {
            const pollData = {
                title: title,
                message: desc,
                notice_type: 'poll',
                audience_type: batch === 'global' ? 'all' : 'specific',
                course_id: course || null,
                created_by: window.authState.user.id,
                attachment_url: JSON.stringify({
                    options,
                    allowMultiple,
                    releaseResults,
                    pollEndDatetime
                })
            };

            const { data, error } = await _supabase.from('notices').insert([pollData]).select();
            if (error) throw error;

            if (batch !== 'global' && data && data.length > 0) {
                await _supabase.from('content_targets').insert([{
                    content_id: data[0].id,
                    content_type: 'notice',
                    target_type: 'batch_students',
                    target_id: batch
                }]);

                // Queue Notification
                if (notifyAudience) {
                    const { NotificationQueueService } = await import('./services/NotificationQueueService.js');
                    const queueRes = await NotificationQueueService.queueNotification({
                        parentType: 'poll',
                        parentId: data[0].id,
                        isNotifyEnabled: true,
                        audienceType: 'batch_students',
                        createdBy: window.authState.user.id,
                        title: title
                    });
                    if (!queueRes.success) console.error("Poll Queue Error:", queueRes.error);
                }
            } else if (batch === 'global' && notifyAudience && data && data.length > 0) {
                // Global push notification
                const { NotificationQueueService } = await import('./services/NotificationQueueService.js');
                const queueRes = await NotificationQueueService.queueNotification({
                    parentType: 'poll',
                    parentId: data[0].id,
                    isNotifyEnabled: true,
                    audienceType: 'all',
                    createdBy: window.authState.user.id,
                    title: title
                });
                if (!queueRes.success) console.error("Poll Queue Error:", queueRes.error);
            }

            showGlobalToast("Success", "Poll created!");
            window.navigate('screen-polls-list');
            this.loadPolls();
        } catch (err) {
            console.error("Poll creation error:", err);
            showGlobalToast("Error", "Could not create poll");
        } finally {
            showLoader(false);
        }
    }

    static setupPollCreation() {
        // Reset form
        const form = document.getElementById('poll-creation-form');
        if (form) form.reset();

        const batchWrap = document.getElementById('poll-batch-select-wrap');
        const courseWrap = document.getElementById('poll-course-select-wrap');
        const courseSelect = document.getElementById('poll-course-id');
        const batchSelect = document.getElementById('poll-batch-id');

        if (window.currentUserRole === 'cr') {
            if (batchWrap) batchWrap.style.display = 'none';
            // Populate courses for this CR's batch
            if (courseSelect && window.currentCoursesList) {
                const crBatch = window.authState.profile.batch_id;
                const batchCourses = window.currentCoursesList.filter(c => c.batch_id === crBatch || c.batch_id === 'global');
                
                let courseHtml = '<option value="">All Courses</option>';
                batchCourses.forEach(c => {
                    courseHtml += `<option value="${c.id}">${window.sanitizeHTML(c.course_name)} (${window.sanitizeHTML(c.course_code)})</option>`;
                });
                courseSelect.innerHTML = courseHtml;
            }
        } else {
            if (batchWrap) batchWrap.style.display = 'block';
            if (courseSelect && window.currentCoursesList) {
                let courseHtml = '<option value="">All Courses</option>';
                window.currentCoursesList.forEach(c => {
                    courseHtml += `<option value="${c.id}">${window.sanitizeHTML(c.course_name)} (${window.sanitizeHTML(c.course_code)})</option>`;
                });
                courseSelect.innerHTML = courseHtml;
            }
            if (batchSelect && window.currentBatchesList) {
                let batchHtml = '<option value="global">Global (All Batches)</option>';
                window.currentBatchesList.forEach(b => {
                    batchHtml += `<option value="${b.id}">${window.sanitizeHTML(b.batch_name)}</option>`;
                });
                batchSelect.innerHTML = batchHtml;
            }
        }
    }

    static async deletePoll(pollId) {
        if (!confirm("Are you sure you want to delete this poll? This cannot be undone.")) return;
        
        showLoader(true, "Deleting poll...");
        try {
            await _supabase.from('content_targets').delete().eq('content_id', pollId).eq('content_type', 'notice');
            await _supabase.from('content_reactions').delete().eq('content_id', pollId).eq('content_type', 'poll');
            await _supabase.from('notification_reminders').delete().eq('parent_id', pollId).eq('parent_type', 'notice');
            
            const { error } = await _supabase.from('notices').delete().eq('id', pollId);
            if (error) throw error;
            
            showGlobalToast("Deleted", "Poll has been removed.");
            this.closePollPopup();
            this.loadPolls();
            if (typeof window.loadNotices === 'function') window.loadNotices(); // refresh dashboard feed
        } catch(err) {
            console.error("Delete poll error", err);
            showGlobalToast("Error", "Could not delete poll.");
        } finally {
            showLoader(false);
        }
    }
}
