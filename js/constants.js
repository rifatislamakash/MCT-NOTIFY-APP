        window.CACHE_TTL = 15000; // 15 seconds Cache TTL

        window.isAdminEmail = function(email) {
            const e = String(email || '').trim().toLowerCase();
            return e === 'gd.riakash@gmail.com';
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

        window.parseSectionsName = function(sectionsName) {
            if (!sectionsName) return [];
            let sectionsArray = [];
            try {
                if (typeof sectionsName === 'string') {
                    // Try parsing as JSON first
                    const parsed = JSON.parse(sectionsName);
                    if (Array.isArray(parsed)) {
                        sectionsArray = parsed;
                    } else {
                        sectionsArray = sectionsName.split(',').map(s => s.trim()).filter(s => s);
                    }
                } else if (Array.isArray(sectionsName)) {
                    sectionsArray = sectionsName;
                } else {
                    sectionsArray = [String(sectionsName)];
                }
            } catch(e) {
                sectionsArray = String(sectionsName).split(',').map(s => s.trim()).filter(s => s);
            }
            return sectionsArray.map(sec => {
                if (typeof sec === 'string') {
                    return sec.replace(/[\[\]"]/g, '').trim();
                }
                return String(sec).trim();
            }).filter(Boolean);
        };

console.log("[ARCHITECTURE]\nconstants loaded");
