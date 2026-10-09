import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, TextField, Tooltip } from '@mui/material';
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

    const examples = [t('assistant.examples.milk'), t('assistant.examples.sleep'), t('assistant.examples.diaper'), t('assistant.examples.bath')];

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
                    multiline
                    minRows={2}
                    maxRows={4}
                    autoFocus
                    InputProps={{
                        startAdornment: <AutoAwesomeIcon color="primary" sx={{ mr: 1, fontSize: 20, alignSelf: 'flex-start', mt: '2px' }} />
                    }}
                    sx={{ flex: 1, minWidth: 0, '& .MuiOutlinedInput-root': { borderRadius: '16px', bgcolor: '#f8fafc' } }}
                />
                <Tooltip title={listening ? t('assistant.stopVoice') : t('assistant.voice')}>
                    <IconButton
                        onClick={toggleVoiceInput}
                        aria-label={t('assistant.voice')}
                        sx={{
                            width: 48,
                            height: 48,
                            color: listening ? '#ffffff' : '#13a4ec',
                            bgcolor: listening ? '#ef4444' : '#e0f2fe',
                            '&:hover': { bgcolor: listening ? '#dc2626' : '#bae6fd' }
                        }}
                    >
                        {listening ? <StopIcon /> : <MicIcon />}
                    </IconButton>
                </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                {examples.map((example) => (
                    <Chip
                        key={example}
                        label={example}
                        size="small"
                        variant="outlined"
                        onClick={() => setText(example)}
                        sx={{ borderRadius: '999px', borderColor: '#e5e7eb', color: '#475569', bgcolor: '#ffffff' }}
                    />
                ))}
            </Box>

            <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={loading}
                fullWidth
                disableElevation
                startIcon={loading ? undefined : <AutoAwesomeIcon />}
                sx={{ mt: 2, borderRadius: '14px' }}
            >
                {loading ? <CircularProgress size={18} color="inherit" /> : t('assistant.recordWithAi')}
            </Button>

            {message && (
                <Alert severity={severity} sx={{ mt: 1.5, py: 0, borderRadius: '12px' }}>
                    {message}
                </Alert>
            )}
        </Box>
    );
};
