import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { useHistory } from 'react-router-dom';
import { useBaby } from '../contexts/BabyContext';

// Data for the 10 Wonder Weeks
const wonderWeeksData = [
    {
        id: 1,
        name: 'The World of Changing Sensations',
        startWeek: 4,
        endWeek: 5,
        description: 'Bé trở nên nhạy cảm hơn với các giác quan. Bé có thể khóc nhiều hơn, đòi bú thường xuyên hơn và cần được âu yếm nhiều hơn.',
        skills: [
            'Nhìn chăm chú hơn và lâu hơn.',
            'Phản ứng rõ rệt hơn với âm thanh, mùi vị.',
            'Có nụ cười đầu tiên có ý thức.',
            'Hệ tiêu hóa phát triển, có thể ợ hơi nhiều hơn.',
        ],
    },
    {
        id: 2,
        name: 'The World of Patterns',
        startWeek: 7,
        endWeek: 9,
        description: 'Bé bắt đầu nhận ra các quy luật và khuôn mẫu trong thế giới xung quanh. Bé có thể kiểm soát cơ thể tốt hơn.',
        skills: [
            'Phát hiện ra tay và chân của mình.',
            'Tạo ra âm thanh và lắng nghe chúng.',
            'Thích nhìn vào các hình ảnh có độ tương phản cao.',
            'Giữ đầu ổn định hơn.',
        ],
    },
    {
        id: 3,
        name: 'The World of Smooth Transitions',
        startWeek: 11,
        endWeek: 12,
        description: 'Bé nhận thức được những thay đổi tinh tế trong âm thanh, chuyển động và cảm giác. Bé trở nên hoạt bát hơn.',
        skills: [
            'Chuyển động mượt mà hơn, ít giật cục.',
            'Theo dõi đồ vật bằng mắt và quay đầu theo.',
            'Phát ra nhiều âm thanh bập bẹ đa dạng.',
            'Đưa tay hoặc đồ vật vào miệng.',
        ],
    },
    {
        id: 4,
        name: 'The World of Events',
        startWeek: 14,
        endWeek: 19,
        description: 'Đây là bước nhảy vọt lớn! Bé hiểu được chuỗi các sự kiện đơn giản và bắt đầu học về nguyên nhân - kết quả.',
        skills: [
            'Nắm, bắt, và lắc đồ vật có chủ đích.',
            'Lật từ ngửa sang sấp (hoặc ngược lại).',
            'Phản ứng với tên của mình.',
            'Bắt đầu ăn dặm (nếu được giới thiệu).',
        ],
    },
    {
        id: 5,
        name: 'The World of Relationships',
        startWeek: 22,
        endWeek: 26,
        description: 'Bé nhận thức được khoảng cách và mối quan hệ giữa các đồ vật, con người. Nỗi sợ người lạ có thể bắt đầu.',
        skills: [
            'Hiểu rằng mẹ có thể rời đi và quay lại.',
            'Bắt đầu bò hoặc trườn.',
            'Chuyển đồ vật từ tay này sang tay kia.',
            'Quan tâm đến các chi tiết nhỏ của đồ chơi.',
        ],
    },
    {
        id: 6,
        name: 'The World of Categories',
        startWeek: 33,
        endWeek: 37,
        description: 'Bé bắt đầu phân loại mọi thứ. Bé hiểu rằng một con chó là con chó, dù nó to hay nhỏ, lông xù hay lông mượt.',
        skills: [
            'Bắt chước các hành động và âm thanh.',
            'Thể hiện cảm xúc rõ ràng hơn (vui, buồn, giận).',
            'Chỉ vào những thứ bé muốn.',
            'Bắt đầu vịn để đứng lên.',
        ],
    },
    {
        id: 7,
        name: 'The World of Sequences',
        startWeek: 41,
        endWeek: 46,
        description: 'Bé hiểu rằng để đạt được mục tiêu, cần phải thực hiện một chuỗi các hành động theo thứ tự.',
        skills: [
            'Chơi các trò chơi lắp ráp, xếp chồng.',
            'Hiểu các câu lệnh đơn giản như "đưa cho mẹ".',
            'Vẫy tay chào tạm biệt.',
            'Tập những bước đi đầu tiên.',
        ],
    },
    {
        id: 8,
        name: 'The World of Programs',
        startWeek: 50,
        endWeek: 55,
        description: 'Bé hiểu rằng có nhiều cách khác nhau để đạt được cùng một mục tiêu và có thể lựa chọn "chương trình" phù hợp.',
        skills: [
            'Bắt đầu có những cơn ăn vạ để thử thách giới hạn.',
            'Sử dụng thìa hoặc dĩa.',
            'Nói được nhiều từ hơn.',
            'Giúp đỡ các công việc đơn giản trong nhà.',
        ],
    },
    {
        id: 9,
        name: 'The World of Principles',
        startWeek: 59,
        endWeek: 64,
        description: 'Bé bắt đầu thử nghiệm với các quy tắc và hậu quả. Bé học cách đàm phán và hiểu khái niệm "của con" và "của mẹ".',
        skills: [
            'Chơi các trò chơi giả vờ phức tạp hơn.',
            'Nhận biết và gọi tên các bộ phận cơ thể.',
            'Nói được các câu ngắn.',
            'Thể hiện sự độc lập, muốn tự làm mọi việc.',
        ],
    },
    {
        id: 10,
        name: 'The World of Systems',
        startWeek: 72,
        endWeek: 77,
        description: 'Bé nhận ra mình là một cá thể riêng biệt với các quy tắc và giá trị riêng. Bé phát triển ý thức về bản thân.',
        skills: [
            'Hiểu và làm theo các quy tắc của gia đình.',
            'Phát triển sự đồng cảm với người khác.',
            'Có thể tự mặc quần áo đơn giản.',
            'Kể lại các sự kiện đã xảy ra.',
        ],
    },
];

