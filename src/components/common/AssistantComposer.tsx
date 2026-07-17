import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useAuth } from '../../contexts/AuthContext';
import { parseAssistantCommand } from '../../services/assistantCore';
import { executeAssistantCommand } from '../../services/assistantApi';

type AssistantComposerProps = {
    babyId?: string;
    selectedDate?: Date;
    onCommitted?: () => Promise<void> | void;
};

export const AssistantComposer: React.FC<AssistantComposerProps> = ({ babyId, selectedDate, onCommitted }) => {
    const { currentUser } = useAuth();
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string>('');
    const [severity, setSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info');

    const handleSubmit = async () => {
        const input = text.trim();
        if (!input) {
            setSeverity('warning');
            setMessage('Hãy nhập một câu lệnh ngắn, ví dụ: "Bé bú 120ml lúc 9h15".');
            return;
        }

        if (!currentUser) {
            setSeverity('warning');
            setMessage('Bạn cần đăng nhập trước khi dùng assistant.');
            return;
        }

        const command = parseAssistantCommand(input, { selectedDate, babyId });

        if (command.tool === 'unknown') {
            setSeverity('warning');
            setMessage('Mình chưa hiểu rõ yêu cầu. Hãy thử nói theo mẫu: bú, ngủ, đánh giá hoặc thêm món mới.');
            return;
        }

        if (command.missingFields.length > 0) {
            setSeverity('warning');
            setMessage(`Thiếu dữ liệu: ${command.missingFields.join(', ')}.`);
            return;
        }

        try {
            setLoading(true);
            const result = await executeAssistantCommand(command);
            setSeverity('success');
            setMessage(result.message || 'Đã thực thi thành công.');
            setText('');

            if (onCommitted) {
                await onCommitted();
            }
        } catch (error: any) {
            setSeverity('error');
            setMessage(error?.message || 'Không thể xử lý lệnh AI.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card sx={{ mb: 3, borderRadius: 3, boxShadow: '0 10px 30px rgba(37, 99, 235, 0.12)' }}>
            <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <AutoAwesomeIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>
                        AI Assistant
                    </Typography>
                    <Chip label="Local AI → MCP" size="small" color="primary" variant="outlined" />
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Gõ câu tự nhiên để ghi hoạt động, cập nhật đánh giá, hoặc thêm món vào menu.
                </Typography>

                <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={4}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder='Ví dụ: "Bé bú 120ml lúc 9h15"'
                    sx={{ mb: 2 }}
                />

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button variant="contained" onClick={handleSubmit} disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}>
                        {loading ? 'Đang ghi...' : 'Ghi bằng AI'}
                    </Button>
                    <Chip label="Supports feeding / rating / menu" size="small" />
                </Box>

                {message && (
                    <Alert severity={severity} sx={{ mt: 2 }}>
                        {message}
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
};
