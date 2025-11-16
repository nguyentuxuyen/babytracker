# Phân Tích Hiệu Suất - Baby Tracker App

**Ngày phân tích:** 15/11/2025  
**Vấn đề:** App chạy chậm hơn, load lâu hơn, button action (đặc biệt action ngủ) bị lag

---

## 🔍 NGUYÊN NHÂN CHÍNH

### 1. **CONSOLE.LOG QUÁ NHIỀU - VẤN ĐỀ NGHIÊM TRỌNG** ⚠️

#### Trong ActivitiesPageNew.tsx:
- **40+ câu lệnh console.log/console.error** trong code production
- Đặc biệt nghiêm trọng: **Debug logs được chạy mỗi khi activities thay đổi**

```typescript
// Dòng 194-206: Chạy MỖI LẦN load activities
try {
    const safeActivities = convertedActivities.map((a: any) => ({
        ...a,
        timestamp: a.timestamp ? new Date(a.timestamp).toISOString() : null
    }));
    console.log('DEBUG: loaded activities (normalized):', safeActivities);  // ❌ LOG TOÀN BỘ ACTIVITIES
    const aug1 = safeActivities.filter(...);
    console.log('DEBUG: activities on Aug 1 (UTC):', aug1);  // ❌ THÊM FILTER + LOG
} catch (err) {
    console.error('DEBUG: error logging activities', err);
}
```

**Tác động:**
- Serialize toàn bộ activities array mỗi lần load
- Với hàng trăm activities, việc này CỰC KỲ CHẬM
- Browser console phải render toàn bộ log data

#### Trong StatsPageNewGlass.tsx:
- **Console.log trong useEffect** khi load activities
- **Console.log trong useMemo** khi xử lý chart data (chạy mỗi lần re-render)

```typescript
// Dòng 66-81: Debug logs trong useEffect
console.log('=== ALL ACTIVITIES LOADED ===');
console.log('Total activities:', userActivities.length);
console.log('Activities for current baby:', babyActivities.length);
console.log('=== ACTIVITIES ON OCT 17 ===');
oct17Activities.forEach((act, idx) => {
    console.log(`Oct 17 Activity ${idx + 1}:`, {...});  // ❌ LOOP QUA MỖI ACTIVITY
});
```

---

### 2. **MULTIPLE USEEFFECT VÀ USEMEMO - RENDER LẠI KHÔNG CẦN THIẾT**

#### ActivitiesPageNew.tsx có quá nhiều hooks:

```typescript
// 15+ useState hooks
const [activities, setActivities] = useState<Activity[]>();
const [loading, setLoading] = useState(false);
const [showForm, setShowForm] = useState(false);
const [currentUser, setCurrentUser] = useState<any>(null);
const [ongoingSleep, setOngoingSleep] = useState<{ startTime: Date } | null>(null);
const [sleepElapsedTime, setSleepElapsedTime] = useState<number>(0);
const [dailyRating, setDailyRating] = useState<number>(0);
const [dailyRatingNotes, setDailyRatingNotes] = useState<string>('');
const [showRatingDialog, setShowRatingDialog] = useState(false);
const [hoveredStar, setHoveredStar] = useState<number>(0);
const [monthRatings, setMonthRatings] = useState<Map<string, number>>(new Map());
const [currentTime, setCurrentTime] = useState(new Date());
// ... còn nhiều hơn

// 7+ useEffect hooks chạy với các dependencies khác nhau
useEffect(() => { /* Update currentTime every 5 minutes */ }, []);
useEffect(() => { /* Get current user */ }, []);
useEffect(() => { /* Load activities */ }, [currentUser]);
useEffect(() => { /* Load ongoing sleep */ }, [currentUser, baby]);
useEffect(() => { /* Update sleep elapsed time */ }, [ongoingSleep]);
useEffect(() => { /* Load daily rating */ }, [currentUser, baby, selectedDate]);
useEffect(() => { /* Load month ratings */ }, [currentUser, selectedDate]);
useEffect(() => { /* Error boundary */ }, []);
```

