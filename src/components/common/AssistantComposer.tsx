import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, TextField, Tooltip } from '@mui/material';
import { SparklesIcon as AutoAwesomeIcon, MicIcon, StopIcon } from './icons';
import { useAuth } from '../../contexts/AuthContext';
import { parseAssistantCommand } from '../../services/assistantCore';
import { executeAssistantCommand } from '../../services/assistantApi';
import { localeTag } from '../../i18n';

type AssistantComposerProps = {
    babyId?: string;
    selectedDate?: Date;
    onCommitted?: () => Promise<void> | void;
};

export const AssistantComposer: React.FC<AssistantComposerProps> = ({ babyId, selectedDate, onCommitted }) => {
    const { currentUser } = useAuth();
    const { t } = useTranslation();
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string>('');
    const [severity, setSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info');
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const toggleVoiceInput = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSeverity('warning');
            setMessage(t('assistant.voiceUnsupported'));
            return;
        }
        if (listening) {
            recognitionRef.current?.stop();
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = localeTag();
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onresult = (event: any) => {
            const transcript = event.results?.[0]?.[0]?.transcript || '';
            setText((current) => `${current} ${transcript}`.trim());
        };
        recognition.onerror = () => {
            setListening(false);
            setMessage(t('assistant.voiceFailed'));
        };
        recognition.onend = () => setListening(false);
        recognitionRef.current = recognition;
        setListening(true);
        recognition.start();
    };

    const handleSubmit = async () => {
        const input = text.trim();
        if (!input) {
            setSeverity('warning');
            setMessage(t('assistant.enterCommand'));
            return;
        }

        if (!currentUser) {
            setSeverity('warning');
            setMessage(t('assistant.loginRequired'));
            return;
        }

        // Build a minimal command so the local-fallback path on localhost still works.
        // On production, executeAssistantCommand sends raw text to Gemini and ignores
        // command.tool entirely — so we skip the 'unknown' guard here.
        const command = parseAssistantCommand(input, { selectedDate, babyId });

        try {
            setLoading(true);
            const result = await executeAssistantCommand(command, { selectedDate, babyId });
            setSeverity(result.source === 'local' ? 'success' : 'info');
            setMessage(`${result.message || t('assistant.added')} (${result.source === 'local' ? t('assistant.sourceLocal') : t('assistant.sourceAi')})`);
            setText('');

            if (onCommitted) {
                await onCommitted();
            }
        } catch (error: any) {
            setSeverity('error');
            setMessage(error?.message || t('assistant.failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card sx={{ mb: 2, borderRadius: 2, boxShadow: '0 6px 18px rgba(37, 99, 235, 0.1)' }}>
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'stretch', gap: 1, width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                        <TextField
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void handleSubmit();
                                }
                            }}
                            placeholder={t('assistant.placeholder')}
                            size="small"
                            InputProps={{
                                startAdornment: <AutoAwesomeIcon color="primary" sx={{ mr: 1, fontSize: 20 }} />
                            }}
                            sx={{ flex: 1, minWidth: 0 }}
                        />
                        <Tooltip title={listening ? t('assistant.stopVoice') : t('assistant.voice')}>
                            <IconButton onClick={toggleVoiceInput} color={listening ? 'error' : 'primary'} aria-label={t('assistant.voice')}>
                                {listening ? <StopIcon /> : <MicIcon />}
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading}
                        size="small"
                        sx={{ minWidth: { sm: 92 }, minHeight: 40, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                        {loading ? <CircularProgress size={16} color="inherit" /> : t('assistant.recordWithAi')}
                    </Button>
                </Box>

                {message && (
                    <Box sx={{ mt: 1 }}>
                        <Alert severity={severity} sx={{ py: 0 }}>
                            {message}
                        </Alert>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};
