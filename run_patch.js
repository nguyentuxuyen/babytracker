const fs = require('fs');
let text = fs.readFileSync('src/pages/ActivitiesPageNew.tsx', 'utf-8');

const regex = /({\(\(\) => \{\n\s*\/\/ Filter and process activities to handle overnight sleep)[\s\S]*?(const timeGroups = Object.entries\(groupedActivities\);\s*return \(\s*<div style=\{\{ display: 'flex', flexDirection: 'column', gap: '20px' \}\}>\s*\{timeGroups\.map)/;

if (regex.test(text)) {
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
                                            {timeGroups.map`;
    
    text = text.replace(regex, replacement);
    fs.writeFileSync('src/pages/ActivitiesPageNew.tsx', text);
    console.log("Timeline Render Block patched successfully.");
} else {
    console.log("Could not find the target string.");
}
