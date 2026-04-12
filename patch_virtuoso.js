const fs = require('fs');
let content = fs.readFileSync('src/pages/ActivitiesPageNew.tsx', 'utf-8');

const importStatement = "import { Virtuoso } from 'react-virtuoso';";
if (!content.includes('react-virtuoso')) {
    content = content.replace("import { SleepTimerDisplay }", importStatement + "\nimport { SleepTimerDisplay }");
}

const startStr = `                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {timeGroups.map(([time, activitiesInGroup], groupIndex) => (`;

const newStartStr = `                                    return (
                                        <Virtuoso
                                            useWindowScroll
                                            data={timeGroups}
                                            itemContent={(groupIndex, [time, activitiesInGroup]) => (
                                                <div style={{ paddingBottom: '20px' }}>`; // Wrap in a div to maintain gap

const endStr = `                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}`;

// Replace the end string adding the closing div
const newEndStr = `                                                </div>
                                                </div>
                                            )}
                                        />
                                    );
                                })()}`;


let startIdx = content.indexOf(startStr);
let endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    content = content.replace(startStr, newStartStr);
    content = content.replace(endStr, newEndStr);
    fs.writeFileSync('src/pages/ActivitiesPageNew.tsx', content);
    console.log("VIRTUOSO PATCHED SUCCESSFULLY");
} else {
    console.log("NOT FOUND.");
    startIdx = content.indexOf("{timeGroups.map(([time");
    if(startIdx !== -1) {
        console.log("Found start fragment at: " + startIdx);
        console.log(content.substring(startIdx - 100, startIdx + 150));
    }
    
    endIdx = content.indexOf("})()}");
    if(endIdx !== -1) {
        console.log("Found end fragment at: " + endIdx);
    }
}
