import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBaby } from '../contexts/BabyContext';

const BabyInfoPage: React.FC = () => {
    const { currentUser, login, register } = useAuth();
    const { baby, saveBabyData } = useBaby();
    
    // Auth form state
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [formData, setFormData] = useState({
        name: baby?.name || '',
        birthDate: baby?.birthDate ? new Date(baby.birthDate).toISOString().split('T')[0] : '',
        gender: baby?.gender || 'male',
        birthWeight: baby?.birthWeight || 0,
        birthHeight: baby?.birthHeight || 0,
        avatarUrl: baby?.avatarUrl || ''
    });

    // Material Design 3 colors
    const colors = {
        primary: '#6750A4',
        primaryContainer: '#EADDFF',
        secondary: '#625B71',
        secondaryContainer: '#E8DEF8',
        tertiary: '#7D5260',
        tertiaryContainer: '#FFD8E4',
        surface: '#FFFBFE',
        surfaceVariant: '#E7E0EC',
        outline: '#79747E',
        outlineVariant: '#CAC4D0',
        onSurface: '#1C1B1F',
        onSurfaceVariant: '#49454F',
        error: '#BA1A1A',
        errorContainer: '#FFDAD6'
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newBaby = {
            id: baby?.id || '1',
            name: formData.name,
            birthDate: new Date(formData.birthDate),
            gender: formData.gender as 'male' | 'female',
            birthWeight: Number(formData.birthWeight),
            birthHeight: Number(formData.birthHeight),
            avatarUrl: formData.avatarUrl
        };
        await saveBabyData(newBaby);
        
        // Show success message with Material Design styling
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background-color: ${colors.primaryContainer};
            color: ${colors.primary};
            padding: 16px 24px;
            border-radius: 24px;
            z-index: 1000;
            font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 500;
            box-shadow: 0 6px 10px 0 rgba(0, 0, 0, 0.14);
        `;
        successDiv.textContent = '✅ Thông tin bé đã được lưu!';
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
            document.body.removeChild(successDiv);
        }, 3000);
    };

    // Handle authentication
    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');
        
        try {
            if (authMode === 'login') {
                await login(email, password);
            } else {
                await register(email, password);
            }
        } catch (error: any) {
            setAuthError(error.message || 'Đã có lỗi xảy ra');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const inputStyle = {
        width: '100%',
        padding: '16px',
        border: `2px solid ${colors.outline}`,
        borderRadius: '28px',
        fontSize: '16px',
        backgroundColor: colors.surface,
        color: colors.onSurface,
        outline: 'none',
        transition: 'all 0.2s ease',
        fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box' as const
    };

    const buttonStyle = {
        width: '100%',
        padding: '16px',
        borderRadius: '24px',
        border: 'none',
        fontSize: '16px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: colors.primary,
        color: '#333333',
        marginTop: '16px'
    };

    const cardStyle = {
        backgroundColor: colors.surface,
        borderRadius: '16px',
        padding: '20px',
        margin: '16px 0',
        border: `1px solid ${colors.outlineVariant}`,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.12)'
    };

    return (
        <div style={{ 
            minHeight: '100vh', 
            backgroundColor: colors.surface,
            fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            paddingBottom: '100px'
        }}>
            <div style={{ padding: '24px' }}>
                {/* Authentication Section - Show when not logged in */}
                {!currentUser && (
                    <div style={cardStyle}>
                        <h2 style={{ 
                            margin: '0 0 24px 0',
                            fontSize: '20px',
                            fontWeight: '500',
                            color: colors.onSurface,
                            textAlign: 'center'
                        }}>
                            🔐 {authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'} để tiếp tục
                        </h2>

                        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '8px', 
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: colors.onSurface
                                }}>
                                    📧 Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    style={inputStyle}
                                    placeholder="Nhập email của bạn..."
                                />
                            </div>

                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '8px', 
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: colors.onSurface
                                }}>
                                    � Mật khẩu
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    style={inputStyle}
                                    placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)..."
                                />
                            </div>

                            {authError && (
                                <div style={{
                                    backgroundColor: colors.errorContainer,
                                    color: colors.error,
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    textAlign: 'center'
                                }}>
                                    ❌ {authError}
                                </div>
                            )}

                            <button
                                type="submit"
                                style={buttonStyle}
                                onMouseOver={(e) => {
                                    (e.target as HTMLButtonElement).style.backgroundColor = '#5A3E8C';
                                }}
                                onMouseOut={(e) => {
                                    (e.target as HTMLButtonElement).style.backgroundColor = colors.primary;
                                }}
                            >
                                {authMode === 'login' ? '🔓 Đăng nhập' : '📝 Đăng ký'}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setAuthMode(authMode === 'login' ? 'register' : 'login');
                                    setAuthError('');
                                }}
                                style={{
                                    ...buttonStyle,
                                    backgroundColor: colors.secondaryContainer,
                                    color: colors.secondary,
                                    marginTop: '8px'
                                }}
                            >
                                {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
                            </button>
                        </form>

                        <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            backgroundColor: colors.tertiaryContainer,
                            borderRadius: '12px',
                            fontSize: '14px',
                            color: colors.tertiary,
                            lineHeight: '1.5'
                        }}>
                            � <strong>Firebase đã được kích hoạt!</strong> Dữ liệu sẽ được lưu trữ an toàn trên Firebase Cloud.
                            Tài khoản của bạn sẽ được bảo mật theo Firebase Security Rules.
                        </div>
                    </div>
                )}

                {/* Baby Info Section - Show when logged in */}
                {currentUser && (
                    <>
                        {/* Welcome message */}
                        <div style={{
                            ...cardStyle,
                            backgroundColor: colors.primaryContainer,
                            marginBottom: '24px',
                            textAlign: 'center'
                        }}>
                            <h2 style={{ 
                                margin: '0 0 8px 0',
                                fontSize: '20px',
                                fontWeight: '500',
                                color: colors.primary
                            }}>
                                🎉 Chào mừng!
                            </h2>
                            <p style={{
                                margin: '0',
                                color: colors.primary,
                                fontSize: '14px'
                            }}>
                                Đã đăng nhập với: {currentUser.email}
                            </p>
                        </div>
                {/* Current Info Card */}
                {baby && (
                    <div style={{
                        ...cardStyle,
                        backgroundColor: colors.primaryContainer,
                        marginBottom: '24px'
                    }}>
                        <h3 style={{ 
                            margin: '0 0 16px 0',
                            fontSize: '18px',
                            fontWeight: '500',
                            color: colors.primary
                        }}>
                            🎉 Thông tin hiện tại
                        </h3>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '500', color: colors.primary }}>Tên:</span>
                                <span style={{ color: colors.primary }}>{baby.name}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '500', color: colors.primary }}>Ngày sinh:</span>
                                <span style={{ color: colors.primary }}>
                                    {new Date(baby.birthDate).toLocaleDateString('vi-VN')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '500', color: colors.primary }}>Giới tính:</span>
                                <span style={{ color: colors.primary }}>
                                    {baby.gender === 'male' ? '👶 Nam' : '👧 Nữ'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '500', color: colors.primary }}>Cân nặng khi sinh:</span>
                                <span style={{ color: colors.primary }}>{baby.birthWeight}g</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '500', color: colors.primary }}>Chiều cao khi sinh:</span>
                                <span style={{ color: colors.primary }}>{baby.birthHeight}cm</span>
                            </div>
                        </div>
                        {baby.avatarUrl && (
                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                <img
                                    src={baby.avatarUrl}
                                    alt="Ảnh bé"
                                    style={{
                                        maxWidth: '120px',
                                        maxHeight: '120px',
                                        borderRadius: '16px',
                                        objectFit: 'cover',
                                        border: `2px solid ${colors.primary}`
                                    }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Form */}
                <div style={cardStyle}>
                    <h3 style={{ 
                        margin: '0 0 24px 0',
                        fontSize: '18px',
                        fontWeight: '500',
                        color: colors.onSurface
                    }}>
                        {baby ? 'Cập nhật thông tin' : 'Nhập thông tin bé'}
                    </h3>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Name */}
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: colors.onSurface
                            }}>
                                👶 Tên bé
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                style={inputStyle}
                                placeholder="Nhập tên bé..."
                            />
                        </div>

                        {/* Birth Date */}
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: colors.onSurface
                            }}>
                                📅 Ngày sinh
                            </label>
                            <input
                                type="date"
                                name="birthDate"
                                value={formData.birthDate}
                                onChange={handleChange}
                                required
                                style={inputStyle}
                            />
                        </div>

                        {/* Gender */}
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: colors.onSurface
                            }}>
                                👫 Giới tính
                            </label>
                            <select
                                name="gender"
                                value={formData.gender}
                                onChange={handleChange}
                                style={{
                                    ...inputStyle,
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="male">👶 Nam</option>
                                <option value="female">👧 Nữ</option>
                            </select>
                        </div>

                        {/* Birth Weight */}
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: colors.onSurface
                            }}>
                                ⚖️ Cân nặng khi sinh (g)
                            </label>
                            <input
                                type="number"
                                name="birthWeight"
                                value={formData.birthWeight}
                                onChange={handleChange}
                                min="0"
                                style={inputStyle}
                                placeholder="Ví dụ: 3200"
                            />
                        </div>

                        {/* Birth Height */}
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: colors.onSurface
                            }}>
                                📏 Chiều cao khi sinh (cm)
                            </label>
                            <input
                                type="number"
                                name="birthHeight"
                                value={formData.birthHeight}
                                onChange={handleChange}
                                min="0"
                                style={inputStyle}
                                placeholder="Ví dụ: 50"
                            />
                        </div>

                        {/* Avatar URL */}
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: colors.onSurface
                            }}>
                                🖼️ Link ảnh đại diện (tùy chọn)
                            </label>
                            <input
                                type="url"
                                name="avatarUrl"
                                value={formData.avatarUrl}
                                onChange={handleChange}
                                style={inputStyle}
                                placeholder="https://example.com/avatar.jpg"
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            style={buttonStyle}
                            onMouseOver={(e) => {
                                (e.target as HTMLButtonElement).style.backgroundColor = '#5A3E8C';
                            }}
                            onMouseOut={(e) => {
                                (e.target as HTMLButtonElement).style.backgroundColor = colors.primary;
                            }}
                        >
                            💾 Lưu thông tin
                        </button>
                    </form>
                </div>
                    </>
                )}

                {/* Tips Card */}
                <div style={{
                    ...cardStyle,
                    backgroundColor: colors.tertiaryContainer,
                    marginTop: '24px'
                }}>
                    <h4 style={{ 
                        margin: '0 0 12px 0',
                        fontSize: '16px',
                        fontWeight: '500',
                        color: colors.tertiary
                    }}>
                        💡 Mẹo nhỏ
                    </h4>
                    <ul style={{ 
                        margin: 0, 
                        paddingLeft: '20px',
                        color: colors.tertiary,
                        lineHeight: '1.6'
                    }}>
                        <li>🔒 Dữ liệu được bảo mật bởi Firebase Security Rules</li>
                        <li>☁️ Thông tin được đồng bộ real-time trên tất cả thiết bị</li>
                        <li>👤 Mỗi tài khoản chỉ có thể truy cập dữ liệu của chính mình</li>
                        <li>🖼️ Ảnh đại diện nên sử dụng link trực tiếp đến hình ảnh</li>
                        <li>📊 Các thông tin này sẽ được sử dụng để tính toán thống kê phát triển</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default BabyInfoPage;