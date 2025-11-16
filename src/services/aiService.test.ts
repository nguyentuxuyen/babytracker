/**
 * TEST GOOGLE GEMINI AI INTEGRATION
 * 
 * Chạy test này sau khi đã:
 * 1. Lấy API key từ https://makersuite.google.com/app/apikey
 * 2. Thêm vào .env.local: REACT_APP_GEMINI_API_KEY=your-key
 * 3. npm start
 */

import { analyzeActivitiesWithAI, askBabyCareQuestion } from '../services/aiService';

// Test data
const testSummary = {
    totalFeedings: 4,
    totalFeedingAmountMl: 250,
    totalDiapers: 3,
    wetDiapers: 2,
    dirtyDiapers: 1,
    totalSleepMinutes: 480, // 8 hours - thấp hơn bình thường
    avgTemperature: 37.2,
    weightKg: 4.5,
    heightCm: 55
};

// Test 1: Analyze Activities
export const testAnalyze = async () => {
    console.log('🧪 TEST 1: Analyzing baby activities...\n');
    
    const result = await analyzeActivitiesWithAI(testSummary, 2, 'Bé Tí');
    
    console.log('📊 RESULTS:');
    console.log('Flags:', result.flags);
    console.log('\n💡 Suggestions:');
    result.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    
    return result;
};

// Test 2: Ask Questions
export const testQuestions = async () => {
    console.log('\n🧪 TEST 2: Asking AI questions...\n');
    
    const questions = [
        'Bé 2 tháng tuổi nên ngủ bao nhiêu tiếng mỗi ngày?',
        'Bé ăn ít hơn bình thường có sao không?',
        'Làm sao để bé ngủ ngon hơn?'
    ];
    
    for (const q of questions) {
        console.log(`❓ Q: ${q}`);
        const answer = await askBabyCareQuestion(q, {
            babyAge: 2,
            recentActivities: testSummary
        });
        console.log(`💬 A: ${answer}\n`);
    }
};

// Run all tests
export const runAllTests = async () => {
    console.log('🚀 STARTING GEMINI AI TESTS\n');
    console.log('='.repeat(50));
    
    try {
        await testAnalyze();
        await testQuestions();
        
        console.log('='.repeat(50));
        console.log('✅ ALL TESTS COMPLETED!\n');
    } catch (error) {
        console.error('❌ TEST FAILED:', error);
    }
};

// Uncomment to run tests in browser console:
// runAllTests();
