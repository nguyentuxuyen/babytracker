const fs = require('fs');
const content = fs.readFileSync('src/pages/ActivitiesPageNew.tsx', 'utf-8');

const searchRegex = /\{\(\(\) => \{\s*\/\/ Filter and process activities to handle overnight sleep[\s\S]*?const timeGroups = Object\.entries\(groupedActivities\);\s*return \(/;

if (searchRegex.test(content)) {
    const newContent = content.replace(searchRegex, `
                                {(() => {
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

                                    return (`);
    fs.writeFileSync('src/pages/ActivitiesPageNew.tsx', newContent);
    console.log('PATCH SUCCESS');
} else {
    console.log('PATCH FAILED: Regex not matched');
}
