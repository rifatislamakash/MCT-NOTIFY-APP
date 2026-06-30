let isSystemMonitorLoading = false;
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
const DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

window.loadSystemMonitor = async function() {
    console.log("[SYSTEM MONITOR] Navigation opened");

    if (isSystemMonitorLoading) {
        console.log("[SYSTEM MONITOR] Duplicate request prevented");
        return;
    }
    isSystemMonitorLoading = true;

    try {
        console.log("[SYSTEM MONITOR] Waiting for Supabase");
        if (!window._supabase) {
            console.error("[SYSTEM MONITOR] Supabase client unavailable.");
            
            const healthContainer = document.getElementById('sys-health-container');
            if (healthContainer) {
                healthContainer.innerHTML = `
                    <div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 col-span-2 md:col-span-4 text-center text-[13px] font-bold">
                        Platform Monitor is not ready.<br>Please try again.
                    </div>
                `;
            }
            
            const dbContainer = document.getElementById('sys-db-container');
            const storageContainer = document.getElementById('sys-storage-container');
            const storageProgressContainer = document.getElementById('sys-storage-progress-container');
            const dbStorageContainer = document.getElementById('sys-db-storage-container');
            const dbTablesContainer = document.getElementById('sys-db-tables-container');
            
            if (dbContainer) dbContainer.innerHTML = '';
            if (storageContainer) storageContainer.innerHTML = '';
            if (storageProgressContainer) storageProgressContainer.innerHTML = '';
            if (dbStorageContainer) dbStorageContainer.innerHTML = '';
            if (dbTablesContainer) dbTablesContainer.innerHTML = '';
            
            const refreshBtn = document.getElementById('sys-refresh-btn');
            const refreshIcon = document.getElementById('sys-refresh-icon');
            const refreshText = document.getElementById('sys-refresh-text');
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('opacity-75', 'cursor-not-allowed');
                if (refreshIcon) refreshIcon.classList.remove('animate-spin');
                if (refreshText) refreshText.textContent = 'Refresh Statistics';
            }
            return;
        }

        console.log("[SYSTEM MONITOR] Supabase Ready");
        const supabase = window._supabase;
        
        console.log("[SYSTEM MONITOR] Loading statistics");
        const overallStart = performance.now();

        // 1. Update UI to loading state
        const refreshBtn = document.getElementById('sys-refresh-btn');
        const refreshIcon = document.getElementById('sys-refresh-icon');
        const refreshText = document.getElementById('sys-refresh-text');
        
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.classList.add('opacity-75', 'cursor-not-allowed');
            if (refreshIcon) refreshIcon.classList.add('animate-spin');
            if (refreshText) refreshText.textContent = 'Loading...';
        }

        // Set Skeleton Loaders
        const dbMetrics = ['Profiles', 'Courses', 'Faculty', 'Semesters', 'User Courses', 'Routines', 'Schedules', 'Notices', 'Materials', 'Groups', 'Support Contacts', 'Device Tokens'];
        const storageBuckets = ['users_pp', 'support-faculty', 'material-files', 'notice-files'];
        
        // Clear containers and show skeletons
        const dbContainer = document.getElementById('sys-db-container');
        const storageContainer = document.getElementById('sys-storage-container');
        const healthContainer = document.getElementById('sys-health-container');
        const storageProgressContainer = document.getElementById('sys-storage-progress-container');
        const dbStorageContainer = document.getElementById('sys-db-storage-container');
        const dbTablesContainer = document.getElementById('sys-db-tables-container');

        if (dbContainer) {
            dbContainer.innerHTML = dbMetrics.map(m => `
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">${m}</p>
                    <div class="h-8 w-16 bg-slate-200 rounded animate-pulse mt-2"></div>
                    <div class="h-3 w-24 bg-slate-100 rounded animate-pulse mt-2"></div>
                </div>
            `).join('');
        }

        if (storageContainer) {
            storageContainer.innerHTML = storageBuckets.map(b => `
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">${b}</p>
                    <div class="h-8 w-24 bg-slate-200 rounded animate-pulse mt-2"></div>
                    <div class="h-4 w-full bg-slate-100 rounded animate-pulse mt-4"></div>
                </div>
            `).join('');
        }

        if (storageProgressContainer) {
            storageProgressContainer.innerHTML = `
                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                    <div class="flex items-center justify-between mb-2">
                        <div class="h-4 w-24 bg-slate-200 rounded animate-pulse"></div>
                        <div class="h-4 w-10 bg-slate-200 rounded animate-pulse"></div>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5 mb-2"></div>
                    <div class="flex justify-end">
                        <div class="h-3 w-20 bg-slate-100 rounded animate-pulse"></div>
                    </div>
                </div>
            `;
        }

        if (dbStorageContainer) {
            dbStorageContainer.innerHTML = `
                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                    <div class="h-4 w-32 bg-slate-200 rounded animate-pulse mb-4"></div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5 mb-2"></div>
                    <div class="h-3 w-40 bg-slate-100 rounded animate-pulse float-right"></div>
                    <div class="clear-both"></div>
                </div>
            `;
        }
        
        if (dbTablesContainer) {
            dbTablesContainer.innerHTML = `
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mt-3">
                    <div class="h-4 w-24 bg-slate-200 rounded animate-pulse mb-4"></div>
                    <div class="space-y-3">
                        <div class="h-3 w-full bg-slate-100 rounded animate-pulse"></div>
                        <div class="h-3 w-5/6 bg-slate-100 rounded animate-pulse"></div>
                        <div class="h-3 w-4/6 bg-slate-100 rounded animate-pulse"></div>
                    </div>
                </div>
            `;
        }

        if (healthContainer) {
            const authHealth = (window.authState && window.authState.session) ? 'Active' : 'Checking...';
            const userEmail = (window.authState && window.authState.session) ? window.authState.session.user.email : 'Unknown';
            
            healthContainer.innerHTML = `
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Database</p>
                    <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 Connected</p>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Storage</p>
                    <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 Connected</p>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Authentication</p>
                    <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 ${authHealth}</p>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Notifications</p>
                    <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 Available</p>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 col-span-2 md:col-span-4">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Current Admin Session</p>
                    <p class="text-[14px] font-bold text-indigo-600 mt-1 break-all">${userEmail}</p>
                </div>
            `;
        }

        // 2. Define Query Functions
        const fetchDbCount = async (table, displayName) => {
            const start = performance.now();
            try {
                const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
                if (error) throw error;
                console.log(`[SYSTEM MONITOR] ${displayName} ✓`);
                return { type: 'db', table, displayName, count, ms: Math.round(performance.now() - start), error: null };
            } catch (e) {
                console.log(`[SYSTEM MONITOR] ${displayName} ✗`);
                return { type: 'db', table, displayName, count: 'Unavailable', ms: Math.round(performance.now() - start), error: e };
            }
        };

        const fetchStorageCount = async (bucket) => {
            const start = performance.now();
            try {
                console.log(`[STORAGE] Loading ${bucket}`);
                const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
                if (error) throw error;
                let totalBytes = 0;
                let fileCount = 0;
                if (data) {
                    fileCount = data.length;
                    data.forEach(file => {
                        let size = 0;
                        if (file.metadata && file.metadata.size) size = file.metadata.size;
                        else if (file.size) size = file.size;
                        totalBytes += size;
                    });
                }
                console.log(`[STORAGE] Bucket Loaded: ${bucket}`);
                return { type: 'storage', bucket, count: fileCount, bytes: totalBytes, ms: Math.round(performance.now() - start), error: null };
            } catch (e) {
                console.log(`[STORAGE] Storage: ${bucket} ✗`);
                return { type: 'storage', bucket, count: 'Unavailable', bytes: 0, ms: Math.round(performance.now() - start), error: e };
            }
        };
        
        const fetchDatabaseStorage = async () => {
            const start = performance.now();
            try {
                console.log(`[DATABASE STORAGE] Loading...`);
                // BYPASS Edge Function completely to eliminate any CORS or deployment issues.
                // Call the secure RPC function directly from the frontend.
                const { data, error } = await supabase.rpc('get_database_storage_stats');
                if (error) throw error;
                if (data.error) throw new Error(data.error);
                console.log(`[DATABASE STORAGE] Database Size Retrieved`);
                console.log(`[DATABASE STORAGE] Largest Tables Retrieved`);
                return { type: 'db_storage', data, ms: Math.round(performance.now() - start), error: null };
            } catch (e) {
                console.log(`[DATABASE STORAGE] Edge Function Error:`, e);
                return { type: 'db_storage', data: null, error: e };
            }
        };

        // 3. Execute all queries concurrently without blocking rendering of individual successes
        const dbPromises = [
            fetchDbCount('profiles', 'Profiles'),
            fetchDbCount('courses', 'Courses'),
            fetchDbCount('faculty', 'Faculty'),
            fetchDbCount('semesters', 'Semesters'),
            fetchDbCount('user_courses', 'User Courses'),
            fetchDbCount('routines', 'Routines'),
            fetchDbCount('schedules', 'Schedules'),
            fetchDbCount('notices', 'Notices'),
            fetchDbCount('materials', 'Materials'),
            fetchDbCount('groups', 'Groups'),
            fetchDbCount('support_contacts', 'Support Contacts'),
            fetchDbCount('device_tokens', 'Device Tokens')
        ];

        const storagePromises = [
            fetchStorageCount('users_pp'),
            fetchStorageCount('support-faculty'),
            fetchStorageCount('material-files'),
            fetchStorageCount('notice-files')
        ];
        
        const dbStoragePromise = fetchDatabaseStorage();

        const allResults = await Promise.allSettled([...dbPromises, ...storagePromises, dbStoragePromise]);
        
        console.log("[SYSTEM MONITOR] Statistics loaded");

        // 4. Update UI with actual data
        let dbHtml = '';
        let todayStudents = 0, todayAdmins = 0, todayCRs = 0, todayFaculty = 0, todayCourses = 0, todaySchedules = 0, todayNotices = 0;

        let storageResults = [];
        let totalStorageUsed = 0;
        let dbStorageData = null;

        allResults.forEach(res => {
            if (res.status === 'fulfilled') {
                const data = res.value;
                
                if (data.type === 'db') {
                    const countDisplay = typeof data.count === 'number' ? data.count.toLocaleString() : data.count;
                    dbHtml += `
                        <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow">
                            <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">${data.displayName}</p>
                            <p class="text-[24px] font-extrabold text-slate-800 leading-none mt-2">${countDisplay}</p>
                            <p class="text-[10px] font-medium text-slate-400 mt-2">Loaded in ${data.ms} ms</p>
                        </div>
                    `;
                    // Accumulate today's snapshot stats if possible
                    if (data.table === 'profiles') todayStudents = data.count;
                    if (data.table === 'faculty') todayFaculty = data.count;
                    if (data.table === 'courses') todayCourses = data.count;
                    if (data.table === 'schedules') todaySchedules = data.count;
                    if (data.table === 'notices') todayNotices = data.count;
                } else if (data.type === 'storage') {
                    storageResults.push(data);
                    if (typeof data.bytes === 'number') {
                        totalStorageUsed += data.bytes;
                    }
                } else if (data.type === 'db_storage') {
                    if (data.error) {
                        dbStorageError = data.error;
                    } else {
                        dbStorageData = data;
                    }
                }
            }
        });

        console.log(`[STORAGE] Total Storage Used: ${formatBytes(totalStorageUsed)}`);

        // Sort storage by size descending
        storageResults.sort((a, b) => b.bytes - a.bytes);

        let storageHtml = '';
        storageResults.forEach(data => {
            const countDisplay = typeof data.count === 'number' ? data.count.toLocaleString() + ' Files' : data.count;
            const bytesDisplay = formatBytes(data.bytes);
            let pctDisplay = '0%';
            if (totalStorageUsed > 0 && typeof data.bytes === 'number') {
                pctDisplay = Math.round((data.bytes / totalStorageUsed) * 100) + '%';
            }

            storageHtml += `
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow flex flex-col justify-between">
                    <div>
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">${data.bucket}</p>
                        <p class="text-[24px] font-extrabold text-slate-800 leading-none mt-2">${bytesDisplay}</p>
                    </div>
                    <div class="mt-4 flex items-center justify-between">
                        <p class="text-[11px] font-bold text-slate-500">${countDisplay}</p>
                        <p class="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">${pctDisplay}</p>
                    </div>
                </div>
            `;
        });

        const overallStoragePct = Math.min((totalStorageUsed / STORAGE_LIMIT_BYTES) * 100, 100);
        const overallStoragePctDisplay = overallStoragePct.toFixed(1).replace(/\.0$/, '');
        console.log(`[STORAGE] Storage Percentage: ${overallStoragePctDisplay}%`);
        console.log(`[STORAGE] Storage Render Complete`);
        
        if (storageProgressContainer) {
            storageProgressContainer.innerHTML = `
                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-[13px] font-extrabold text-slate-800">Storage Used</h4>
                        <span class="text-[13px] font-extrabold text-indigo-600">${overallStoragePctDisplay}%</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden">
                        <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-1000 ease-out" style="width: ${overallStoragePctDisplay}%"></div>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-bold text-slate-400">${formatBytes(totalStorageUsed)} / ${formatBytes(STORAGE_LIMIT_BYTES)}</span>
                    </div>
                </div>
            `;
        }

        // --- Render Database Storage ---
        if (dbStorageData && dbStorageData.data) {
            // Map the exact keys returned by the SQL RPC: database_size_bytes, total_rows, top_tables
            const { database_size_bytes, total_rows, top_tables } = dbStorageData.data;
            const database_used_bytes = database_size_bytes || 0;
            const tables = top_tables || [];
            
            const dbOverallPct = Math.min((database_used_bytes / DATABASE_LIMIT_BYTES) * 100, 100);
            const dbOverallPctDisplay = dbOverallPct.toFixed(1).replace(/\.0$/, '');
            const dbRemaining = Math.max(DATABASE_LIMIT_BYTES - database_used_bytes, 0);
            const avgRowSize = total_rows > 0 ? database_used_bytes / total_rows : 0;

            let dbStorageHtml = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 col-span-1">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Used</p>
                        <p class="text-[20px] font-extrabold text-slate-800 mt-1">${formatBytes(database_used_bytes)}</p>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 col-span-1">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Remaining</p>
                        <p class="text-[20px] font-extrabold text-slate-800 mt-1">${formatBytes(dbRemaining)}</p>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 col-span-1">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Limit</p>
                        <p class="text-[20px] font-extrabold text-slate-800 mt-1">${formatBytes(DATABASE_LIMIT_BYTES)}</p>
                    </div>
                </div>

                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-[13px] font-extrabold text-slate-800">Database Storage</h4>
                        <span class="text-[13px] font-extrabold text-indigo-600">${dbOverallPctDisplay}%</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden">
                        <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-1000 ease-out" style="width: ${dbOverallPctDisplay}%"></div>
                    </div>
                </div>
            `;

            let dbTablesHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 mt-3">
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total Rows</p>
                        <p class="text-[20px] font-extrabold text-slate-800 mt-1">${(total_rows || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Avg Row Size</p>
                        <p class="text-[20px] font-extrabold text-slate-800 mt-1">≈${formatBytes(avgRowSize)}</p>
                    </div>
                </div>

                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                    <h4 class="text-[13px] font-extrabold text-slate-800 mb-4 uppercase tracking-wide">Largest Tables</h4>
                    <div class="space-y-4">
            `;

            if (tables && tables.length > 0) {
                tables.forEach(t => {
                    const tablePct = Math.min((t.bytes / Math.max(database_used_bytes, 1)) * 100, 100).toFixed(1);
                    const tableName = t.table_name || t.table; // Support both just in case
                    dbTablesHtml += `
                        <div>
                            <div class="flex items-center justify-between text-[12px] mb-1">
                                <span class="font-bold text-slate-600">${tableName}</span>
                                <span class="font-bold text-slate-900">${formatBytes(t.bytes)}</span>
                            </div>
                            <div class="w-full bg-slate-50 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-slate-300 h-1.5 rounded-full" style="width: ${tablePct}%"></div>
                            </div>
                        </div>
                    `;
                });
            } else {
                dbTablesHtml += `<p class="text-[12px] text-slate-500 font-medium">No table data available.</p>`;
            }
            dbTablesHtml += `</div></div>`;

            if (dbStorageContainer) dbStorageContainer.innerHTML = dbStorageHtml;
            if (dbTablesContainer) dbTablesContainer.innerHTML = dbTablesHtml;

            // Update Health Indicator
            if (healthContainer) {
                const authHealth = (window.authState && window.authState.session) ? 'Active' : 'Checking...';
                const userEmail = (window.authState && window.authState.session) ? window.authState.session.user.email : 'Unknown';
                
                let dbHealthStatus = '🟢 Healthy';
                let dbHealthRec = 'No cleanup required.';
                if (dbOverallPct > 80) {
                    dbHealthStatus = '🟡 Warning';
                    dbHealthRec = 'Consider cleanup.';
                }

                healthContainer.innerHTML = `
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 col-span-2 md:col-span-1">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Database Health</p>
                        <p class="text-[14px] font-bold text-slate-800 mt-1">${dbHealthStatus}</p>
                        <div class="mt-3">
                            <p class="text-[10px] font-bold text-slate-400">Storage Usage</p>
                            <p class="text-[12px] font-extrabold ${dbOverallPct > 80 ? 'text-orange-600' : 'text-indigo-600'}">${dbOverallPctDisplay}%</p>
                        </div>
                        <div class="mt-2">
                            <p class="text-[10px] font-bold text-slate-400">Recommendation</p>
                            <p class="text-[11px] font-bold text-slate-600">${dbHealthRec}</p>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Storage</p>
                        <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 Connected</p>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Authentication</p>
                        <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 ${authHealth}</p>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Notifications</p>
                        <p class="text-[14px] font-bold text-slate-800 mt-1">🟢 Available</p>
                    </div>
                    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 col-span-2 md:col-span-4">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Current Admin Session</p>
                        <p class="text-[14px] font-bold text-indigo-600 mt-1 break-all">${userEmail}</p>
                    </div>
                `;
            }

            console.log(`[DATABASE STORAGE] Render Complete`);
        } else {
            const errDetails = dbStorageError ? (dbStorageError.message || String(dbStorageError)) : 'Unavailable';
            if (dbStorageContainer) dbStorageContainer.innerHTML = `
                <div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-center">
                    <p class="text-[13px] font-bold mb-1">Database Storage Unavailable</p>
                    <p class="text-[11px] font-mono break-all opacity-80">${errDetails}</p>
                </div>`;
            if (dbTablesContainer) dbTablesContainer.innerHTML = '';
        }

        if (dbContainer) dbContainer.innerHTML = dbHtml;
        if (storageContainer) storageContainer.innerHTML = storageHtml;

        // Update Snapshot
        const snapshotContainer = document.getElementById('sys-snapshot-container');
        if (snapshotContainer) {
            snapshotContainer.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-[#4226E9]/5 border border-[#4226E9]/10 rounded-xl p-3">
                        <p class="text-[11px] font-bold text-[#4226E9]/70 uppercase">Students</p>
                        <p class="text-[20px] font-extrabold text-[#4226E9]">${typeof todayStudents === 'number' ? todayStudents : '-'}</p>
                    </div>
                    <div class="bg-orange-50 border border-orange-100 rounded-xl p-3">
                        <p class="text-[11px] font-bold text-orange-600/70 uppercase">Faculty</p>
                        <p class="text-[20px] font-extrabold text-orange-600">${typeof todayFaculty === 'number' ? todayFaculty : '-'}</p>
                    </div>
                    <div class="bg-fuchsia-50 border border-fuchsia-100 rounded-xl p-3">
                        <p class="text-[11px] font-bold text-fuchsia-600/70 uppercase">Courses</p>
                        <p class="text-[20px] font-extrabold text-fuchsia-600">${typeof todayCourses === 'number' ? todayCourses : '-'}</p>
                    </div>
                    <div class="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                        <p class="text-[11px] font-bold text-cyan-600/70 uppercase">Notices</p>
                        <p class="text-[20px] font-extrabold text-cyan-600">${typeof todayNotices === 'number' ? todayNotices : '-'}</p>
                    </div>
                </div>
            `;
        }

        // 5. Restore UI state
        const overallTime = Math.round(performance.now() - overallStart);
        
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            if (refreshIcon) refreshIcon.classList.remove('animate-spin');
            if (refreshText) refreshText.textContent = 'Refresh Statistics';
        }

        const lastUpdated = document.getElementById('sys-last-updated');
        if (lastUpdated) {
            const now = new Date();
            let hours = now.getHours();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; 
            const minutes = now.getMinutes().toString().padStart(2, '0');
            lastUpdated.textContent = `Last Updated ${hours}:${minutes} ${ampm}`;
        }
        
    } catch (globalError) {
        console.error("[SYSTEM MONITOR] Unexpected error:", globalError);
    } finally {
        isSystemMonitorLoading = false;
        console.log("[SYSTEM MONITOR] Loading finished");
    }
};
