import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, TextField, CircularProgress, InputAdornment, IconButton, Container } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useHistory } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginMode, setLoginMode] = useState<'email' | 'google'>('email');
    const history = useHistory();
    const { currentUser, login } = useAuth();

    console.log('[LoginPage] Rendering login page, currentUser:', currentUser?.email);

    // Auto-redirect when auth state changes to logged in
    useEffect(() => {
        if (currentUser) {
            console.log('[LoginPage] User detected, redirecting to home:', currentUser.email);
            history.push('/');
        }
    }, [currentUser, history]);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[LoginPage] Email login clicked');
        setLoading(true);
        setError(null);
        
        try {
            await login(email, password);
            console.log('[LoginPage] Email login successful - auth state will auto-redirect');
            // Don't need history.push - auth state change will trigger redirect
        } catch (err: any) {
            console.error('[LoginPage] Email login error:', err);
            setError(err.message || 'Failed to login with email');
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        console.log('[LoginPage] Google login clicked');
        setLoading(true);
        setError(null);
        
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            console.log('[LoginPage] Google login successful:', result.user.email, '- auth state will auto-redirect');
            // Don't need history.push - auth state change will trigger redirect
        } catch (err: any) {
            console.error('[LoginPage] Google login error:', err);
            setError(err.message || 'Failed to login with Google');
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                px: 3,
                py: 4
            }}
        >
            <Container maxWidth="sm">
                <Box
                    sx={{
                        bgcolor: '#ffffff',
                        borderRadius: '24px',
                        p: 4,
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
                    }}
                >
                    {/* Baby Illustration */}
                    <Box
                        sx={{
                            width: '120px',
                            height: '120px',
                            margin: '0 auto 24px',
                            bgcolor: '#f0f4ff',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '64px'
                        }}
                    >
                        👶
                    </Box>

                    {/* Title */}
                    <Typography
                        variant="h1"
                        sx={{
                            fontSize: '32px',
                            fontWeight: 800,
                            color: '#1a202c',
                            mb: 1,
                            fontFamily: 'Manrope, sans-serif',
                            textAlign: 'center'
                        }}
                    >
                        Baby Tracker
                    </Typography>

                    {/* Subtitle */}
                    <Typography
                        variant="body1"
                        sx={{
                            fontSize: '16px',
                            color: '#718096',
                            mb: 4,
                            lineHeight: 1.6,
                            textAlign: 'center'
                        }}
                    >
                        Track your baby's activities,<br />
                        milestones, and growth journey
                    </Typography>

                    {/* Mode Selector */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                        <Button
                            fullWidth
                            variant={loginMode === 'email' ? 'contained' : 'outlined'}
                            onClick={() => setLoginMode('email')}
                            sx={{
                                py: 1,
                                textTransform: 'none',
                                borderRadius: '10px',
                                ...(loginMode === 'email' ? {
                                    bgcolor: '#667eea',
                                    color: '#ffffff',
                                    '&:hover': { bgcolor: '#5568d3' }
                                } : {
                                    borderColor: '#e2e8f0',
                                    color: '#718096',
                                    '&:hover': { borderColor: '#cbd5e0', bgcolor: '#f7fafc' }
                                })
                            }}
                        >
                            Email
                        </Button>
                        <Button
                            fullWidth
                            variant={loginMode === 'google' ? 'contained' : 'outlined'}
                            onClick={() => setLoginMode('google')}
                            sx={{
                                py: 1,
                                textTransform: 'none',
                                borderRadius: '10px',
                                ...(loginMode === 'google' ? {
                                    bgcolor: '#667eea',
                                    color: '#ffffff',
                                    '&:hover': { bgcolor: '#5568d3' }
                                } : {
                                    borderColor: '#e2e8f0',
                                    color: '#718096',
                                    '&:hover': { borderColor: '#cbd5e0', bgcolor: '#f7fafc' }
                                })
                            }}
                        >
                            Google
                        </Button>
                    </Box>

                    {/* Email Login Form */}
                    {loginMode === 'email' && (
                        <Box component="form" onSubmit={handleEmailLogin} sx={{ mb: 2 }}>
                            <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                sx={{
                                    mb: 2,
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: '12px'
                                    }
                                }}
                            />
                            <TextField
                                fullWidth
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                onClick={() => setShowPassword(!showPassword)}
                                                edge="end"
                                            >
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                                sx={{
                                    mb: 3,
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: '12px'
                                    }
                                }}
                            />
                            <Button
                                fullWidth
                                type="submit"
                                variant="contained"
                                size="large"
                                disabled={loading}
                                sx={{
                                    bgcolor: '#667eea',
                                    color: '#ffffff',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    py: 1.75,
                                    borderRadius: '12px',
                                    textTransform: 'none',
                                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                                    '&:hover': {
                                        bgcolor: '#5568d3',
                                        boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)'
                                    },
                                    '&:disabled': {
                                        bgcolor: '#a5b4fc'
                                    }
                                }}
                            >
                                {loading ? <CircularProgress size={24} sx={{ color: '#ffffff' }} /> : 'Sign in with Email'}
                            </Button>
                        </Box>
                    )}

                    {/* Google Sign-in Button */}
                    {loginMode === 'google' && (
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            sx={{
                                bgcolor: '#ffffff',
                                color: '#1a202c',
                                fontSize: '16px',
                                fontWeight: 600,
                                py: 1.75,
                                px: 3,
                                borderRadius: '12px',
                                textTransform: 'none',
                                border: '2px solid #e2e8f0',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                                '&:hover': {
                                    bgcolor: '#f7fafc',
                                    border: '2px solid #cbd5e0',
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)'
                                },
                                '&:disabled': {
                                    bgcolor: '#f7fafc',
                                    border: '2px solid #e2e8f0'
                                }
                            }}
                        >
                            {loading ? (
                                <CircularProgress size={24} sx={{ color: '#667eea' }} />
                            ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                                    <svg width="20" height="20" viewBox="0 0 48 48">
                                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                                        <path fill="none" d="M0 0h48v48H0z"/>
                                    </svg>
                                    <span>Continue with Google</span>
                                </Box>
                            )}
                        </Button>
                    )}

                    {/* Error Message */}
                    {error && (
                        <Typography
                            sx={{
                                mt: 3,
                                color: '#e53e3e',
                                fontSize: '14px',
                                bgcolor: '#fff5f5',
                                p: 2,
                                borderRadius: '8px',
                                border: '1px solid #feb2b2',
                                textAlign: 'center'
                            }}
                        >
                            {error}
                        </Typography>
                    )}
                </Box>

                {/* Footer */}
                <Typography
                    sx={{
                        mt: 4,
                        textAlign: 'center',
                        color: '#ffffff',
                        fontSize: '13px',
                        opacity: 0.9
                    }}
                >
                    By continuing, you agree to our{' '}
                    <Box component="span" sx={{ textDecoration: 'underline', cursor: 'pointer' }}>
                        Terms of Service
                    </Box>
                    {' '}and{' '}
                    <Box component="span" sx={{ textDecoration: 'underline', cursor: 'pointer' }}>
                        Privacy Policy
                    </Box>
                </Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;