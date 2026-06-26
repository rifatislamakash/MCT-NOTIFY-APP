import { _supabase } from './supabase-client.js?v=rescue2';
import { crPermissionService } from './services/crPermissionService.js?v=rescue2';
import { showGlobalToast, showLoader } from './utils.js?v=rescue2';

export class ReportService {
    static currentReports = [];

    static async loadMyReports() {
        const container = document.getElementById('my-reports-list');
        if (!container) return;

        try {
            const { data, error } = await _supabase
                .from('department_reports')
                .select('*')
                .eq('created_by', window.authState.user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = `<div class="text-center py-4 text-slate-400 text-xs">No reports submitted yet.</div>`;
                return;
            }

            container.innerHTML = data.map(r => {
                const isResolved = r.status === 'resolved';
                return `
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div class="flex items-center justify-between mb-1.5">
                            <h4 class="text-[13px] font-bold text-slate-900">${window.sanitizeHTML(r.title)}</h4>
                            <span class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${isResolved ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}">${isResolved ? 'Resolved' : 'Pending'}</span>
                        </div>
                        <p class="text-[11px] text-slate-600 mb-2">${window.sanitizeHTML(r.details)}</p>
                        ${r.admin_reply ? `
                            <div class="mt-3 pt-3 border-t border-slate-200">
                                <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Admin Reply</span>
                                <p class="text-[11px] font-medium text-slate-800 mt-0.5">${window.sanitizeHTML(r.admin_reply)}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error("Error loading my reports:", err);
            container.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Failed to load reports.</div>`;
        }
    }

    static async submitReport() {
        const category = document.getElementById('report-category').value;
        const title = document.getElementById('report-title').value;
        const details = document.getElementById('report-details').value;

        if (!title || !details) {
            showGlobalToast("Error", "Please fill out all fields.");
            return;
        }

        showLoader(true, "Submitting report...");
        try {
            const { error } = await _supabase.from('department_reports').insert([{
                category,
                title,
                details,
                status: 'pending',
                created_by: window.authState.user.id,
                batch_id: window.authState.profile?.batch_id || null
            }]);

            if (error) throw error;

            showGlobalToast("Success", "Report submitted successfully!");
            document.getElementById('report-submission-form').reset();
            
            // Re-fetch records and wait for it to complete before removing the global loader
            // This ensures the list updates instantly and smoothly.
            await this.loadMyReports();
        } catch (err) {
            console.error("Report submit error:", err);
            showGlobalToast("Error", "Could not submit report.");
        } finally {
            showLoader(false);
        }
    }

    static async loadAdminReports() {
        // Now serves as unified loadReports
        const container = document.getElementById('admin-department-reports-list');
        if (!container) return;

        const fab = document.getElementById('cr-fab-report');
        if (fab) {
            if (window.currentUserRole === 'cr') fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        }

        try {
            if (!window.currentBatchesList || window.currentBatchesList.length === 0) {
                const { data: bData } = await _supabase.from('batches').select('id, batch_name');
                if (bData) window.currentBatchesList = bData;
            }

            let query = _supabase
                .from('department_reports')
                .select(`
                    *,
                    profiles:created_by (full_name, profile_url, batch_id)
                `)
                .order('created_at', { ascending: false });

            if (window.currentUserRole === 'cr') {
                query = query.eq('created_by', window.authState.user.id);
            }

            const { data, error } = await query;

            if (error) throw error;
            this.currentReports = data || [];

            if (this.currentReports.length === 0) {
                container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No reports found.</div>`;
                return;
            }

            const groups = {};
            this.currentReports.forEach(r => {
                const authorBatchId = r.profiles && r.profiles.batch_id ? r.profiles.batch_id : 'Unknown Batch';
                if (!groups[authorBatchId]) groups[authorBatchId] = [];
                groups[authorBatchId].push(r);
            });

            let html = '';
            for (const batchId in groups) {
                const reports = groups[batchId];
                
                // Map batch_id to batch_name
                let batchName = batchId;
                if (window.currentBatchesList && batchId !== 'Unknown Batch') {
                    const batchObj = window.currentBatchesList.find(b => String(b.id) === String(batchId));
                    if (batchObj) batchName = batchObj.batch_name;
                }

                html += `
                    <div class="mb-6">
                        <div class="flex items-center gap-2 mb-3 px-1">
                            <i data-lucide="folder" class="w-4 h-4 text-slate-400"></i>
                            <h3 class="text-[13px] font-black text-slate-700 tracking-tight">Batch: ${window.sanitizeHTML(batchName)} <span class="text-[10px] text-slate-400 font-bold ml-1">(${reports.length})</span></h3>
                        </div>
                        <div class="space-y-3">
                `;
                reports.forEach(r => {
                    const authorName = r.profiles ? r.profiles.full_name : 'Unknown CR';
                    const isResolved = r.status === 'resolved';

                    html += `
                        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <div class="w-8 h-8 rounded-full bg-slate-100 overflow-hidden">
                                        ${r.profiles?.profile_url ? `<img src="${r.profiles.profile_url}" class="w-full h-full object-cover">` : `<i data-lucide="user" class="w-4 h-4 m-2 text-slate-400"></i>`}
                                    </div>
                                    <div>
                                        <h5 class="text-[12px] font-bold text-slate-900 leading-tight">${window.sanitizeHTML(authorName)}</h5>
                                        <span class="text-[9px] font-medium text-slate-500">${new Date(r.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <span class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${isResolved ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}">${isResolved ? 'Resolved' : 'Pending'}</span>
                            </div>
                            <div class="mb-3">
                                <h4 class="text-[13px] font-bold text-slate-800">${window.sanitizeHTML(r.title)} <span class="text-[10px] text-slate-400 uppercase tracking-wide ml-1">(${r.category})</span></h4>
                                <p class="text-[11px] text-slate-600 mt-1">${window.sanitizeHTML(r.details)}</p>
                            </div>
                            
                            ${isResolved ? `
                                <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wide block mb-1">Admin Reply</span>
                                    <p class="text-[11px] font-medium text-slate-800">${window.sanitizeHTML(r.admin_reply)}</p>
                                </div>
                            ` : (window.currentUserRole === 'admin' ? `
                                <div class="flex items-start gap-2">
                                    <input type="text" id="reply-input-${r.id}" class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-indigo-500" placeholder="Type a reply...">
                                    <button onclick="window.ReportService.sendReply('${r.id}')" class="px-3 py-2 bg-[#4226E9] hover:bg-[#341BC5] text-white text-[11px] font-bold rounded-lg transition-colors shrink-0">Send Reply</button>
                                </div>
                            ` : '')}
                        </div>
                    `;
                });
                html += `</div></div>`;
            }

            container.innerHTML = html;

            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            console.error("Error loading admin reports:", err);
            container.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Failed to load reports.</div>`;
        }
    }

    static async sendReply(reportId) {
        const input = document.getElementById(`reply-input-${reportId}`);
        const reply = input ? input.value.trim() : '';

        if (!reply) {
            showGlobalToast("Wait", "Please enter a reply.");
            return;
        }

        showLoader(true, "Sending reply...");
        try {
            const { error } = await _supabase.from('department_reports')
                .update({ admin_reply: reply, status: 'resolved' })
                .eq('id', reportId);

            if (error) throw error;

            showGlobalToast("Success", "Reply sent.");
            this.loadAdminReports();
        } catch (err) {
            console.error("Error sending reply:", err);
            showGlobalToast("Error", "Could not send reply.");
        } finally {
            showLoader(false);
        }
    }
}
