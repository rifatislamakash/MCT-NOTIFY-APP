import { _supabase } from '../supabase-client.js';
import { showGlobalToast } from '../utils.js';
import { NotificationQueueService } from './NotificationQueueService.js';

export class CommentService {
    static async loadComments(contentType, contentId) {
        try {
            console.log(`[COMMENTS LOAD] Fetching for ${contentType}:${contentId}`);
            const { data, error } = await _supabase
                .from('comments')
                .select(`id, created_at, updated_at, user_id, content_type, content_id, comment_text, parent_comment_id, profiles ( full_name, profile_url )`)
                .eq('content_type', contentType)
                .eq('content_id', contentId)
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
            console.log(`[COMMENT CREATE] ${parentCommentId ? 'Reply' : 'Top-level'}`);
            const payload = {
                user_id: user.id,
                content_type: contentType,
                content_id: contentId,
                comment_text: commentText.trim(),
                parent_comment_id: parentCommentId
            };
            const { data, error } = await _supabase.from('comments').insert([payload]).select('*, profiles (full_name, profile_url)').single();
            if (error) throw error;
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
            const { data, error } = await _supabase.from('comments').update({ comment_text: newText.trim(), updated_at: new Date().toISOString() }).eq('id', commentId).select('*, profiles (full_name, profile_url)').single();
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
            const { error } = await _supabase.from('comments').delete().eq('id', commentId);
            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[COMMENT DELETE FAILURE]', err);
            throw err;
        }
    }


