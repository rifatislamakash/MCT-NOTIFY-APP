import { _supabase } from '../supabase-client.js';
import { showGlobalToast } from '../utils.js';
import { NotificationQueueService } from './NotificationQueueService.js';

export class CommentService {
    static async loadComments(contentType, contentId) {
        try {
            console.log(`[COMMENTS LOAD] Fetching for ${contentType}:${contentId}`);
            const { data, error } = await _supabase
                .from('comments')
                .select(`id, created_at, updated_at, user_id, content_type, content_id, comment_text, parent_comment_id, is_pinned, is_deleted, edited_at, profiles ( full_name, profile_url )`)
                .eq('content_type', contentType)
                .eq('content_id', contentId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: true });
            if (error) throw error;
            const topLevel = [];
            const repliesMap = {}; 
            (data || []).forEach(comment => {
                comment.replies = [];
                if (comment.parent_comment_id) {
                    if (!repliesMap[comment.parent_comment_id]) repliesMap[comment.parent_comment_id] = [];
                    repliesMap[comment.parent_comment_id].push(comment);
                } else {
                    topLevel.push(comment);
                }
            });
            topLevel.forEach(comment => {
                if (repliesMap[comment.id]) comment.replies = repliesMap[comment.id];
            });
            return topLevel;
        } catch (err) {
            console.error('[COMMENTS LOAD FAILURE]', err);
            throw err;
        }
    }

    static async createComment(contentType, contentId, commentText, parentCommentId = null) {
        try {
            const user = window.authState?.user;
            if (!user) throw new Error("Not authenticated");
            
            const words = commentText.trim().split(/\s+/).length;
            if (words > 2000) {
                throw new Error("Comment exceeds the 2000 word limit.");
            }

            console.log(`[COMMENT CREATE] ${parentCommentId ? 'Reply' : 'Top-level'}`);
            const payload = {
                user_id: user.id,
                content_type: contentType,
                content_id: contentId,
                comment_text: commentText.trim(),
                parent_comment_id: parentCommentId
            };
            const { data, error } = await _supabase.from('comments').insert([payload]).select('*, profiles (full_name, profile_url)').single();
            if (error) {
                if (error.message && error.message.includes('hourly commenting limit')) {
                    throw new Error("You have reached your hourly commenting limit (15) for this post.");
                }
                throw error;
            }
            console.log(`[COMMENT CREATE SUCCESS] ID: ${data.id}`);
            
            // Queue notification in background (don't block UI)
            this.triggerCommentNotification(data, user.id).catch(e => console.error('[COMMENT NOTIFICATION QUEUE FAILURE]', e));
            
            return data;
        } catch (err) {
            console.error('[COMMENT CREATE FAILURE]', err);
            throw err;
        }
    }

    static async updateComment(commentId, newText) {
        try {
            console.log(`[COMMENT UPDATE] ID: ${commentId}`);
            
            const words = newText.trim().split(/\s+/).length;
            if (words > 2000) throw new Error("Comment exceeds the 2000 word limit.");
            
            const { data, error } = await _supabase.from('comments').update({ 
                comment_text: newText.trim(), 
                updated_at: new Date().toISOString(),
                edited_at: new Date().toISOString()
            }).eq('id', commentId).select('*, profiles (full_name, profile_url)').single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('[COMMENT UPDATE FAILURE]', err);
            throw err;
        }
    }

    static async deleteComment(commentId) {
        try {
            console.log(`[COMMENT DELETE] ID: ${commentId}`);
            const { error } = await _supabase.rpc('delete_comment_v2', { p_comment_id: commentId });
            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[COMMENT DELETE FAILURE]', err);
            throw err;
        }
    }

    static async pinComment(commentId, pinStatus) {
        try {
            console.log(`[COMMENT PIN] ID: ${commentId} Status: ${pinStatus}`);
            const { error } = await _supabase.rpc('pin_comment', { p_comment_id: commentId, p_pin: pinStatus });
            if (error) {
                if (error.message && error.message.includes('Maximum of 3')) {
                    throw new Error("Maximum of 3 pinned comments allowed per update.");
                }
                throw error;
            }
            return true;
        } catch (err) {
            console.error('[COMMENT PIN FAILURE]', err);
            throw err;
        }
    }

    static async togglePostComments(contentType, contentId, allow) {
        try {
            console.log(`[TOGGLE COMMENTS] ${contentType}:${contentId} -> allow: ${allow}`);
            const { error } = await _supabase.rpc('toggle_post_comments', { 
                p_content_type: contentType, 
                p_content_id: contentId, 
                p_allow: allow 
            });
            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[TOGGLE COMMENTS FAILURE]', err);
            throw err;
        }
    }


    static async triggerCommentNotification(commentData, currentUserId) {
        try {
            console.log(`[COMMENT NOTIFICATION] Initiating server-authoritative queue for ${commentData.id}`);

            const isReply = !!commentData.parent_comment_id;
            const actorName = commentData.profiles?.full_name || window.authState?.profile?.full_name || 'Someone';
            
            // Fetch content title for notification text
            let contentTitle = 'Update';
            try {
                const table = commentData.content_type === 'schedule' ? 'schedules' : (commentData.content_type === 'notice' ? 'notices' : null);
                if (table) {
                    const { data: contentDataRec } = await _supabase.from(table).select('title').eq('id', commentData.content_id).single();
                    if (contentDataRec && contentDataRec.title) {
                        contentTitle = contentDataRec.title;
                    }
                }
            } catch(e) {
                console.warn('[COMMENT TITLE FETCH ERR]', e);
            }
            
            let titleStr = isReply 
                ? `${actorName} replied to you - ${contentTitle}` 
                : `${actorName} commented on your ${commentData.content_type} - ${contentTitle}`;

            const result = await NotificationQueueService.queueNotification({
                parentType: 'comment_reply',
                parentId: commentData.id,
                isNotifyEnabled: true,
                createdBy: currentUserId,
                audienceType: 'server_authoritative',
                title: titleStr,
                message: commentData.comment_text
            });
            
            if (result.success && !result.skipped) {
                console.log(`[COMMENT NOTIFICATION QUEUED] Successfully requested background notification.`);
            } else if (result.skipped) {
                console.log(`[COMMENT NOTIFICATION DEDUP] ${result.reason}`);
            }

        } catch (err) {
            console.error('[COMMENT NOTIFICATION FAILURE]', err);
        }
    }

    static renderCommentsSection(containerId, contentType, contentId, authorId = null, allowComments = true) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const isMod = window.currentUserRole === 'admin' || window.currentUserRole === 'cr' || window.authState?.user?.id === authorId;
        const toggleBtn = isMod ? 
            `<button onclick="window.CommentService.togglePostComments('${contentType}', '${contentId}', ${!allowComments})" class="text-[11px] font-bold ${allowComments ? 'text-red-500' : 'text-green-500'} bg-slate-50 dark:bg-dark-surface px-2 py-1 rounded border border-slate-200 dark:border-white/10 hover:opacity-80">
                ${allowComments ? 'Lock Comments' : 'Unlock Comments'}
            </button>` : '';

        const inputHtml = allowComments ? `
            <div class="flex gap-3 mt-4">
                <img src="${window.sanitizeUrl(window.authState?.profile?.profile_url) || 'assets/profilefill.png'}" class="w-12 h-12 aspect-square rounded-full overflow-hidden object-cover object-center shrink-0 self-start" style="min-width: 48px; max-width: 48px; height: 48px; min-height: 48px;" onerror="this.src='assets/profilefill.png'">
                <div class="flex-1 relative">
                    <textarea id="comment-input-${contentId}" rows="1" class="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-white/10 rounded-[12px] px-3 py-2 text-[13px] text-slate-800 dark:text-dark-text focus:outline-none focus:border-[#4226E9] resize-none overflow-hidden block" placeholder="Write a comment... (Max 2000 words)" oninput="this.style.height = '';this.style.height = this.scrollHeight + 'px'"></textarea>
                    <button id="comment-submit-${contentId}" onclick="window.CommentService.submitTopComment('${contentType}', '${contentId}')" class="absolute right-3 bottom-2 text-[#4226E9] font-bold text-[13px] hover:opacity-80">Send</button>
                </div>
            </div>
        ` : `<div class="text-[12px] text-center text-slate-500 dark:text-dark-textSecondary mt-4 italic">Comments are turned off for this post.</div>`;

        container.innerHTML = `
            <div class="mt-6 border-t border-slate-100 dark:border-white/5 pt-4">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-[14px] text-slate-800 dark:text-dark-text">Comments</h3>
                    ${toggleBtn}
                </div>
                <div id="comments-list-${contentId}" class="flex flex-col gap-4 mb-4">
                    <div class="animate-pulse flex items-center gap-3">
                        <div class="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                        <div class="flex-1 h-10 bg-slate-200 dark:bg-slate-700 rounded-[12px]"></div>
                    </div>
                </div>
                ${inputHtml}
            </div>
        `;
        this.refreshCommentsList(contentType, contentId, authorId, allowComments);
    }

    static async refreshCommentsList(contentType, contentId, authorId = null, allowComments = true) {
        const listEl = document.getElementById(`comments-list-${contentId}`);
        if (!listEl) return;
        try {
            const comments = await this.loadComments(contentType, contentId);
            if (comments.length === 0) {
                listEl.innerHTML = `<div class="text-[13px] text-slate-500 dark:text-dark-textSecondary text-center py-4">No comments yet.</div>`;
                return;
            }
            listEl.innerHTML = '';
            comments.forEach(c => {
                listEl.appendChild(this.buildCommentElement(c, contentType, contentId, authorId, allowComments));
            });
        } catch (e) {
            listEl.innerHTML = `<div class="text-[13px] text-red-500 text-center py-4">Comments couldn't be loaded. <button onclick="window.CommentService.refreshCommentsList('${contentType}', '${contentId}', '${authorId}', ${allowComments})" class="underline">Retry</button></div>`;
        }
    }

    static buildCommentElement(comment, contentType, contentId, authorId = null, allowComments = true) {
        const div = document.createElement('div');
        div.className = 'flex gap-3';
        div.id = `comment-${comment.id}`;
        const avatar = comment.profiles?.profile_url ? window.sanitizeUrl(comment.profiles.profile_url) : 'assets/profilefill.png';
        const name = comment.profiles?.full_name || 'Unknown User';
        const isMine = comment.user_id === window.authState?.user?.id;
        const isMod = window.currentUserRole === 'admin' || window.currentUserRole === 'cr' || window.authState?.user?.id === authorId;
        const canDelete = isMine || isMod;
        
        let pinnedBadge = comment.is_pinned ? `<span class="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] px-1.5 py-0.5 rounded ml-1 font-bold inline-flex items-center gap-1"><i data-lucide="pin" class="w-3 h-3"></i> Pinned</span>` : '';
        let editedBadge = comment.edited_at && !comment.is_deleted ? `<span class="text-[10px] text-slate-400 font-normal ml-1">(edited)</span>` : '';

        let repliesHtml = '';
        if (comment.replies && comment.replies.length > 0) {
            repliesHtml = `<div class="flex flex-col gap-3 mt-3">` + comment.replies.map(reply => {
                const rAvatar = reply.profiles?.profile_url ? window.sanitizeUrl(reply.profiles.profile_url) : 'assets/profilefill.png';
                const rName = reply.profiles?.full_name || 'Unknown User';
                const rIsMine = reply.user_id === window.authState?.user?.id;
                const rCanDelete = rIsMine || isMod;
                const rEdited = reply.edited_at && !reply.is_deleted ? `<span class="text-[10px] text-slate-400 font-normal ml-1">(edited)</span>` : '';
                
                return `
                <div class="flex gap-2" id="comment-${reply.id}">
                    <img src="${rAvatar}" class="w-10 h-10 aspect-square rounded-full overflow-hidden object-cover object-center shrink-0 self-start mt-1" style="min-width: 40px; max-width: 40px; height: 40px; min-height: 40px;" onerror="this.src='assets/profilefill.png'">
                    <div class="flex-1 min-w-0">
                        <div class="bg-slate-50 dark:bg-dark-surface rounded-[12px] px-3 py-2 border border-slate-100 dark:border-white/5 inline-block min-w-[50%] max-w-full">
                            <span class="block font-bold text-[12px] text-slate-800 dark:text-dark-text leading-none mb-1">${window.sanitizeHTML(rName)}</span>
                            <span class="block text-[13px] break-words ${reply.is_deleted ? 'italic text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-dark-text'}" id="text-${reply.id}"></span>
                        </div>
                        <div class="flex items-center gap-3 px-2 mt-1">
                            <span class="text-[10px] text-slate-400 font-medium">${this.timeAgo(reply.created_at)} ${rEdited}</span>
                            ${!reply.is_deleted && rIsMine ? `<button onclick="window.CommentService.editComment('${reply.id}')" class="text-[10px] text-slate-500 font-bold hover:text-[#4226E9]">Edit</button>` : ''}
                            ${!reply.is_deleted && rCanDelete ? `<button onclick="window.CommentService.deleteCommentPrompt('${reply.id}', '${contentType}', '${contentId}')" class="text-[10px] text-red-400 font-bold hover:text-red-600">Delete</button>` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('') + `</div>`;
        }
        div.innerHTML = `
            <img src="${avatar}" class="w-12 h-12 aspect-square rounded-full overflow-hidden object-cover object-center shrink-0 self-start mt-1" style="min-width: 48px; max-width: 48px; height: 48px; min-height: 48px;" onerror="this.src='assets/profilefill.png'">
            <div class="flex-1 min-w-0">
                <div class="bg-slate-50 dark:bg-dark-surface rounded-[14px] px-3 py-2 border border-slate-100 dark:border-white/5 inline-block min-w-[50%] max-w-full relative">
                    <span class="flex items-center font-bold text-[13px] text-slate-800 dark:text-dark-text leading-none mb-1">${window.sanitizeHTML(name)} ${pinnedBadge}</span>
                    <span class="block text-[14px] break-words ${comment.is_deleted ? 'italic text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-dark-text'}" id="text-${comment.id}"></span>
                </div>
                <div class="flex items-center gap-3 px-2 mt-1">
                    <span class="text-[11px] text-slate-400 font-medium">${this.timeAgo(comment.created_at)} ${editedBadge}</span>
                    ${!comment.is_deleted && allowComments ? `<button onclick="window.CommentService.showReplyInput('${comment.id}')" class="text-[11px] text-slate-500 font-bold hover:text-[#4226E9]">Reply</button>` : ''}
                    ${!comment.is_deleted && isMine ? `<button onclick="window.CommentService.editComment('${comment.id}')" class="text-[11px] text-slate-500 font-bold hover:text-[#4226E9]">Edit</button>` : ''}
                    ${!comment.is_deleted && isMod ? `<button onclick="window.CommentService.pinComment('${comment.id}', ${!comment.is_pinned}).then(()=>window.CommentService.refreshCommentsList('${contentType}','${contentId}','${authorId}',${allowComments}))" class="text-[11px] text-slate-500 font-bold hover:text-indigo-500">${comment.is_pinned ? 'Unpin' : 'Pin'}</button>` : ''}
                    ${!comment.is_deleted && canDelete ? `<button onclick="window.CommentService.deleteCommentPrompt('${comment.id}', '${contentType}', '${contentId}')" class="text-[11px] text-red-400 font-bold hover:text-red-600">Delete</button>` : ''}
                </div>
                ${repliesHtml}
                <div id="reply-container-${comment.id}" class="hidden mt-3 pl-2 border-l-2 border-slate-100 dark:border-white/5">
                    <div class="flex gap-2">
                        <img src="${window.sanitizeUrl(window.authState?.profile?.profile_url) || 'assets/profilefill.png'}" class="w-10 h-10 aspect-square rounded-full overflow-hidden object-cover object-center shrink-0 self-start" style="min-width: 40px; max-width: 40px; height: 40px; min-height: 40px;" onerror="this.src='assets/profilefill.png'">
                        <div class="flex-1 relative">
                            <textarea id="reply-input-${comment.id}" rows="1" class="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-white/10 rounded-[12px] px-3 py-2 pr-12 text-[12px] text-slate-800 dark:text-dark-text focus:outline-none focus:border-[#4226E9] resize-none overflow-hidden block" placeholder="Write a reply... (Max 2000 words)" oninput="this.style.height = '';this.style.height = this.scrollHeight + 'px'"></textarea>
                            <button id="reply-submit-${comment.id}" onclick="window.CommentService.submitReply('${comment.id}', '${contentType}', '${contentId}')" class="absolute right-3 bottom-2 text-[#4226E9] font-bold text-[12px] hover:opacity-80">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons({root: div});
            const el = div.querySelector(`#text-${comment.id}`);
            if (el) el.textContent = comment.is_deleted ? 'Deleted comment' : comment.comment_text;
            if (comment.replies) {
                comment.replies.forEach(r => {
                    const rEl = div.querySelector(`#text-${r.id}`);
                    if (rEl) rEl.textContent = r.is_deleted ? 'Deleted comment' : r.comment_text;
                });
            }
        }, 0);
        return div;
    }

    static async submitTopComment(contentType, contentId) {
        const input = document.getElementById(`comment-input-${contentId}`);
        const btn = document.getElementById(`comment-submit-${contentId}`);
        if (!input || !btn) return;
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-pulse">...</span>`;
        try {
            await this.createComment(contentType, contentId, text, null);
            input.value = '';
            input.style.height = '';
            await this.refreshCommentsList(contentType, contentId);
        } catch (e) {
            showGlobalToast("Error", "Could not post comment.");
        } finally {
            input.disabled = false;
            btn.disabled = false;
            btn.innerHTML = `Send`;
        }
    }

    static showReplyInput(commentId) {
        const container = document.getElementById(`reply-container-${commentId}`);
        if (container) {
            container.classList.remove('hidden');
            const input = document.getElementById(`reply-input-${commentId}`);
            if (input) input.focus();
        }
    }

    static async submitReply(parentCommentId, contentType, contentId) {
        const input = document.getElementById(`reply-input-${parentCommentId}`);
        const btn = document.getElementById(`reply-submit-${parentCommentId}`);
        if (!input || !btn) return;
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-pulse">...</span>`;
        try {
            await this.createComment(contentType, contentId, text, parentCommentId);
            input.value = '';
            input.style.height = '';
            document.getElementById(`reply-container-${parentCommentId}`).classList.add('hidden');
            await this.refreshCommentsList(contentType, contentId);
        } catch (e) {
            showGlobalToast("Error", "Could not post reply.");
        } finally {
            input.disabled = false;
            btn.disabled = false;
            btn.innerHTML = `Send`;
        }
    }

    static async deleteCommentPrompt(commentId, contentType, contentId) {
        if (!confirm("Delete this comment?")) return;
        try {
            await this.deleteComment(commentId);
            await this.refreshCommentsList(contentType, contentId);
        } catch (e) {
            showGlobalToast("Error", "Failed to delete.");
        }
    }

    static editComment(commentId) {
        const textEl = document.getElementById(`text-${commentId}`);
        if (!textEl) return;
        const currentText = textEl.textContent;
        textEl.innerHTML = `
            <textarea id="edit-input-${commentId}" rows="1" class="w-full bg-white dark:bg-[#1a1a1a] border border-[#4226E9] rounded-[8px] px-2 py-1 text-[13px] text-slate-800 dark:text-dark-text focus:outline-none resize-none mt-1 mb-1 block overflow-hidden" oninput="this.style.height = '';this.style.height = this.scrollHeight + 'px'"></textarea>
            <div class="flex gap-2 justify-end">
                <button onclick="window.CommentService.cancelEdit('${commentId}', '${window.sanitizeHTML(currentText.replace(/'/g, "\\'"))}')" class="text-[10px] text-slate-500 font-bold hover:text-slate-700">Cancel</button>
                <button onclick="window.CommentService.saveEdit('${commentId}')" class="text-[10px] bg-[#4226E9] text-white px-2 py-1 rounded-[4px] font-bold hover:bg-indigo-700">Save</button>
            </div>
        `;
        const input = document.getElementById(`edit-input-${commentId}`);
        input.value = currentText;
        input.focus();
        input.style.height = input.scrollHeight + 'px';
    }

    static cancelEdit(commentId, originalText) {
        const textEl = document.getElementById(`text-${commentId}`);
        if (textEl) textEl.textContent = originalText;
    }

    static async saveEdit(commentId) {
        const input = document.getElementById(`edit-input-${commentId}`);
        if (!input) return;
        const newText = input.value.trim();
        if (!newText) return;
        try {
            const updated = await this.updateComment(commentId, newText);
            const textEl = document.getElementById(`text-${commentId}`);
            if (textEl) textEl.textContent = updated.comment_text;
        } catch (e) {
            showGlobalToast("Error", "Failed to update.");
        }
    }

    static timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "y";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "mo";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m";
        return "Just now";
    }

    static countsCache = {};

    static async loadAllCommentCounts() {
        try {
            const { data, error } = await _supabase.from('comments').select('content_id');
            if (error) throw error;
            
            const counts = {};
            if (data) {
                data.forEach(c => {
                    counts[c.content_id] = (counts[c.content_id] || 0) + 1;
                });
            }
            this.countsCache = counts;
            console.log(`[COMMENT COUNT LOAD] Loaded counts for ${Object.keys(counts).length} items`);
            
            // Update all rendered buttons dynamically
            document.querySelectorAll('.comment-count-btn').forEach(btn => {
                const id = btn.dataset.contentId;
                const count = this.countsCache[id] || 0;
                const text = count > 0 ? `Comment ${count}` : 'Comment';
                btn.innerHTML = `<i data-lucide="message-square" class="w-[14px] h-[14px]"></i> ${text}`;
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            console.error('[COMMENT COUNT LOAD ERR]', e);
        }
    }

    static renderCommentCountButton(contentType, contentId) {
        const count = this.countsCache[contentId] || 0;
        const text = count > 0 ? `Comment ${count}` : 'Comment';
        
        return `
            <button class="comment-count-btn flex items-center justify-center gap-[6px] px-3 py-1.5 rounded-[8px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-[11px] font-bold text-slate-600 dark:text-dark-textSecondary hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" 
                data-content-type="${contentType}" data-content-id="${contentId}" 
                onclick="event.stopPropagation(); window.CommentService.handleCommentButtonClick('${contentType}', '${contentId}')">
                <i data-lucide="message-square" class="w-[14px] h-[14px]"></i> ${text}
            </button>
        `;
    }

    static handleCommentButtonClick(contentType, contentId) {
        console.log('[COMMENT BUTTON] Clicked for', contentType, contentId);
        if (contentType === 'notice') {
            if (typeof window.openNoticeDetails === 'function') {
                window.openNoticeDetails(contentId);
            }
        } else if (contentType === 'schedule') {
            if (typeof window.openScheduleDetails === 'function') {
                window.openScheduleDetails(contentId);
            }
        }
    }
}
window.CommentService = CommentService;
