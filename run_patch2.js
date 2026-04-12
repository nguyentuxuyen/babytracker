const fs = require('fs');
let text = fs.readFileSync('src/pages/ActivitiesPageNew.tsx', 'utf-8');

const startIdx = text.indexOf('{(() => {\n                                    if (loading) {');
const endIdx = text.indexOf('{timeGroups.map(([time, activitiesInGroup]', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const before = text.substring(0, startIdx);
    const after = text.substring(endIdx);
    
    const replacement = `{(() => {
                                    if (loading) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                                                Đang tải...
                                            </div>
                                        );
                                    }
                                    
                                    if (!hasActivities) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                                <div style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '500' }}>
                                                    Chưa có hoạt động nào
                                                </div>
                                                <div style={{ fontSize: '14px', color: '#999' }}>
                                                    Chạm vào các nút hành động ở trên để bắt đầu ghi!
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            `;
    
    fs.writeFileSync('src/pages/ActivitiesPageNew.tsx', before + replacement + after);
    console.log("SUCCESS!");
} else {
    console.log("NOT FOUND", startIdx, endIdx);
}