**Vấn đề:**
- Mỗi state change trigger re-render
- Nhiều useEffect chạy song song
- Dependencies phức tạp dẫn đến cascade re-renders

---

### 3. **TIMER UPDATES - SLEEP BUTTON LAG**

```typescript
// Dòng 234-249: Update sleep timer MỖI GIÂY
useEffect(() => {
    if (!ongoingSleep) {
        setSleepElapsedTime(0);
        return;
    }

    const updateElapsedTime = () => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - ongoingSleep.startTime.getTime()) / 1000);
        setSleepElapsedTime(elapsed);  // ❌ setState MỖI GIÂY
    };

    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 1000);  // ❌ RE-RENDER MỖI GIÂY
    return () => clearInterval(interval);
}, [ongoingSleep]);
```

**Tác động:**
- Component re-render **EVERY SECOND** khi có sleep timer
- Trigger lại các useMemo calculations
- UI bị lag vì quá nhiều updates

---

### 4. **USEMEMO VỚI DEPENDENCIES PHỨC TẠP**

```typescript
// Dòng 748-773: useMemo tính stats với dependencies phức tạp
const todayStats = useMemo(() => {
    try {
        if (!activities || !selectedDate) {
            return defaultStats;
        }
        return calculateStatsForDate(activities, selectedDate);  // ❌ Chạy lại mỗi lần activities thay đổi
    } catch (err) {
        console.error('💥 Critical Error calculating stats for date:', err, { activities, selectedDate });
        return defaultStats;
    }
}, [activities, selectedDate]);  // ❌ dependencies quá rộng

// Dòng 776-791: yesterdayStats cũng tương tự
const yesterdayStats = useMemo(() => {
    try {
        const y = new Date(selectedDate);
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);
        return calculateStatsForDate(activities || [], y);
    } catch (err) {
        console.error('Error calculating yesterdayStats:', err);
        return {...};
    }
}, [activities, selectedDate]);
```

**Vấn đề:**
- `activities` thay đổi → todayStats, yesterdayStats re-calculate
- Với hàng trăm activities, việc filter và calculate rất chậm

---

### 5. **FIREBASE QUERIES KHÔNG TỐI ƯU**

#### Firestore.ts:
```typescript
// Load TẤT CẢ activities một lúc
getActivities: async (userId: string): Promise<Activity[]> => {
    const activitiesRef = collection(db, 'users', userId, 'activities');
    const q = query(activitiesRef, orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);  // ❌ GET ALL - không có limit
    
    const activities: Activity[] = [];
    querySnapshot.forEach((doc) => {  // ❌ Loop toàn bộ
        const data = doc.data();
        activities.push({...});
    });
    
    return activities;
}
```

**Vấn đề:**
- Không có pagination
- Không có limit
- Load toàn bộ history từ ngày đầu
- Càng nhiều data → càng chậm

---

### 6. **INLINE STYLES VÀ COMPLEX JSX**

#### ActivitiesPageNew.tsx (line 1600+):
- **Hàng trăm dòng inline styles** thay vì dùng CSS classes
- Mỗi re-render phải tạo lại toàn bộ style objects
- Timeline render với nhiều nested components

```typescript
<Box sx={{
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    p: 2,
    bgcolor: (action as any).isSleepTimer && ongoingSleep ? '#fef3c7' : '#ffffff',
    borderRadius: '16px',
    border: (action as any).isSleepTimer && ongoingSleep ? '2px solid #f59e0b' : '1px solid #e5e7eb',
    // ... 10+ more properties
}}>
```

---

## 📊 TÁC ĐỘNG HIỆU SUẤT

### Initial Load:
1. Load activities từ Firebase (chậm với nhiều data)
2. 40+ console.logs serialize toàn bộ data
3. Multiple useEffects chạy song song
4. useMemo calculations với toàn bộ activities
5. Render timeline với hàng trăm activities