    static async triggerCommentNotification(commentData, currentUserId) {
        try {
            console.log(`[COMMENT NOTIFICATION] Initiating server-authoritative queue for ${commentData.id}`);

            const isReply = !!commentData.parent_comment_id;
            const actorName = commentData.profiles?.full_name || window.authState?.profile?.full_name || 'Someone';
            
            // Determine dynamic title (Backend Edge Function will handle actual filtering and delivery)
            let titleStr = isReply ? `${actorName} replied to a comment` : `${actorName} commented on your ${commentData.content_type}`;
            
            // Note: Since we shifted recipient logic to backend to prevent RLS target spoofing, 
            // the exact 'replied to YOUR comment' vs 'replied to A comment' title nuance will be a generalized format here.
            if (isReply) {
                titleStr = `${actorName} replied to the conversation`;
            }

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

    static renderCommentsSection(containerId, contentType, contentId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="mt-6 border-t border-slate-100 dark:border-white/5 pt-4">
                <h3 class="font-bold text-[14px] text-slate-800 dark:text-dark-text mb-4">Comments</h3>
                <div id="comments-list-${contentId}" class="flex flex-col gap-4 mb-4">
                    <div class="animate-pulse flex items-center gap-3">
                        <div class="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                        <div class="flex-1 h-10 bg-slate-200 dark:bg-slate-700 rounded-[12px]"></div>
                    </div>
                </div>
                <div class="flex gap-3">
                    <img src="${window.sanitizeUrl(window.authState?.profile?.profile_url) || 'assets/profilefill.png'}" class="w-8 h-8 rounded-full object-cover shrink-0">
                    <div class="flex-1 relative">
                        <textarea id="comment-input-${contentId}" rows="1" class="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-white/10 rounded-[12px] px-3 py-2 text-[13px] text-slate-800 dark:text-dark-text focus:outline-none focus:border-[#4226E9] resize-none overflow-hidden block" placeholder="Write a comment..." oninput="this.style.height = '';this.style.height = this.scrollHeight + 'px'"></textarea>
                        <button id="comment-submit-${contentId}" onclick="window.CommentService.submitTopComment('${contentType}', '${contentId}')" class="absolute right-3 bottom-2 text-[#4226E9] font-bold text-[13px] hover:opacity-80">Send</button>
                    </div>
                </div>
            </div>
        `;
        this.refreshCommentsList(contentType, contentId);
    }

    static async refreshCommentsList(contentType, contentId) {
        const listEl = document.getElementById(`comments-list-${contentId}`);
        if (!listEl) return;
        try {
            const comments = await this.loadComments(contentType, contentId);
            if (comments.length === 0) {
                listEl.innerHTML = `<div class="text-[13px] text-slate-500 dark:text-dark-textSecondary text-center py-4">No comments yet. Be the first to comment.</div>`;
                return;
            }
            listEl.innerHTML = '';
            comments.forEach(c => {
                listEl.appendChild(this.buildCommentElement(c, contentType, contentId));
            });
        } catch (e) {
            listEl.innerHTML = `<div class="text-[13px] text-red-500 text-center py-4">Comments couldn't be loaded. <button onclick="window.CommentService.refreshCommentsList('${contentType}', '${contentId}')" class="underline">Retry</button></div>`;
        }
    }

    static buildCommentElement(comment, contentType, contentId) {
        const div = document.createElement('div');
        div.className = 'flex gap-3';
        div.id = `comment-${comment.id}`;
        const avatar = comment.profiles?.profile_url ? window.sanitizeUrl(comment.profiles.profile_url) : 'assets/profilefill.png';
        const name = comment.profiles?.full_name || 'Unknown User';
        const isMine = comment.user_id === window.authState?.user?.id;
        let repliesHtml = '';
        if (comment.replies && comment.replies.length > 0) {
            repliesHtml = `<div class="flex flex-col gap-3 mt-3">` + comment.replies.map(reply => {
                const rAvatar = reply.profiles?.profile_url ? window.sanitizeUrl(reply.profiles.profile_url) : 'assets/profilefill.png';
                const rName = reply.profiles?.full_name || 'Unknown User';
                const rIsMine = reply.user_id === window.authState?.user?.id;
                return `
                <div class="flex gap-2" id="comment-${reply.id}">
                    <img src="${rAvatar}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-1">
                    <div class="flex-1 min-w-0">
                        <div class="bg-slate-50 dark:bg-dark-surface rounded-[12px] px-3 py-2 border border-slate-100 dark:border-white/5 inline-block min-w-[50%] max-w-full">
                            <span class="block font-bold text-[12px] text-slate-800 dark:text-dark-text leading-none mb-1">${window.sanitizeHTML(rName)}</span>
                            <span class="block text-[13px] text-slate-700 dark:text-dark-text break-words" id="text-${reply.id}"></span>
                        </div>
                        <div class="flex items-center gap-3 px-2 mt-1">
                            <span class="text-[10px] text-slate-400 font-medium">${this.timeAgo(reply.created_at)}</span>
                            ${rIsMine ? `<button onclick="window.CommentService.editComment('${reply.id}')" class="text-[10px] text-slate-500 font-bold hover:text-[#4226E9]">Edit</button>` : ''}
                            ${rIsMine ? `<button onclick="window.CommentService.deleteCommentPrompt('${reply.id}', '${contentType}', '${contentId}')" class="text-[10px] text-red-400 font-bold hover:text-red-600">Delete</button>` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('') + `</div>`;
        }
        div.innerHTML = `
            <img src="${avatar}" class="w-8 h-8 rounded-full object-cover shrink-0 mt-1">
            <div class="flex-1 min-w-0">
                <div class="bg-slate-50 dark:bg-dark-surface rounded-[14px] px-3 py-2 border border-slate-100 dark:border-white/5 inline-block min-w-[50%] max-w-full">
                    <span class="block font-bold text-[13px] text-slate-800 dark:text-dark-text leading-none mb-1">${window.sanitizeHTML(name)}</span>
                    <span class="block text-[14px] text-slate-700 dark:text-dark-text break-words" id="text-${comment.id}"></span>
                </div>
                <div class="flex items-center gap-3 px-2 mt-1">
                    <span class="text-[11px] text-slate-400 font-medium">${this.timeAgo(comment.created_at)}</span>
                    <button onclick="window.CommentService.showReplyInput('${comment.id}')" class="text-[11px] text-slate-500 font-bold hover:text-[#4226E9]">Reply</button>
                    ${isMine ? `<button onclick="window.CommentService.editComment('${comment.id}')" class="text-[11px] text-slate-500 font-bold hover:text-[#4226E9]">Edit</button>` : ''}
                    ${isMine ? `<button onclick="window.CommentService.deleteCommentPrompt('${comment.id}', '${contentType}', '${contentId}')" class="text-[11px] text-red-400 font-bold hover:text-red-600">Delete</button>` : ''}
                </div>
                ${repliesHtml}
                <div id="reply-container-${comment.id}" class="hidden mt-3 pl-2 border-l-2 border-slate-100 dark:border-white/5">
                    <div class="flex gap-2">
                        <img src="${window.sanitizeUrl(window.authState?.profile?.profile_url) || 'assets/profilefill.png'}" class="w-6 h-6 rounded-full object-cover shrink-0">
                        <div class="flex-1 relative">
                            <textarea id="reply-input-${comment.id}" rows="1" class="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-white/10 rounded-[12px] px-3 py-2 pr-12 text-[12px] text-slate-800 dark:text-dark-text focus:outline-none focus:border-[#4226E9] resize-none overflow-hidden block" placeholder="Write a reply..." oninput="this.style.height = '';this.style.height = this.scrollHeight + 'px'"></textarea>
                            <button id="reply-submit-${comment.id}" onclick="window.CommentService.submitReply('${comment.id}', '${contentType}', '${contentId}')" class="absolute right-3 bottom-2 text-[#4226E9] font-bold text-[12px] hover:opacity-80">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => {
            const el = div.querySelector(`#text-${comment.id}`);
            if (el) el.textContent = comment.comment_text;
            if (comment.replies) {
                comment.replies.forEach(r => {
                    const rEl = div.querySelector(`#text-${r.id}`);
                    if (rEl) rEl.textContent = r.comment_text;
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
}
window.CommentService = CommentService;
