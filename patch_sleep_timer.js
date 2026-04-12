const fs = require('fs');

const path = 'src/pages/ActivitiesPageNew.tsx';
let data = fs.readFileSync(path, 'utf8');

// Add import
const importStr = "import { SleepTimerDisplay } from '../components/SleepTimerDisplay';";
if (!data.includes('SleepTimerDisplay')) {
    data = data.replace("import { calculateStatsForDate }", importStr + "\nimport { calculateStatsForDate }");
}

// Remove state sleepElapsedTime
data = data.replace(/const \[sleepElapsedTime, setSleepElapsedTime\] = useState<number>\(0\); \/\/ in seconds\n?/g, '');

// Remove the interval hook
const hookRegex = /\/\/ Update sleep elapsed time every 5 minutes when there's an ongoing sleep[\s\S]*?\/\/ Load daily rating when selectedDate changes/m;
const hookRepl = "// Load daily rating when selectedDate changes";
data = data.replace(hookRegex, hookRepl);

// Replace UI usage
const uiRegex = /<Typography sx={{\s*fontSize:\s*'14px',\s*color:\s*'#f59e0b',\s*fontWeight:\s*600,\s*pl:\s*5\s*}}>\s*⏱️ \{Math.floor\(sleepElapsedTime \/ 3600\)\}h \{Math.floor\(\(sleepElapsedTime % 3600\) \/ 60\)\}m \{sleepElapsedTime % 60\}s\s*<\/Typography>/g;
data = data.replace(uiRegex, "<SleepTimerDisplay startTime={ongoingSleep.startTime} />");

fs.writeFileSync(path, data, 'utf8');
console.log('Patched ActivitiesPageNew.tsx');
