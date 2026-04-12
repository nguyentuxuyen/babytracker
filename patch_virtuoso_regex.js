const fs = require('fs');
let content = fs.readFileSync('src/pages/ActivitiesPageNew.tsx', 'utf-8');

const importStatement = "import { Virtuoso } from 'react-virtuoso';";
if (!content.includes('react-virtuoso')) {
    content = content.replace("import { SleepTimerDisplay }", importStatement + "\nimport { SleepTimerDisplay }");
}

let patched = false;

// We use regex to be resilient to spaces/newlines
const mapRegex = /return \([\s\S]*?<div style=\{\{[^{}]*?gap: '20px'[^{}]*?\}\}>[\s\S]*?\{timeGroups\.map\(\(\[time, activitiesInGroup\], groupIndex\) => \(/;

if (mapRegex.test(content)) {
    content = content.replace(mapRegex, `return (
                                        <Virtuoso
                                            useWindowScroll
                                            data={timeGroups}
                                            itemContent={(groupIndex, [time, activitiesInGroup]) => (
                                                <div style={{ paddingBottom: '20px' }}>
                                                `);
                                                
    // Now replace the end. We need the first `})()}` after the new opening
    const endRegex = /<div style=\{\{ flex: 1, paddingBottom: '16px' \}\}>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\)\)}[\s\S]*?<\/div>[\s\S]*?\);[\s\S]*?\}\)\(\)}/;
    
    // Actually an easier way to find the end is:
    // replacing the block that closes the map
    
    // Let's just find the end manually:
    const closePattern = /<\/div>\s*\)\)}\s*<\/div>\s*\);\s*\}\)\(\)\}/;
    if (closePattern.test(content)) {
        content = content.replace(closePattern, `</div>
                                                </div>
                                            )}
                                        />
                                    );
                                })()}`);
        patched = true;
    }
}

if (patched) {
    fs.writeFileSync('src/pages/ActivitiesPageNew.tsx', content);
    console.log("VIRTUOSO PATCHED VIA REGEX");
} else {
    console.log("REGEX FAILED TO MATCH");
}
