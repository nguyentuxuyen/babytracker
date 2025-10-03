import React from 'react';
import { Modal as MuiModal, Box, Typography, IconButton } from '@mui/material';
// import CloseIcon from '@mui/icons-material/Close';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    content: React.ReactNode;
}

const style = {
    position: 'absolute' as 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 400,
    bgcolor: 'background.paper',
    boxShadow: 24,
    p: 4,
};

const Modal: React.FC<ModalProps> = ({ open, onClose, title, content }) => {
    return (
        <MuiModal open={open} onClose={onClose}>
            <Box sx={style}>
                                <IconButton onClick={onClose} style={{ position: 'absolute', top: '10px', right: '10px' }}>
                    ✕
                </IconButton>
                {title && <Typography variant="h6" component="h2">{title}</Typography>}
                <Typography sx={{ mt: 2 }}>{content}</Typography>
            </Box>
        </MuiModal>
    );
};

export default Modal;