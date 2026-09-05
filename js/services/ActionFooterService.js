// ActionFooterService.js - Reusable Responsive Layout for Content Card Footers

export class ActionFooterService {
    static COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown
    static _activeConfirmData = null;

    /**
     * Checks how many milliseconds of cooldown remain for a content item.
     */
    static getCooldownRemaining(contentType, contentId) {
        try {
            const key = `mct_notify_cd_${contentType}_${contentId}`;
            const exp = parseInt(localStorage.getItem(key), 10);
            if (!exp || isNaN(exp)) return 0;
            const remaining = exp - Date.now();
            if (remaining <= 0) {
                localStorage.removeItem(key);
                return 0;
            }
            return remaining;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Sets a 5-minute notification cooldown for a content item.
     */
    static setCooldown(contentType, contentId) {
        try {
            const key = `mct_notify_cd_${contentType}_${contentId}`;
            localStorage.setItem(key, String(Date.now() + this.COOLDOWN_MS));
        } catch (e) {}
    }

    /**
     * Clears cooldown (e.g. if notification dispatch failed).
     */
    static clearCooldown(contentType, contentId) {
        try {
            const key = `mct_notify_cd_${contentType}_${contentId}`;
            localStorage.removeItem(key);
            this.restoreButtonFromCooldown(contentId);
        } catch (e) {}
    }

    /**
     * Resolves the title of an item by type and ID.
     */
    static getItemTitle(contentType, contentId) {
        try {
            if (contentType === 'notice' || contentType === 'poll') {
                const n = (window.currentNoticesList || []).find(x => x.id === contentId)
                       || (window.allPollsList || []).find(x => x.id === contentId);
                if (n && n.title) return n.title;
            }
            if (contentType === 'schedule') {
                const s = (window.currentSchedulesList || []).find(x => x.id === contentId);
                if (s && s.title) return s.title;
            }
            if (contentType === 'material') {
                const m = (window.currentMaterialsList || []).find(x => x.id === contentId);
                if (m && m.title) return m.title;
            }
            const card = document.getElementById(`notice-card-${contentId}`)
                      || document.querySelector(`[data-seen-id="${contentId}"]`)
                      || document.querySelector(`[data-content-id="${contentId}"]`);
            if (card) {
                const h = card.querySelector('h3, h4, .card-title');
                if (h && h.innerText.trim()) return h.innerText.trim();
            }
        } catch (e) {}
        return 'this update';
    }

    /**
     * Opens the Confirmation Modal:
     * "Are you sure to notify this message - "{Title}" to its selected audience?"
     */
    static openNotifyConfirmModal(contentType, contentId, title, btnEl) {
        this.ensureModalsInDOM();
        const modal = document.getElementById('modal-notify-confirm');
        if (!modal) return;

        const titleEl = document.getElementById('notify-confirm-title');
        if (titleEl) {
            titleEl.textContent = title || 'this update';
        }

        this._activeConfirmData = { contentType, contentId, title, btnEl };

        const yesBtn = document.getElementById('notify-confirm-yes-btn');
        if (yesBtn) {
            yesBtn.onclick = (e) => {
                e.stopPropagation();
                this.executeNotify(contentType, contentId, title, btnEl);
            };
        }

        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
    }

    static closeNotifyConfirmModal() {
        const modal = document.getElementById('modal-notify-confirm');
        if (modal) modal.classList.add('hidden');
        this._activeConfirmData = null;
    }

    /**
     * Opens the Warning Modal when clicked during the 5-minute cooldown:
     * "You already notified this update and cant re notify its audience for the next 5 minute."
     */
    static openNotifyWarningModal(remainingMs) {
        this.ensureModalsInDOM();
        const modal = document.getElementById('modal-notify-warning');
        if (!modal) return;

        const countdownEl = document.getElementById('notify-warning-countdown');
        if (countdownEl) {
            const mins = Math.floor(remainingMs / 60000);
            const secs = Math.floor((remainingMs % 60000) / 1000);
            countdownEl.textContent = mins > 0 
                ? `Please wait ${mins}m ${secs}s before re-notifying.`
                : `Please wait ${secs}s before re-notifying.`;
        }

        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
    }

    static closeNotifyWarningModal() {
        const modal = document.getElementById('modal-notify-warning');
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Main handler for the notify button click.
     */
    static handleNotifyClick(contentType, contentId, btnEl, explicitTitle = '') {
        const remaining = this.getCooldownRemaining(contentType, contentId);
        if (remaining > 0) {
            this.openNotifyWarningModal(remaining);
            return;
        }

        const title = explicitTitle || btnEl?.getAttribute('data-title') || this.getItemTitle(contentType, contentId);
        this.openNotifyConfirmModal(contentType, contentId, title, btnEl);
    }

    /**
     * Executes notification when user confirms "Yes".
     */
    static async executeNotify(contentType, contentId, title, btnEl) {
        this.closeNotifyConfirmModal();

        // 1. Immediately set 5-minute cooldown in localStorage
        this.setCooldown(contentType, contentId);

        // 2. Gray out button in DOM immediately
        this.updateButtonToCooldown(contentId);

        // 3. Dispatch notification
        try {
            if (contentType === 'poll') {
                if (window.PollService && typeof window.PollService.notifyPoll === 'function') {
                    await window.PollService.notifyPoll(contentId, true /* skip browser confirm */);
                }
            } else {
                if (typeof window.triggerImmediateNotification === 'function') {
                    await window.triggerImmediateNotification(contentType, contentId, btnEl);
                }
            }
        } catch (err) {
            console.error('[NOTIFY EXECUTE ERROR]', err);
            this.clearCooldown(contentType, contentId);
        }
    }

    /**
     * Grays out all matching buttons for this content in the DOM.
     */
    static updateButtonToCooldown(contentId) {
        const buttons = document.querySelectorAll(`[data-content-id="${contentId}"].notify-btn, #notify-btn-${contentId}`);
        buttons.forEach(btn => {
            btn.classList.remove('bg-[#4226E9]', 'hover:bg-[#341BC5]', 'text-white');
            btn.classList.add('bg-slate-200', 'dark:bg-white/10', 'hover:bg-slate-300', 'dark:hover:bg-white/15', 'text-slate-400', 'dark:text-slate-500', 'cursor-not-allowed');
            btn.setAttribute('title', 'You already notified this update (5 min cooldown)');
            btn.setAttribute('data-cooldown', 'true');
            const span = btn.querySelector('span');
            if (span) span.textContent = 'Notified';
        });
    }

    /**
     * Restores buttons to active purple state after cooldown expires.
     */
    static restoreButtonFromCooldown(contentId) {
        const buttons = document.querySelectorAll(`[data-content-id="${contentId}"].notify-btn, #notify-btn-${contentId}`);
        buttons.forEach(btn => {
            btn.classList.remove('bg-slate-200', 'dark:bg-white/10', 'hover:bg-slate-300', 'dark:hover:bg-white/15', 'text-slate-400', 'dark:text-slate-500', 'cursor-not-allowed');
            btn.classList.add('bg-[#4226E9]', 'hover:bg-[#341BC5]', 'text-white');
            btn.setAttribute('title', 'Send Push Notification Reminder');
            btn.setAttribute('data-cooldown', 'false');
            const span = btn.querySelector('span');
            if (span) span.textContent = 'Notify';
        });
    }

    /**
     * Ensures confirmation and warning modals exist in the DOM.
     */
    static ensureModalsInDOM() {
        if (!document.getElementById('modal-notify-confirm')) {
            const div = document.createElement('div');
            div.id = 'modal-notify-confirm';
            div.className = 'fixed inset-0 z-[120] flex items-center justify-center hidden';
            div.innerHTML = `
                <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="window.ActionFooterService.closeNotifyConfirmModal()"></div>
                <div class="bg-white dark:bg-dark-card rounded-[24px] w-[90%] max-w-[360px] p-6 shadow-2xl relative z-10 flex flex-col border border-slate-100 dark:border-white/10 text-center animate-slide-up">
                    <div class="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-[#4226E9] flex items-center justify-center mx-auto mb-3.5">
                        <i data-lucide="bell" class="w-6 h-6"></i>
                    </div>
                    <h3 class="text-[17px] font-black text-slate-900 dark:text-dark-text tracking-tight mb-2">Confirm Notification</h3>
                    <p class="text-[13px] text-slate-600 dark:text-dark-textSecondary font-medium mb-6 leading-relaxed">
                        Are you sure to notify this message - "<span id="notify-confirm-title" class="font-bold text-slate-900 dark:text-dark-text"></span>" to its selected audience?
                    </p>
                    <div class="flex items-center gap-3 w-full">
                        <button type="button" onclick="window.ActionFooterService.closeNotifyConfirmModal()" class="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-[13px] font-bold text-slate-600 dark:text-dark-textSecondary hover:bg-slate-50 dark:hover:bg-white/5 transition-colors active:scale-95">
                            No
                        </button>
                        <button type="button" id="notify-confirm-yes-btn" class="flex-1 py-3 px-4 rounded-xl bg-[#4226E9] hover:bg-[#341BC5] text-white text-[13px] font-bold transition-all shadow-md shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-1.5">
                            <i data-lucide="send" class="w-3.5 h-3.5"></i> Yes
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
        }

        if (!document.getElementById('modal-notify-warning')) {
            const div = document.createElement('div');
            div.id = 'modal-notify-warning';
            div.className = 'fixed inset-0 z-[120] flex items-center justify-center hidden';
            div.innerHTML = `
                <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="window.ActionFooterService.closeNotifyWarningModal()"></div>
                <div class="bg-white dark:bg-dark-card rounded-[24px] w-[90%] max-w-[360px] p-6 shadow-2xl relative z-10 flex flex-col border border-slate-100 dark:border-white/10 text-center animate-slide-up">
                    <div class="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-500 flex items-center justify-center mx-auto mb-3.5">
                        <i data-lucide="alert-circle" class="w-6 h-6"></i>
                    </div>
                    <h3 class="text-[17px] font-black text-slate-900 dark:text-dark-text tracking-tight mb-2">Notification Cooldown</h3>
                    <p class="text-[13px] text-slate-600 dark:text-dark-textSecondary font-medium mb-2 leading-relaxed">
                        You already notified this update and cant re notify its audience for the next 5 minute.
                    </p>
                    <p id="notify-warning-countdown" class="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-6"></p>
                    <button type="button" onclick="window.ActionFooterService.closeNotifyWarningModal()" class="w-full py-3 px-4 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-800 dark:text-dark-text text-[13px] font-bold transition-colors active:scale-95">
                        Got it
                    </button>
                </div>
            `;
            document.body.appendChild(div);
        }
    }

    /**
     * Renders a unified responsive footer for content cards.
     * Layout:
     * - Date + Time: Centered
     * - Action Row (Strictly 1 Single Row):
     *   * Left: Reaction icon + Reaction number (left-aligned)
     *   * Center: Comment button + count (centered with the post)
     *   * Right: Seen list + Notify button (right-aligned with the post, or just Seen list if not CR/admin)
     */
    static renderFooter({
        contentType = 'notice',
        contentId = '',
        title = '',
        dateStr = '',
        timeStr = '',
        isAdminOrCR = false,
        showComments = true,
        showReactions = true,
        showSeen = true,
        metadataHtml = ''
    } = {}) {
        if (!contentId) return '';

        // 1. Date & Time Row (Centered horizontally)
        let dateTimeRow = '';
        if (dateStr || timeStr || metadataHtml) {
            dateTimeRow = `
                <div class="metadata-row w-full flex justify-center items-center flex-wrap gap-2 mt-2.5 mb-2.5 min-w-0" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px;">
                    ${dateStr ? `<span class="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-[11px] whitespace-nowrap font-medium text-slate-600 dark:text-dark-textSecondary" style="display: inline-flex; align-items: center; gap: 6px;"><i data-lucide="calendar" class="w-3.5 h-3.5 text-[#4226E9]"></i> ${dateStr}</span>` : ''}
                    ${timeStr ? `<span class="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-[11px] whitespace-nowrap font-medium text-slate-600 dark:text-dark-textSecondary" style="display: inline-flex; align-items: center; gap: 6px;"><i data-lucide="clock" class="w-3.5 h-3.5 text-[#4226E9]"></i> ${timeStr}</span>` : ''}
                    ${metadataHtml ? `<div class="flex items-center min-w-0">${metadataHtml}</div>` : ''}
                </div>
            `;
        }

        // Database content type mapping (polls store reactions/seen under 'notice')
        const dbType = contentType === 'poll' ? 'notice' : contentType;

        // 2. Action Controls
        const reactionHtml = (showReactions && window.ReactionService && typeof window.ReactionService.renderReactionBlock === 'function') 
            ? window.ReactionService.renderReactionBlock(dbType, contentId) 
            : '';
        const commentHtml = (showComments && window.CommentService && typeof window.CommentService.renderCommentCountButton === 'function') 
            ? window.CommentService.renderCommentCountButton(dbType, contentId) 
            : '';
        const seenHtml = (showSeen && window.SeenService && typeof window.SeenService.renderSeenBlock === 'function') 
            ? window.SeenService.renderSeenBlock(dbType, contentId) 
            : '';
        
        let notifyHtml = '';
        if (isAdminOrCR) {
            const isCooldown = ActionFooterService.getCooldownRemaining(contentType, contentId) > 0;
            const safeTitle = (title || '').replace(/"/g, '&quot;');
            
            const btnBg = isCooldown 
                ? 'bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-[#4226E9] hover:bg-[#341BC5] text-white';
            const btnText = isCooldown ? 'Notified' : 'Notify';
            const btnTitle = isCooldown ? 'You already notified this update (5 min cooldown)' : 'Send Push Notification Reminder';

            notifyHtml = `
                <button type="button" 
                    id="notify-btn-${contentId}"
                    data-content-type="${contentType}"
                    data-content-id="${contentId}"
                    data-title="${safeTitle}"
                    data-cooldown="${isCooldown ? 'true' : 'false'}"
                    onclick="event.stopPropagation(); window.ActionFooterService.handleNotifyClick('${contentType}', '${contentId}', this)" 
                    class="notify-btn w-[28px] h-[28px] p-0 ${btnBg} rounded-[8px] text-[10px] font-bold transition-colors flex items-center justify-center shrink-0 shadow-sm" 
                    style="display: inline-flex; align-items: center; justify-content: center;" 
                    title="${btnTitle}">
                    <i data-lucide="bell" class="w-3.5 h-3.5"></i>
                </button>
            `;
        }

        // 3. Action Row: Strictly 1 single row using flexbox space-between
        // Left: Reaction (justify-start)
        // Center: Comment (justify-center)
        // Right: Seen + Notify (justify-end)
        const actionRow = `
            <div class="action-row w-full flex items-center justify-between min-w-0 pt-1" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; justify-content: space-between !important; align-items: center !important; width: 100% !important;">
                <div class="action-col-left shrink-0 min-w-0" style="display: flex !important; align-items: center !important; justify-content: flex-start !important; flex-shrink: 0 !important;">
                    ${reactionHtml}
                </div>
                <div class="action-col-center shrink-0 min-w-0" style="display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important; margin: 0 4px;">
                    ${commentHtml}
                </div>
                <div class="action-col-right shrink-0 min-w-0" style="display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 8px !important; flex-shrink: 0 !important;">
                    ${seenHtml}
                    ${notifyHtml}
                </div>
            </div>
        `;

        return `
            <div class="card-footer w-full flex flex-col items-center mt-2 pt-2 border-t border-slate-100 dark:border-white/5 min-w-0" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
                ${dateTimeRow}
                ${actionRow}
            </div>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.ActionFooterService = ActionFooterService;
}
