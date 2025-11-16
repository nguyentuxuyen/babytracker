import React, { useState } from 'react';
import { 
    Card, 
    CardContent, 
    Typography, 
    Box, 
    Button, 
    CircularProgress,
    Chip,
    TextField,
    Alert
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { analyzeActivities, DailySummary } from '../../services/aiService';

interface AIAnalysisCardProps {
    summary: DailySummary;
    babyAge?: number;
    babyName?: string;
}

export const AIAnalysisCard: React.FC<AIAnalysisCardProps> = ({ summary, babyAge, babyName }) => {
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [flags, setFlags] = useState<string[]>([]);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [questionLoading, setQuestionLoading] = useState(false);
    const [error, setError] = useState<string>('');

    const handleAnalyze = async () => {
        setLoading(true);
        setError('');
        try {
            const result = analyzeActivities(summary);
            setSuggestions(result.suggestions);
            setFlags(result.flags);
        } catch (error) {
            setError('Không thể phân tích. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const handleAskQuestion = async () => {
        if (!question.trim()) return;
        
        setQuestionLoading(true);
        try {
            // Simple local response for now - can be enhanced with AI later
            setAnswer('Chức năng này sẽ được bổ sung trong bản cập nhật tiếp theo.');
        } catch (error) {
            setAnswer('Xin lỗi, không thể trả lời câu hỏi.');
        } finally {
            setQuestionLoading(false);
        }
    };

    const getFlagColor = (flag: string) => {
        if (flag === 'ok') return 'success';
        if (flag === 'fever' || flag === 'low_weight') return 'error';
        return 'warning';
    };

    const getFlagLabel = (flag: string) => {
        const labels: Record<string, string> = {
            'ok': 'Bình thường',
            'low_feedings': 'Ăn ít',
            'low_feeding_volume': 'Sữa ít',
            'low_diapers': 'Tã ít',
            'low_sleep': 'Ngủ ít',
            'fever': 'Sốt',
            'low_weight': 'Cân nặng thấp'
        };
        return labels[flag] || flag;
    };

    return (
        <Card 
            sx={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                mb: 3
            }}
        >
            <CardContent>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <AutoAwesomeIcon sx={{ mr: 1, fontSize: 28 }} />
                    <Typography variant="h6" fontWeight="bold">
                        AI Phân Tích
                    </Typography>
                    <Chip 
                        label="Gemini 2.5 Flash" 
                        size="small" 
                        sx={{ 
                            ml: 'auto', 
                            bgcolor: 'rgba(255,255,255,0.2)', 
                            color: 'white',
                            fontWeight: 600
                        }}
                    />
                </Box>

                {/* Info notice */}
                <Alert 
                    severity="success"
                    sx={{ 
                        mb: 2,
                        bgcolor: 'rgba(255,255,255,0.15)',
                        color: 'white',
                        fontSize: '13px',
                        '& .MuiAlert-icon': { color: 'white' }
                    }}
                >
                    ✨ Sử dụng AI miễn phí từ Google Gemini 2.5 Flash (15 req/min).
                </Alert>

                {/* Error notice */}
                {error && (
                    <Alert 
                        severity="warning"
                        sx={{ 
                            mb: 2,
                            bgcolor: 'rgba(251, 191, 36, 0.15)',
                            color: 'white',
                            fontSize: '13px',
                            '& .MuiAlert-icon': { color: '#fbbf24' }
                        }}
                    >
                        {error}
                    </Alert>
                )}

                {/* Analyze Button */}
                {suggestions.length === 0 && (
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleAnalyze}
                        disabled={loading}
                        sx={{ 
                            bgcolor: 'rgba(255,255,255,0.2)', 
                            color: 'white',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                        }}
                        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PsychologyIcon />}
                    >
                        {loading ? 'Đang phân tích...' : 'Phân tích với AI'}
                    </Button>
                )}

                {/* Analysis Results */}
                {suggestions.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                        {/* Flags */}
                        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                            {flags.map((flag, idx) => (
                                <Chip
                                    key={idx}
                                    label={getFlagLabel(flag)}
                                    size="small"
                                    color={getFlagColor(flag)}
                                    sx={{ 
                                        bgcolor: 'rgba(255,255,255,0.3)',
                                        color: 'white',
                                        fontWeight: 'bold'
                                    }}
                                />
                            ))}
                        </Box>

                        {/* Suggestions */}
                        {suggestions.map((suggestion, idx) => (
                            <Alert 
                                key={idx}
                                severity="info"
                                sx={{ 
                                    mb: 1,
                                    bgcolor: 'rgba(255,255,255,0.15)',
                                    color: 'white',
                                    '& .MuiAlert-icon': { color: 'white' }
                                }}
                            >
                                {suggestion}
                            </Alert>
                        ))}

                        {/* Re-analyze button */}
                        <Button
                            size="small"
                            onClick={handleAnalyze}
                            disabled={loading}
                            sx={{ mt: 1, color: 'white' }}
                        >
                            Phân tích lại
                        </Button>
                    </Box>
                )}

                {/* Ask Question Section */}
                <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        💬 Hỏi AI về chăm sóc bé
                    </Typography>
                    
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Ví dụ: Bé ngủ ít có sao không?"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                        sx={{
                            mb: 1,
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'rgba(255,255,255,0.15)',
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                                '&.Mui-focused fieldset': { borderColor: 'white' }
                            },
                            '& .MuiInputBase-input::placeholder': {
                                color: 'rgba(255,255,255,0.7)',
                                opacity: 1
                            }
                        }}
                    />
                    
                    <Button
                        size="small"
                        fullWidth
                        onClick={handleAskQuestion}
                        disabled={questionLoading || !question.trim()}
                        sx={{ 
                            bgcolor: 'rgba(255,255,255,0.2)',
                            color: 'white',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                        }}
                    >
                        {questionLoading ? <CircularProgress size={20} color="inherit" /> : 'Hỏi AI'}
                    </Button>

                    {/* Answer */}
                    {answer && (
                        <Alert 
                            severity="success"
                            sx={{ 
                                mt: 2,
                                bgcolor: 'rgba(255,255,255,0.15)',
                                color: 'white',
                                '& .MuiAlert-icon': { color: 'white' }
                            }}
                        >
                            {answer}
                        </Alert>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};
