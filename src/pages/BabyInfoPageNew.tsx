import React, { useState } from 'react';
import { Box, Typography, Card, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import EditIcon from '@mui/icons-material/Edit';
import { useAuth } from '../contexts/AuthContext';
import { useBaby } from '../contexts/BabyContext';
import { firestore } from '../firebase/firestore';

const BabyInfoPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser } = useAuth();
    const { baby } = useBaby();
    
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({
        name: '',
        birthDate: '',
        dueDate: '',
        gender: 'male',
        birthWeight: '',
        birthHeight: ''
    });

    const handleEditClick = () => {
        if (baby) {
            setEditData({
                name: baby.name,
                birthDate: baby.birthDate ? new Date(baby.birthDate).toISOString().split('T')[0] : '',
                dueDate: baby.dueDate ? new Date(baby.dueDate).toISOString().split('T')[0] : '',
                gender: baby.gender,
                birthWeight: baby.birthWeight.toString(),
                birthHeight: baby.birthHeight.toString()
            });
            setIsEditing(true);
        }
    };

    const handleSave = async () => {
        if (currentUser && baby) {
            const updatedBaby = {
                ...baby,
                name: editData.name,
                birthDate: new Date(editData.birthDate),
                dueDate: editData.dueDate ? new Date(editData.dueDate) : undefined,
                gender: editData.gender as 'male' | 'female',
                birthWeight: Number(editData.birthWeight),
                birthHeight: Number(editData.birthHeight)
            };
            
            await firestore.saveBabyData(currentUser.uid, updatedBaby);
            setIsEditing(false);
            // Ideally we should refresh the baby context here, but for now let's assume it updates or requires reload
            window.location.reload();
        }
    };

    // Calculate baby's age in days
    const calculateAgeInDays = () => {
        if (!baby?.birthDate) return 0;
        const today = new Date();
        const birth = new Date(baby.birthDate);
        const diffTime = Math.abs(today.getTime() - birth.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    const ageInDays = calculateAgeInDays();

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: '#f6f7f8',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            pb: '80px' // Space for sticky footer
        }}>
            {/* Header */}
            <Box sx={{
                position: 'sticky',
                top: 0,
                bgcolor: '#f6f7f8',
                borderBottom: '1px solid #e5e7eb',
                zIndex: 10,
                px: 2,
                py: 2
            }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <IconButton
                        onClick={onBack}
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '12px',
                            '&:hover': {
                                bgcolor: 'rgba(0, 0, 0, 0.04)'
                            }
                        }}
                    >
                        <ArrowBackIosNewIcon sx={{ fontSize: 18, color: '#6b7f8a' }} />
                    </IconButton>
                    
                    <Box sx={{ textAlign: 'center', flex: 1 }}>
                        <Typography sx={{
                            fontSize: '18px',
                            fontWeight: 700,
                            color: '#101c22'
                        }}>
                            Welcome, {currentUser?.email?.split('@')[0] || 'User'}くん
                        </Typography>
                        <Typography sx={{
                            fontSize: '12px',
                            color: '#6b7f8a'
                        }}>
                            {baby?.name || 'Baby'} is {ageInDays} days old
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            bgcolor: '#e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {currentUser?.photoURL ? (
                            <img
                                src={currentUser.photoURL}
                                alt="User avatar"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                        ) : (
                            <Typography sx={{ fontSize: '16px', color: '#6b7f8a' }}>
                                {currentUser?.email?.[0].toUpperCase() || 'U'}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Main Content */}
            <Box sx={{ flex: 1, px: 3, py: 4 }}>
                {/* Profile Section */}
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    mb: 4
                }}>
                    {/* Avatar */}
                    <Box sx={{ position: 'relative' }}>
                        <Box
                            sx={{
                                width: 128,
                                height: 128,
                                borderRadius: '50%',
                                bgcolor: '#e5e7eb',
                                backgroundImage: baby?.avatarUrl ? `url(${baby.avatarUrl})` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {!baby?.avatarUrl && (
                                <Typography sx={{ fontSize: '48px', color: '#6b7f8a' }}>
                                    👶
                                </Typography>
                            )}
                        </Box>
                        <IconButton
                            sx={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                width: 32,
                                height: 32,
                                bgcolor: '#13a4ec',
                                color: '#ffffff',
                                borderRadius: '8px',
                                '&:hover': {
                                    bgcolor: '#0e8fd4'
                                }
                            }}
                        >
                            <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>

                    {/* Baby Info */}
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#101c22',
                            mb: 0.5
                        }}>
                            {baby?.name ? `Baby ${baby.name}` : 'Baby Name'}
                        </Typography>
                        <Typography sx={{
                            fontSize: '14px',
                            color: '#6b7f8a'
                        }}>
                            Born on {baby?.birthDate 
                                ? new Date(baby.birthDate).toLocaleDateString('en-US', { 
                                    month: 'long', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                }) 
                                : 'Date not set'}
                        </Typography>
                        <Typography sx={{
                            fontSize: '14px',
                            color: '#6b7f8a'
                        }}>
                            {baby?.gender === 'male' ? 'Male' : baby?.gender === 'female' ? 'Female' : 'Gender not set'}
                        </Typography>
                    </Box>
                </Box>

                {/* Basic Information Card */}
                <Box sx={{ mb: 3 }}>
                    <Typography sx={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#101c22',
                        mb: 1,
                        px: 0.5
                    }}>
                        Basic Information
                    </Typography>
                    <Card sx={{
                        bgcolor: '#ffffff',
                        borderRadius: '16px',
                        boxShadow: 'none',
                        border: '1px solid #e5e7eb'
                    }}>
                        <Box sx={{ py: 0.5 }}>
                            {[
                                { label: 'Name', value: baby?.name || 'Not set' },
                                { label: 'Date of Birth', value: baby?.birthDate 
                                    ? new Date(baby.birthDate).toLocaleDateString('en-US', { 
                                        month: 'long', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                    }) 
                                    : 'Not set' 
                                },
                                { label: 'Due Date', value: baby?.dueDate 
                                    ? new Date(baby.dueDate).toLocaleDateString('en-US', { 
                                        month: 'long', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                    }) 
                                    : 'Not set' 
                                },
                                { label: 'Gender', value: baby?.gender === 'male' ? 'Male' : baby?.gender === 'female' ? 'Female' : 'Not set' },
                                { label: 'Birth Weight', value: baby?.birthWeight ? `${baby.birthWeight} g` : 'Not set' },
                                { label: 'Birth Height', value: baby?.birthHeight ? `${baby.birthHeight} cm` : 'Not set' }
                            ].map((item, index, arr) => (
                                <Box key={item.label}>
                                    <Box sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        px: 2,
                                        py: 2
                                    }}>
                                        <Typography sx={{
                                            fontSize: '14px',
                                            color: '#6b7f8a'
                                        }}>
                                            {item.label}
                                        </Typography>
                                        <Typography sx={{
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            color: '#101c22'
                                        }}>
                                            {item.value}
                                        </Typography>
                                    </Box>
                                    {index < arr.length - 1 && (
                                        <Box sx={{
                                            height: '1px',
                                            bgcolor: '#e5e7eb',
                                            mx: 2
                                        }} />
                                    )}
                                </Box>
                            ))}
                        </Box>
                    </Card>
                </Box>

                {/* Health Information Card */}
                <Box sx={{ mb: 3 }}>
                    <Typography sx={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#101c22',
                        mb: 1,
                        px: 0.5
                    }}>
                        Health Information
                    </Typography>
                    <Card sx={{
                        bgcolor: '#ffffff',
                        borderRadius: '16px',
                        boxShadow: 'none',
                        border: '1px solid #e5e7eb'
                    }}>
                        <Box sx={{ py: 0.5 }}>
                            {[
                                { label: 'Blood Type', value: 'O+' },
                                { label: 'Allergies', value: 'None' },
                                { label: 'Medications', value: 'None' }
                            ].map((item, index, arr) => (
                                <Box key={item.label}>
                                    <Box sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        px: 2,
                                        py: 2
                                    }}>
                                        <Typography sx={{
                                            fontSize: '14px',
                                            color: '#6b7f8a'
                                        }}>
                                            {item.label}
                                        </Typography>
                                        <Typography sx={{
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            color: '#101c22'
                                        }}>
                                            {item.value}
                                        </Typography>
                                    </Box>
                                    {index < arr.length - 1 && (
                                        <Box sx={{
                                            height: '1px',
                                            bgcolor: '#e5e7eb',
                                            mx: 2
                                        }} />
                                    )}
                                </Box>
                            ))}
                        </Box>
                    </Card>
                </Box>
            </Box>

            {/* Sticky Footer */}
            <Box sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                bgcolor: '#f6f7f8',
                borderTop: '1px solid #e5e7eb',
                p: 2,
                zIndex: 10
            }}>
                <Button
                    fullWidth
                    onClick={handleEditClick}
                    sx={{
                        height: 48,
                        bgcolor: '#13a4ec',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: 700,
                        textTransform: 'none',
                        borderRadius: '12px',
                        '&:hover': {
                            bgcolor: '#0e8fd4'
                        }
                    }}
                >
                    Edit Profile
                </Button>
            </Box>

            {/* Edit Profile Dialog */}
            <Dialog open={isEditing} onClose={() => setIsEditing(false)}>
                <DialogTitle>Edit Baby Profile</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Name"
                            variant="outlined"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="Date of Birth"
                            variant="outlined"
                            type="date"
                            value={editData.birthDate}
                            onChange={(e) => setEditData({ ...editData, birthDate: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                        <TextField
                            label="Due Date"
                            variant="outlined"
                            type="date"
                            value={editData.dueDate}
                            onChange={(e) => setEditData({ ...editData, dueDate: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel>Gender</InputLabel>
                            <Select
                                value={editData.gender}
                                onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
                                label="Gender"
                            >
                                <MenuItem value="male">Male</MenuItem>
                                <MenuItem value="female">Female</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            label="Birth Weight (g)"
                            variant="outlined"
                            type="number"
                            value={editData.birthWeight}
                            onChange={(e) => setEditData({ ...editData, birthWeight: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="Birth Height (cm)"
                            variant="outlined"
                            type="number"
                            value={editData.birthHeight}
                            onChange={(e) => setEditData({ ...editData, birthHeight: e.target.value })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsEditing(false)} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} color="primary">
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default BabyInfoPage;