**Thời gian ước tính:** 3-5 giây (thay vì < 1 giây)

### Sleep Button Lag:
1. Click button → setState
2. Timer starts → setState mỗi giây
3. Component re-render → console.logs
4. useMemo re-calculate
5. Timeline re-render với inline styles

**Lag time:** 200-500ms mỗi lần click

---

## ✅ GIẢI PHÁP ĐỀ XUẤT

### 1. **XÓA TẤT CẢ CONSOLE.LOG** (Ưu tiên cao nhất)
```typescript
// Remove all debug logs:
// console.log('DEBUG: ...')
// console.log('Loading activity:', ...)
// console.error('Error calculating stats:', ...)
```

**Lưu lại nếu cần:**
```typescript
if (process.env.NODE_ENV === 'development') {
    console.log('Debug:', data);
}
```

### 2. **TỐI ƯU SLEEP TIMER**
```typescript
// Thay vì update mỗi giây, chỉ update khi cần display
const [sleepStartTime, setSleepStartTime] = useState<Date | null>(null);

// Render elapsed time without triggering re-render
const displayElapsedTime = () => {
    if (!sleepStartTime) return '0h 0m';
    const elapsed = Math.floor((Date.now() - sleepStartTime.getTime()) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    return `${hours}h ${minutes}m`;
};

// Update only when needed (e.g., every 30 seconds or on interaction)
```

### 3. **FIREBASE PAGINATION**
```typescript
// Add limit to queries
getActivities: async (userId: string, limit: number = 100): Promise<Activity[]> => {
    const activitiesRef = collection(db, 'users', userId, 'activities');
    const q = query(
        activitiesRef, 
        orderBy('timestamp', 'desc'),
        limit(limit)  // ✅ Limit results
    );
    // ...
}

// Implement pagination for older data
getActivitiesForDateRange: async (userId: string, startDate: Date, endDate: Date): Promise<Activity[]> => {
    // Only load activities in specific range
}
```

### 4. **REDUCE USEMEMO DEPENDENCIES**
```typescript
// Memoize individual calculations
const todayActivities = useMemo(() => 
    activities.filter(a => isSameDay(a.timestamp, selectedDate)),
    [activities, selectedDate]
);

const todayStats = useMemo(() => 
    calculateStats(todayActivities),
    [todayActivities]  // ✅ More specific dependency
);
```

### 5. **EXTRACT INLINE STYLES TO CSS**
```typescript
// Create CSS module or styled components
const ActivityButton = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(2),
    // ... all styles
}));

// Usage:
<ActivityButton onClick={handleClick}>
    {content}
</ActivityButton>
```

### 6. **LAZY LOAD COMPONENTS**
```typescript
// Lazy load heavy components
const StatsPage = React.lazy(() => import('./pages/StatsPageNewGlass'));
const MilestonesPage = React.lazy(() => import('./pages/MilestonesPage'));

// Use Suspense
<Suspense fallback={<LoadingSpinner />}>
    <StatsPage />
</Suspense>
```

---

## 🎯 PRIORITY FIX ORDER

1. **CRITICAL (Fix ngay):**
   - Remove tất cả console.log trong production code
   - Fix sleep timer để không update mỗi giây

2. **HIGH (Fix trong 1-2 ngày):**
   - Add Firebase query limit
   - Optimize useMemo dependencies
   - Extract inline styles

3. **MEDIUM (Fix trong tuần):**
   - Implement pagination
   - Lazy load heavy components
   - Reduce number of useState hooks

---

## 📈 KẾT QUẢ KỲ VỌNG SAU KHI FIX

- **Initial load:** 3-5s → < 1s
- **Button response:** 200-500ms lag → < 50ms
- **Sleep timer:** Smooth, no lag
- **Overall performance:** 3-5x faster

---

**Ghi chú:** Đây là phân tích chi tiết. Bắt đầu với các fix CRITICAL trước để thấy cải thiện ngay lập tức.
