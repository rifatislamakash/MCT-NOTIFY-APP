// ActionFooterService.js - Reusable Responsive Layout for Content Card Footers

export class ActionFooterService {
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
            // Icon-only on mobile screens (p-1.5), with text on sm: screens to fit neatly in 1 single row
            notifyHtml = `
                <button type="button" onclick="event.stopPropagation(); if(typeof triggerImmediateNotification === 'function' && '${contentType}' !== 'poll') { triggerImmediateNotification('${contentType}', '${contentId}', this); } else if(typeof window.PollService !== 'undefined' && window.PollService.notifyPoll) { window.PollService.notifyPoll('${contentId}'); }" class="p-1.5 sm:px-2.5 sm:py-1.5 bg-[#4226E9] hover:bg-[#341BC5] text-white rounded-[8px] text-[10px] sm:text-[11px] font-bold transition-colors flex items-center justify-center gap-1 shrink-0 shadow-sm" style="display: inline-flex; align-items: center; justify-content: center;" title="Send Push Notification Reminder">
                    <i data-lucide="bell" class="w-3.5 h-3.5"></i> <span class="hidden sm:inline">Notify</span>
                </button>
            `;
        }

        // 3. Action Row: Strictly 1 single row using flexbox space-between
        // Left: Reaction (justify-start)
        // Center: Comment (justify-center)
        // Right: Seen + Notify (justify-end)
        const actionRow = `
            <div class="action-row w-full flex items-center justify-between min-w-0 pt-1" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; justify-content: space-between !important; align-items: center !important; width: 100% !important; gap: 4px;">
                <div class="action-col-left min-w-0" style="flex: 1 1 0% !important; display: flex !important; align-items: center !important; justify-content: flex-start !important; min-width: 0;">
                    ${reactionHtml}
                </div>
                <div class="action-col-center min-w-0 shrink-0" style="display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important; margin: 0 4px;">
                    ${commentHtml}
                </div>
                <div class="action-col-right min-w-0" style="flex: 1 1 0% !important; display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 6px !important; min-width: 0;">
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
