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
            setMessage('短いコマンドを入力してください。例: "ミルク120ml 9:15"');
            return;
        }

        if (!currentUser) {
            setSeverity('warning');
            setMessage('アシスタントを使うにはログインが必要です。');
            return;
        }

        const command = parseAssistantCommand(input, { selectedDate, babyId });

        if (command.tool === 'unknown') {
            setSeverity('warning');
            setMessage('内容を理解できませんでした。授乳・睡眠・新しい食品の追加の形式で入力してください。');
            return;
        }

        if (command.missingFields.length > 0) {
            setSeverity('warning');
            setMessage(`不足データ: ${command.missingFields.join(', ')}.`);
            return;
        }

        try {
            setLoading(true);
            const result = await executeAssistantCommand(command);
            setSeverity('success');
            setMessage(result.message || '実行に成功しました。');
            setText('');

            if (onCommitted) {
                await onCommitted();
            }
        } catch (error: any) {
            setSeverity('error');
            setMessage(error?.message || 'AIコマンドを処理できませんでした。');
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
                        AIアシスタント
                    </Typography>
                    <Chip label="ローカルAI → MCP" size="small" color="primary" variant="outlined" />
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    自然文で記録を追加したり、メニューに食品を追加できます。
                </Typography>

                <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={4}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder='例: "ミルク120ml 9:15"'
                    sx={{ mb: 2 }}
                />

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button variant="contained" onClick={handleSubmit} disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}>
                        {loading ? '記録中...' : 'AIで記録'}
                    </Button>
                    <Chip label="授乳/食品追加に対応" size="small" />
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
