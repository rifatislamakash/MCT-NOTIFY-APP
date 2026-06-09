        window.CACHE_TTL = 15000; // 15 seconds Cache TTL

        window.isAdminEmail = function(email) {
            const e = String(email || '').trim().toLowerCase();
            return e === '252-40-016@diu.edu.bd' /* REMOVED HARDCODED - USE isAdminEmail */ || e === '252-40-011@diu.edu.bd';
        };

        window.sanitizeHTML = function(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        window.sanitizeUrl = function(url) {
            if (!url) return '#';
            const strUrl = String(url).trim();
            const lowerUrl = strUrl.toLowerCase();
            if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:')) {
                return '#';
            }
            return strUrl;
        };

console.log("[ARCHITECTURE]\nconstants loaded");