const WonderWeeksPage: React.FC = () => {
    const history = useHistory();
    const { baby } = useBaby();

    const calculateAgeInWeeks = () => {
        if (!baby?.birthDate) return 0;
        // Note: Wonder Weeks are officially calculated from the due date. 
        // We are using birth date as an approximation.
        const birthDate = new Date(baby.birthDate);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - birthDate.getTime());
        const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
        return diffWeeks;
    };

    const ageInWeeks = calculateAgeInWeeks();

    const getCurrentAndNextLeap = () => {
        const currentLeap = wonderWeeksData.find(leap => ageInWeeks >= leap.startWeek && ageInWeeks <= leap.endWeek);
        const nextLeap = wonderWeeksData.find(leap => leap.startWeek > ageInWeeks);
        return { currentLeap, nextLeap };
    };

    const { currentLeap, nextLeap } = getCurrentAndNextLeap();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f3f4f6', pb: '80px' }}>
            {/* Header */}
            <Box sx={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                bgcolor: '#ffffff',
                borderBottom: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
                    <IconButton onClick={() => history.push('/')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15 18L9 12L15 6" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </IconButton>
                    <Typography variant="h6" sx={{ flexGrow: 1, textAlign: 'center', fontWeight: 'bold' }}>
                        Wonder Weeks
                    </Typography>
                    <Box sx={{ width: 40 }} />
                </Box>
            </Box>

            {/* Content */}
            <Box sx={{ p: 2 }}>
                <Box sx={{ mb: 3, p: 2, bgcolor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Typography sx={{ fontWeight: 'bold', color: '#1f2937', mb: 1 }}>Tuổi của bé: {ageInWeeks} tuần</Typography>
                    {currentLeap && <Typography sx={{ color: '#ef4444' }}>Bé đang ở trong Tuần Khủng Hoảng {currentLeap.id}!</Typography>}
                    {nextLeap && !currentLeap && <Typography sx={{ color: '#3b82f6' }}>Tuần Khủng Hoảng tiếp theo (Số {nextLeap.id}) sẽ bắt đầu vào khoảng tuần {nextLeap.startWeek}.</Typography>}
                     <Typography sx={{ fontSize: '0.8rem', color: '#6b7280', mt: 1 }}>
                        Lưu ý: Thời gian được tính từ ngày sinh và có thể thay đổi tùy theo sự phát triển của mỗi bé.
                    </Typography>
                </Box>

                {wonderWeeksData.map((leap, index) => {
                    const isCurrent = currentLeap?.id === leap.id;
                    const isNext = nextLeap?.id === leap.id && !currentLeap;
                    const isPast = leap.endWeek < ageInWeeks;

                    return (
                        <Box
                            key={leap.id}
                            sx={{
                                mb: 2,
                                bgcolor: 'white',
                                borderRadius: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                border: isCurrent ? '2px solid #ef4444' : (isNext ? '2px solid #3b82f6' : 'none'),
                                opacity: isPast ? 0.7 : 1,
                            }}
                        >
                            <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
                                <Typography sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#111827' }}>
                                    {`Tuần Khủng Hoảng ${leap.id}: ${leap.name}`}
                                </Typography>
                                <Typography sx={{ fontSize: '0.9rem', color: '#6b7280' }}>
                                    (Khoảng tuần {leap.startWeek} - {leap.endWeek})
                                </Typography>
                            </Box>
                            <Box sx={{ p: 2 }}>
                                <Typography sx={{ mb: 1.5, color: '#374151' }}>{leap.description}</Typography>
                                <Typography sx={{ fontWeight: 'bold', color: '#1f2937', mb: 1 }}>Các kỹ năng mới bé có thể học:</Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                                    {leap.skills.map((skill, i) => (
                                        <Typography component="li" key={i} sx={{ mb: 0.5, color: '#374151' }}>{skill}</Typography>
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default WonderWeeksPage;
