const fs = require('fs');

const path = 'src/pages/ActivitiesPageNew.tsx';
let data = fs.readFileSync(path, 'utf8');

// 1. Add state and effect logic
const stateHook = "const [activities, setActivities] = useState<Activity[]>();";
const newStates = `${stateHook}
    const [loadedDays, setLoadedDays] = useState<number>(14); // Dynamic loaded days

    // Kích hoạt khi selectedDate vượt quá số ngày đã tải
    useEffect(() => {
        if (!selectedDate) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(selectedDate);
        selected.setHours(0, 0, 0, 0);
        
        const diffTime = Math.abs(today.getTime() - selected.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Cộng thêm 1 vào diffDays để luôn load dư ngày trước đó cho phần compare (summary)
        if (diffDays + 1 >= loadedDays) {
            setLoadedDays(diffDays + 7); // Tải dư thêm 7 ngày
        }
    }, [selectedDate, loadedDays]);`;

if (!data.includes('setLoadedDays')) {
    data = data.replace(stateHook, newStates);
}

// 2. Change the hardcoded 14 to loadedDays
data = data.replace(
    "await firestore.getActivities(currentUser.uid, 14); // Optimized: Only fetch last 14 days for Home tab",
    "await firestore.getActivities(currentUser.uid, loadedDays); // Optimized: Dynamically fetch based on loadedDays"
);

// 3. Update dependencies from [currentUser] to [currentUser, loadedDays] for the main useEffect
// We need to carefully target the right useEffect closing
const searchPattern = "        loadActivities();\n    }, [currentUser]);";
const replacePattern = "        loadActivities();\n    }, [currentUser, loadedDays]);";
data = data.replace(searchPattern, replacePattern);

fs.writeFileSync(path, data, 'utf8');
console.log('Patched ActivitiesPageNew.tsx dynamically loaded days');
