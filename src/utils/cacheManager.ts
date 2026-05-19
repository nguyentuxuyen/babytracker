/**
 * Cache Management for iOS PWA
 * Helps manage service worker cache to ensure fresh data on resume
 */

export const cacheManager = {
    // Clear specific cache stores (use after sync)
    clearFirebaseCache: async () => {
        try {
            const cacheNames = await caches.keys();
            const relevantCaches = cacheNames.filter(name => 
                name.includes('network-first') || 
                name.includes('runtime-cache')
            );
            
            const deleted = await Promise.all(
                relevantCaches.map(cacheName => caches.delete(cacheName))
            );
            
            console.log(`Cleared ${deleted.filter(Boolean).length} caches`);
            return true;
        } catch (error) {
            console.error('Error clearing cache:', error);
            return false;
        }
    },

    // Get cache size (for debugging)
    getCacheSize: async (): Promise<number> => {
        try {
            const cacheNames = await caches.keys();
            let totalSize = 0;
            
            for (const cacheName of cacheNames) {
                const cache = await caches.open(cacheName);
                const keys = await cache.keys();
                
                for (const request of keys) {
                    const response = await cache.match(request);
                    if (response) {
                        const blob = await response.blob();
                        totalSize += blob.size;
                    }
                }
            }
            
            return totalSize;
        } catch (error) {
            console.error('Error getting cache size:', error);
            return 0;
        }
    },

    // Force reload data (bypass cache)
    forceReload: () => {
        // Add cache-busting query parameter
        window.location.href = window.location.href.split('?')[0] + '?' + Date.now();
    }
};
