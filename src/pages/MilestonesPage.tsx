import React, { useState, useEffect } from 'react';
import { Box, Typography, Checkbox, IconButton, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useHistory } from 'react-router-dom';
import { useBaby } from '../contexts/BabyContext';
import { getCurrentUser } from '../firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

interface MilestoneItem {
    id: string;
    title: string;
    description: string;
    completed: boolean;
}

interface Milestone {
    id: string;
    month: number;
    category: string;
    milestones: MilestoneItem[];
}

const defaultMilestones: Milestone[] = [
  // Tháng 1
  { id: '1', month: 1, category: 'Tháng 1: Sơ sinh (tuần 1-4)', milestones: [
    { id: '1-1', title: 'Phản xạ bú', description: 'Bé tìm núm vú và bú một cách tự nhiên - đây là phản xạ sinh học quan trọng', completed: false },
    { id: '1-2', title: 'Phản xạ giật mình Moro', description: 'Bé giật mình và giơ hai tay lên khi nghe tiếng động hay cảm thấy bị rơi', completed: false },
    { id: '1-3', title: 'Nắm vật phản xạ', description: 'Bé tự động nắm chặt vật khi chạm vào lòng bàn tay - nắm rất vào', completed: false },
    { id: '1-4', title: 'Theo dõi ánh sáng', description: 'Bé bắt đầu theo dõi ánh sáng yếu gần mắt, mắt mở nhắm không kiểm soát', completed: false },
    { id: '1-5', title: 'Nghe âm thanh', description: 'Bé giật mình khi nghe tiếng động lớn, phản ứng với tiếng kêu của mẹ', completed: false },
    { id: '1-6', title: 'Khóc để giao tiếp', description: 'Bé sử dụng khóc để tỏ đói, mệt mỏi, khó chịu - khóc là hình thức giao tiếp chính', completed: false },
    { id: '1-7', title: 'Nâng đầu tạm thời', description: 'Bé có thể nâng đầu tạm thời khi nằm sấp, cổ rất yếu', completed: false },
    { id: '1-8', title: 'Phản xạ đặt chân', description: 'Khi bút chân bé chạm vào bề mặt, bé sẽ co chân lại', completed: false },
  ] },
  // Tháng 2
  { id: '2', month: 2, category: 'Tháng 2: Thích nghi & phản xạ (tuần 5-8)', milestones: [
    { id: '1-1', title: 'Nâng đầu có chủ ý', description: 'Bé nâng đầu trong vài giây khi nằm sấp, bắt đầu kiểm soát cơ cổ', completed: false },
    { id: '1-2', title: 'Theo dõi vật chuyển động', description: 'Bé theo dõi vật thể chuyển động chậm trước mặt, mắt có sự tập trung hơn', completed: false },
    { id: '1-3', title: 'Kêu tiếng khác nhau', description: 'Bé phát ra những tiếng kêu khác nhau theo nhu cầu - tiếng khác nhau khi đói vs mệt', completed: false },
    { id: '1-4', title: 'Cố gắng tập chủ động', description: 'Bé cố gắng làm những chuyển động có chủ ý, không chỉ phản xạ', completed: false },
    { id: '1-5', title: 'Liếc nhìn chéo', description: 'Bé bắt đầu có thể liếc nhìn chéo khi nghe tiếng, mắt có khả năng phối hợp', completed: false },
    { id: '1-6', title: 'Mỉm cười chói lói', description: 'Bé có những nụ cười tự phát không chủ ý - những lúc mê man', completed: false },
    { id: '1-7', title: 'Lắc tay chân', description: 'Bé bắt đầu lắc tay chân một cách không kiểm soát, nhiều chuyển động không có mục đích', completed: false },
    { id: '1-8', title: 'Tìm ánh sáng', description: 'Bé quay mặt về hướng ánh sáng, nhắm mắt khi có ánh sáng sáng', completed: false },
  ] },
  // Tháng 3
  { id: '3', month: 3, category: 'Tháng 3: Giao tiếp ban đầu (tuần 9-12)', milestones: [
    { id: '2-1', title: 'Cười xã hội', description: 'Bé cười khi được bố mẹ chơi đùa, trò chuyện - đây là cười có mục đích', completed: false },
    { id: '2-2', title: 'Nâng đầu cao hơn', description: 'Bé nâng đầu 45 độ khi nằm sấp, cổ mạnh hơn rất nhiều', completed: false },
    { id: '2-3', title: 'Âm thanh "ao", "ê"', description: 'Bé phát ra các âm tiết mở như "ao", "ê", bắt đầu thử thanh âm', completed: false },
    { id: '2-4', title: 'Theo dõi nhân vật', description: 'Bé theo dõi khuôn mặt người lớn đi chuyển, quan tâm đến bộ mặt', completed: false },
    { id: '2-5', title: 'Bắt đầu tập lại', description: 'Bé cố gắng lặp lại những tiếng kêu của bố mẹ, nghe và phản ứng', completed: false },
    { id: '2-6', title: 'Nhận biết cơ bản', description: 'Bé nhận biết bố mẹ qua mùi và giọng nói - phân biệt cơ bản với người lạ', completed: false },
    { id: '2-7', title: 'Kéo dài thời gian tỉnh', description: 'Bé có thể tỉnh lâu hơn và chú ý đến xung quanh trong những lúc tỉnh', completed: false },
    { id: '2-8', title: 'Cố gắng theo dõi mặt', description: 'Bé bắt đầu theo dõi những khuôn mặt, quan tâm đến đặc điểm khuôn mặt', completed: false },
  ] },
  // Tháng 4
  { id: '4', month: 4, category: 'Tháng 4: Tương tác xã hội (tuần 13-16)', milestones: [
    { id: '3-1', title: 'Nâng đầu cổ vững', description: 'Bé nâng đầu ở góc 90 độ, cổ bắt đầu rất vững khi nằm sấp', completed: false },
    { id: '3-2', title: 'Lắc tay chân có mục đích', description: 'Bé lắc tay chân với sự hứng thú, bắt đầu có kiểm soát hơn', completed: false },
    { id: '3-3', title: 'Âm thanh "ga", "ba"', description: 'Bé phát ra âm tiết guttural như "ga", "ba" - bập bẹ bắt đầu', completed: false },
    { id: '3-4', title: 'Bắt đầu bập bẹ rõ', description: 'Bé bắt đầu bập bẹ các âm thanh lặp lại như "ba-ba", "ga-ga"', completed: false },
    { id: '3-5', title: 'Cười to', description: 'Bé cười to và phát ra tiếng cười rõ ràng - cười là giao tiếp chính', completed: false },
    { id: '3-6', title: 'Ngã theo phía bố mẹ', description: 'Bé có thể ngã theo hướng của bố mẹ khi nằm sấp - kiểm soát cơ thể tốt hơn', completed: false },
    { id: '3-7', title: 'Liếc nhìn bàn tay', description: 'Bé bắt đầu quan sát bàn tay của mình, thích xem bàn tay chuyển động', completed: false },
    { id: '3-8', title: 'Chạm tới vật gần', description: 'Bé cố gắng chạm tới những vật treo gần nó, bắt đầu chủ động với tay', completed: false },
    { id: '3-9', title: 'Nhận biết bố mẹ rõ', description: 'Bé rõ ràng nhận biết bố mẹ với những người lạ, yêu thích bố mẹ hơn', completed: false },
  ] },
  // Tháng 5
  { id: '5', month: 5, category: 'Tháng 5: Phát triển vận động (tuần 17-20)', milestones: [
    { id: '4-1', title: 'Nâng ngực khi nằm sấp', description: 'Bé nâng ngực lên khỏi mặt đất khi nằm sấp, hỗ trợ bằng tay', completed: false },
    { id: '4-2', title: 'Lật từ sấp sang ngửa', description: 'Bé bắt đầu tập lật từ nằm sấp sang nằm ngửa - lật chưa hoàn toàn', completed: false },
    { id: '4-3', title: 'Cầm vật khi được đặt', description: 'Bé có thể cầm lấy đồ vật khi được đặt vào tay, nắm chặt hơn', completed: false },
    { id: '4-4', title: 'Tiếp cận tay đôi', description: 'Bé kết hợp cả hai tay lại gần nhau trước mặt, cầm vật cả hai tay', completed: false },
    { id: '4-5', title: 'Phát ra âm tiết đôi', description: 'Bé phát ra âm tiết lặp như "ba-ba", "ma-ma", "da-da" rõ ràng', completed: false },
    { id: '4-6', title: 'Hiểu giọng khác nhau', description: 'Bé phản ứng khác nhau tùy theo giọng nói của bố mẹ - giọng vui vs giọng nghiêm', completed: false },
    { id: '4-7', title: 'Đưa tay lên khi được gọi', description: 'Bé bắt đầu giơ tay lên khi bố mẹ muốn bế - phản ứng chủ động', completed: false },
  ] },
  // Tháng 6
  { id: '6', month: 6, category: 'Tháng 6: Khám phá cơ thể (tuần 21-24)', milestones: [
    { id: '5-1', title: 'Lăn từ ngửa sang sấp', description: 'Bé lắc lư phía bên để chuẩn bị lăn từ ngửa sang sấp', completed: false },
    { id: '5-2', title: 'Chạm vào chân', description: 'Bé chạm tới chân của mình và có thể cầm lấy, đưa chân vào miệng', completed: false },
    { id: '5-3', title: 'Bắt đầu giơ tay', description: 'Bé giơ tay để được bế lên - biểu hiện rõ ràng muốn được bế', completed: false },
    { id: '5-4', title: 'Quan sát đồ vật', description: 'Bé quan sát đồ vật trong tay một cách tập trung, xoay xở đồ vật', completed: false },
    { id: '5-5', title: 'Phát âm thanh liên tục', description: 'Bé phát ra các âm thanh liên tục trong khoảng thời gian dài - bập bẹ rất nhiều', completed: false },
    { id: '5-6', title: 'Biểu hiện vui sợ', description: 'Bé bắt đầu thể hiện cảm xúc vui và sợ hãi, phản ứng với tiếng lạ', completed: false },
    { id: '5-7', title: 'Cười với người lạ', description: 'Bé bắt đầu cười với người lạ nhưng không nhiều như với bố mẹ', completed: false },
    { id: '5-8', title: 'Quan sát cuộc sống xung quanh', description: 'Bé bắt đầu chú ý nhiều hơn đến chuyển động, ánh sáng, tiếng động xung quanh', completed: false },
  ] },
  // Tháng 7
  { id: '7', month: 7, category: 'Tháng 7: Ngồi và khám phá (tuần 25-28)', milestones: [
    { id: '6-1', title: 'Lật từ ngửa sang sấp hoàn toàn', description: 'Bé có thể lật hoàn toàn từ nằm ngửa sang nằm sấp một cách mượt mà', completed: false },
    { id: '6-2', title: 'Ngồi với tựa', description: 'Bé có thể ngồi khi được tựa vào đệm hoặc gối, cần hỗ trợ cụm trục', completed: false },
    { id: '6-3', title: 'Cầm 2 vật cùng lúc', description: 'Bé có thể cầm một vật ở mỗi tay, không phải chỉ một tay', completed: false },
    { id: '6-4', title: 'Chuyển vật tay sang tay', description: 'Bé bắt đầu học chuyển vật từ tay này sang tay kia - điều phối tay được', completed: false },
    { id: '6-5', title: 'Bập bẹ rõ ràng', description: 'Bé bập bẹ rõ ràng với các âm tiết khác nhau, bắt đầu thử âm thanh mới', completed: false },
    { id: '6-6', title: 'Hiểu "không"', description: 'Bé bắt đầu hiểu ý nghĩa của từ "không" và có phản ứng', completed: false },
    { id: '6-7', title: 'Quan tâm đến đồ ăn', description: 'Bé quan tâm đến đồ ăn của bố mẹ, có thể sẵn sàng ăn dặm từ 6 tháng', completed: false },
    { id: '6-8', title: 'Vui khi được chạm', description: 'Bé vui khi được bố mẹ chạm vào, kích thích - thích liên lạc vật lý', completed: false },
  ] },
  // Tháng 8
  { id: '8', month: 8, category: 'Tháng 8: Phát triển tinh tế (tuần 29-32)', milestones: [
    { id: '7-1', title: 'Ngồi vững hơn', description: 'Bé ngồi vững hơn, cần sự hỗ trợ ít hơn, bắt đầu tự cân bằng', completed: false },
    { id: '7-2', title: 'Cắp vật dạng hình vuông', description: 'Bé có thể cắp vật dạng hình vuông bằng cách kẹp với các ngón tay', completed: false },
    { id: '7-3', title: 'Nắm ngón tay bé', description: 'Bé có thể giơ tay để bố mẹ cầm ngón tay và bé nắm lại - tương tác chủ động', completed: false },
    { id: '7-4', title: 'Chuyển động chuẩn bị bò', description: 'Bé bắt đầu làm những chuyển động chuẩn bị để bò - lắc lư phía trước', completed: false },
    { id: '7-5', title: 'Kêu "ba" rõ ràng', description: 'Bé có thể kêu "ba" hoặc "bà" rõ ràng và có mục đích', completed: false },
    { id: '7-6', title: 'Vẫy tay bắt chước', description: 'Bé bắt chước vẫy tay khi bố mẹ làm - bắt đầu học hỏi từ bắt chước', completed: false },
    { id: '7-7', title: 'Quan tâm đến người lạ', description: 'Bé bắt đầu quan tâm đến người lạ, mặc dù vẫn thích bố mẹ hơn', completed: false },
  ] },
  // Tháng 9
  { id: '9', month: 9, category: 'Tháng 9: Bò và độc lập (tuần 33-36)', milestones: [
    { id: '8-1', title: 'Bò lùi', description: 'Bé bắt đầu bò lùi khi chuẩn bị cho chuyển động tiến - hiểu được hướng', completed: false },
    { id: '8-2', title: 'Bò 4 chân', description: 'Bé bắt đầu bò hoặc sử dụng phương pháp bò riêng của mình - di chuyển nhanh', completed: false },
    { id: '8-3', title: 'Chuyển vật qua lại', description: 'Bé có thể chuyển vật từ tay này sang tay kia khéo léo hơn', completed: false },
    { id: '8-4', title: 'Nhặt vật nhỏ', description: 'Bé bắt đầu cố gắng nhặt các vật nhỏ - phát triển nhìn, tay phối hợp', completed: false },
    { id: '8-5', title: 'Phát âm "ma", "ba", "da"', description: 'Bé phát ra các âm tiết khác nhau như "ma", "ba", "da" rõ ràng', completed: false },
    { id: '8-6', title: 'Hiểu chỉ dẫn đơn giản', description: 'Bé bắt đầu hiểu các chỉ dẫn đơn giản như "cho mẹ", "đây"', completed: false },
    { id: '8-7', title: 'Chơi "cù cù"', description: 'Bé thích chơi trò cù cù với bố mẹ - hiểu được trò chơi', completed: false },
    { id: '8-8', title: 'Quan sát mọi thứ', description: 'Bé quan sát mọi thứ xung quanh, quan tâm đến các vật thể nhỏ', completed: false },
  ] },
  // Tháng 10
  { id: '10', month: 10, category: 'Tháng 10: Di chuyển nhanh hơn (tuần 37-40)', milestones: [
    { id: '9-1', title: 'Bò tiến độc lập', description: 'Bé bò tiến một cách độc lập và khá nhanh - di chuyển rất linh hoạt', completed: false },
    { id: '9-2', title: 'Đứng với sự hỗ trợ', description: 'Bé có thể đứng khi bám vào đồ đạc hoặc người lớn - cấu trúc khỏe hơn', completed: false },
    { id: '9-3', title: 'Nhặt bằng pincer grasp', description: 'Bé có thể nhặt các vật nhỏ bằng ngón cái và ngón trỏ - chính xác hơn', completed: false },
    { id: '9-4', title: 'Lôi vật ra khỏi lồng', description: 'Bé có thể lôi các vật ra khỏi lồng hoặc hộp - hiểu được không gian', completed: false },
    { id: '9-5', title: 'Nói từ đầu tiên', description: 'Bé có thể nói từ đầu tiên có nghĩa như "ba", "mẹ" - giao tiếp ngôn ngữ', completed: false },
    { id: '9-6', title: 'Vỗ tay bắt chước', description: 'Bé bắt chước vỗ tay khi bố mẹ vỗ - toàn bộ phối hợp được', completed: false },
    { id: '9-7', title: 'Lắc đầu từ chối', description: 'Bé bắt đầu lắc đầu để từ chối hay nói không - giao tiếp hiệu quả hơn', completed: false },
    { id: '9-8', title: 'Tìm đồ vật', description: 'Bé bắt đầu tìm đồ vật bị che đi - hiểu được tính vĩnh cửu của vật thể', completed: false },
  ] },
  // Tháng 11
  { id: '11', month: 11, category: 'Tháng 11: Chuẩn bị bước đi (tuần 41-44)', milestones: [
    { id: '10-1', title: 'Đứng vững', description: 'Bé có thể đứng vững khi được hỗ trợ hoặc bám vào đồ đạc một cách ổn định', completed: false },
    { id: '10-2', title: 'Bước đi có tựa', description: 'Bé tập đi bằng cách bám vào đồ đạc và di chuyển bên cạnh nó - bước từng bước', completed: false },
    { id: '10-3', title: 'Chỉ vào đồ vật', description: 'Bé có thể chỉ vào những gì mình muốn - giao tiếp không lời hiệu quả', completed: false },
    { id: '10-4', title: 'Xếp đồ chồng lên', description: 'Bé có thể xếp vật này chồng lên vật khác - phát triển khái niệm không gian', completed: false },
    { id: '10-5', title: 'Nói 2-3 từ', description: 'Bé có thể nói 2-3 từ rõ ràng - giao tiếp ngôn ngữ phát triển', completed: false },
    { id: '10-6', title: 'Cầm tay yêu cầu', description: 'Bé cầm tay bố mẹ để yêu cầu sự trợ giúp hoặc chỉ dẫn', completed: false },
    { id: '10-7', title: 'Hiểu 2 chỉ dẫn', description: 'Bé bắt đầu hiểu 2 chỉ dẫn liên tiếp - hiểu ngôn ngữ phát triển', completed: false },
  ] },
  // Tháng 12
  { id: '12', month: 12, category: 'Tháng 12: Tập bước đi (tuần 45-48)', milestones: [
    { id: '11-1', title: 'Đứng tạm thời không bám', description: 'Bé có thể đứng 1-2 giây mà không bám vào gì - cân bằng đang cải thiện', completed: false },
    { id: '11-2', title: 'Bước lê', description: 'Bé bắt đầu bước lê từ từ bệ nọ sang bệ kia - bước đầu tiên cách nhau', completed: false },
    { id: '11-3', title: 'Uống từ cốc', description: 'Bé có thể uống từ cốc nếu bố mẹ giúp hoặc bám vào - kiểm soát cơ miệng được', completed: false },
    { id: '11-4', title: 'Dùng thìa cơ bản', description: 'Bé cố gắng dùng thìa mặc dù vẫn còn rơi vãi - tự ăn được phần nào', completed: false },
    { id: '11-5', title: 'Nói 3-4 từ', description: 'Bé có thể nói 3-4 từ, vốn từ vựng mở rộng - giao tiếp tốt hơn', completed: false },
    { id: '11-6', title: 'Chơi các trò chơi đơn giản', description: 'Bé chơi các trò chơi cụm từ đơn giản - thích chơi chung', completed: false },
    { id: '11-7', title: 'Hiểu về bản thân', description: 'Bé bắt đầu hiểu về bản thân, chỉ vào các phần cơ thể khi hỏi', completed: false },
  ] },
  // Tháng 13
  { id: '13', month: 13, category: 'Tháng 13 (1 tuổi): Những bước đầu tiên', milestones: [
    { id: '12-1', title: 'Đi tự do', description: 'Bé có thể tự đi lại được mà không cần sự trợ giúp - mốc phát triển quan trọng', completed: false },
    { id: '12-2', title: 'Ngã và đứng lên', description: 'Bé có thể ngã và cố gắng đứng lên tự mình - cân bằng và can đảm', completed: false },
    { id: '12-3', title: 'Cầm thìa cách riêng', description: 'Bé cầm thìa theo cách riêng của mình để ăn - tự ăn được nhiều', completed: false },
    { id: '12-4', title: 'Uống từ cốc', description: 'Bé có thể uống từ cốc mà bố mẹ cầm - tự chủ hơn', completed: false },
    { id: '12-5', title: 'Nói 4-6 từ', description: 'Bé có vốn từ vựng tăng lên, nói 4-6 từ khác nhau rõ ràng', completed: false },
    { id: '12-6', title: 'Chỉ vào phần cơ thể', description: 'Bé có thể chỉ vào một số phần cơ thể khi bố mẹ hỏi - hiểu ngôn ngữ', completed: false },
    { id: '12-7', title: 'Tát hay lắc đầu', description: 'Bé hiểu và tát hay lắc đầu để phản ứng - giao tiếp không lời hiệu quả', completed: false },
    { id: '12-8', title: 'Chơi giả vờ đơn giản', description: 'Bé bắt đầu chơi trò giả vờ đơn giản như cho búp bê ăn', completed: false },
  ] },
  // Tháng 14
  { id: '14', month: 14, category: 'Tháng 14: Bước đi ổn định (14-15 tháng)', milestones: [
    { id: '13-1', title: 'Bước đi ổn định', description: 'Bé bước đi ổn định hơn, ít ngã hơn - tốc độ di chuyển tăng', completed: false },
    { id: '13-2', title: 'Leo lên ghế', description: 'Bé bắt đầu leo lên ghế thấp hoặc nấc thang - mạo hiểm tinh thần', completed: false },
    { id: '13-3', title: 'Quay trang sách', description: 'Bé có thể quay trang sách (tuy không chính xác) - kiểm soát tay tốt hơn', completed: false },
    { id: '13-4', title: 'Vẽ scribble', description: 'Bé có thể cầm bút và vẽ những đường vẩy vơ - tính sáng tạo phát triển', completed: false },
    { id: '13-5', title: 'Nói 6-10 từ', description: 'Bé mở rộng vốn từ vựng lên 6-10 từ - giao tiếp ngôn ngữ tốt', completed: false },
    { id: '13-6', title: 'Bắt chước hành động', description: 'Bé thích bắt chước hành động như quét nhà, chải tóc - học từ bố mẹ', completed: false },
    { id: '13-7', title: 'Chỉ vào hình ảnh', description: 'Bé chỉ vào hình ảnh trong sách và phát ra âm thanh - thích sách hình', completed: false },
  ] },
  // Tháng 15
  { id: '15', month: 15, category: 'Tháng 15: Học hỏi từ bắt chước (15-16 tháng)', milestones: [
    { id: '14-1', title: 'Bước đi và chạy chậm', description: 'Bé bước đi bình thường và tập chạy chậm - tốc độ di chuyển tăng', completed: false },
    { id: '14-2', title: 'Đá bóng', description: 'Bé có thể đá bóng khi bố mẹ hỗ trợ - hiểu được hành động có mục đích', completed: false },
    { id: '14-3', title: 'Cầm bút viết', description: 'Bé cầm bút viết và cố gắng vẽ - bắt đầu giai đoạn vẽ', completed: false },
    { id: '14-4', title: 'Xếp khối', description: 'Bé có thể xếp 2-3 khối lên nhau - hiểu được cấu trúc không gian', completed: false },
    { id: '14-5', title: 'Nói 10-15 từ', description: 'Bé nói 10-15 từ, vốn từ phát triển nhanh - giao tiếp tốt', completed: false },
    { id: '14-6', title: 'Hiểu câu lệnh 2 bước', description: 'Bé bắt đầu hiểu câu lệnh có 2 bước - nghe hiểu tốt hơn', completed: false },
    { id: '14-7', title: 'Tìm đồ vật bị che', description: 'Bé tìm đồ vật bị che giấu - hiểu tính vĩnh cửu của vật thể', completed: false },
  ] },
  // Tháng 16
  { id: '16', month: 16, category: 'Tháng 16: Độc lập tăng cao (16-17 tháng)', milestones: [
    { id: '15-1', title: 'Chạy tương đối tốt', description: 'Bé chạy tương đối tốt, ít ngã hơn - tốc độ và cân bằng tốt', completed: false },
    { id: '15-2', title: 'Cầu thang có tay vịn', description: 'Bé leo cầu thang khi bó tay vịn hoặc bố mẹ - toàn bộ phối hợp được', completed: false },
    { id: '15-3', title: 'Ăn tự chủ', description: 'Bé có thể tự ăn bằng tay, dùng thìa cơ bản - ít rơi vãi hơn', completed: false },
    { id: '15-4', title: 'Tháo bỏ quần áo', description: 'Bé bắt đầu có thể tháo bỏ những đồ đơn giản - tự chủ cao hơn', completed: false },
    { id: '15-5', title: 'Nói 15-20 từ', description: 'Bé nói 15-20 từ, bắt đầu ghép từ - giao tiếp câu đơn giản', completed: false },
    { id: '15-6', title: 'Chỉ vào hình ảnh', description: 'Bé chỉ vào hình ảnh và phát ra âm thanh hoặc nói từ - thích sách hình', completed: false },
    { id: '15-7', title: 'Hiểu câu chỉ dẫn phức tạp', description: 'Bé bắt đầu hiểu câu chỉ dẫn phức tạp hơn - nghe hiểu tốt hơn', completed: false },
  ] },
  // Tháng 17
  { id: '17', month: 17, category: 'Tháng 17: Giao tiếp mở rộng (17-18 tháng)', milestones: [
    { id: '16-1', title: 'Chạy và dừng', description: 'Bé có thể chạy và dừng lại khi bị bắt - kiểm soát cơ thể tốt', completed: false },
    { id: '16-2', title: 'Nhảy cơ bản', description: 'Bé cố gắng nhảy, tuy vẫn còn thô - bắt đầu nhảy', completed: false },
    { id: '16-3', title: 'Dùng thìa tốt hơn', description: 'Bé dùng thìa tốt hơn, rơi vãi ít hơn - tự ăn được nhiều', completed: false },
    { id: '16-4', title: 'Uống từ cốc độc lập', description: 'Bé có thể uống nước từ cốc một mình - tự chủ cao', completed: false },
    { id: '16-5', title: 'Nói câu 2 từ', description: 'Bé bắt đầu nói câu 2 từ đơn giản - giao tiếp câu tốt hơn', completed: false },
    { id: '16-6', title: 'Hôn bố mẹ', description: 'Bé có thể hôn bố mẹ hoặc bắt chước hôn - cảm xúc thể hiện rõ', completed: false },
    { id: '16-7', title: 'Chỉ vào phần cơ thể khác', description: 'Bé chỉ vào các phần cơ thể khác ngoài mặt - kiến thức về cơ thể', completed: false },
  ] },
  // Tháng 18
  { id: '18', month: 18, category: 'Tháng 18: Phát triển tinh tế (18-19 tháng)', milestones: [
    { id: '17-1', title: 'Chạy và giữ thăng bằng', description: 'Bé chạy và giữ thăng bằng tốt - di chuyển rất linh hoạt', completed: false },
    { id: '17-2', title: 'Nhảy nhẹ', description: 'Bé có thể nhảy nhẹ, bắt đầu khỏi mặt đất - nhảy được thực sự', completed: false },
    { id: '17-3', title: 'Cấu trúc đơn giản', description: 'Bé có thể xếp 4-5 khối hoặc tạo cấu trúc đơn giản - sáng tạo phát triển', completed: false },
    { id: '17-4', title: 'Vẽ hình tròn', description: 'Bé bắt đầu vẽ được hình tròn hoặc hình đơn giản - khả năng tinh tế', completed: false },
    { id: '17-5', title: 'Nói câu 3 từ', description: 'Bé nói được câu 3 từ đơn giản - giao tiếp ngôn ngữ tốt', completed: false },
    { id: '17-6', title: 'Làm theo chỉ dẫn', description: 'Bé làm theo 2-3 chỉ dẫn liên tiếp - nghe hiểu tốt', completed: false },
    { id: '17-7', title: 'Tự đi vệ sinh ngày', description: 'Bé bắt đầu tập tự đi vệ sinh ban ngày - sự phát triển quan trọng', completed: false },
  ] },
  // Tháng 19
  { id: '19', month: 19, category: 'Tháng 19 (1.5 tuổi): Độc lập và sáng tạo', milestones: [
    { id: '18-1', title: 'Chạy lưỡng lự', description: 'Bé chạy với lưỡng lự, tốc độ tăng - chạy rất linh hoạt', completed: false },
    { id: '18-2', title: 'Nhảy với cả hai chân', description: 'Bé có thể nhảy với cả hai chân cùng lúc - nhảy hoàn chỉnh', completed: false },
    { id: '18-3', title: 'Xoay tay xoay chân', description: 'Bé có thể xoay và uốn cong cơ thể một cách linh hoạt', completed: false },
    { id: '18-4', title: 'Ăn tương đối sạch', description: 'Bé ăn tương đối sạch, còn một ít rơi vãi - khả năng tự ăn tốt', completed: false },
    { id: '18-5', title: 'Tự rửa tay đơn giản', description: 'Bé bắt đầu học rửa tay mặc dù chưa hiệu quả - vệ sinh tiến bộ', completed: false },
    { id: '18-6', title: 'Nói câu 4-5 từ', description: 'Bé nói được câu 4-5 từ, người lạ hiểu được phần lớn - ngôn ngữ tốt', completed: false },
    { id: '18-7', title: 'Chơi giả vờ', description: 'Bé chơi các trò chơi giả vờ đơn giản như cho búp bê ăn - tưởng tượng phát triển', completed: false },
    { id: '18-8', title: 'Nhận biết cảm xúc', description: 'Bé bắt đầu nhận biết và thể hiện các cảm xúc khác nhau - EQ phát triển', completed: false },
  ] }
];

const MilestonesPage: React.FC = () => {
    const history = useHistory();
    const { baby } = useBaby();
    
    const [milestonesData, setMilestonesData] = useState<Milestone[]>(defaultMilestones);
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [newItemTitle, setNewItemTitle] = useState('');
    const [newItemDescription, setNewItemDescription] = useState('');
    const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>(
        defaultMilestones.reduce((acc, month) => ({ ...acc, [month.id]: true }), {})
    );

    const toggleMonthExpansion = (monthId: string) => {
        setExpandedMonths(prev => ({ ...prev, [monthId]: !prev[monthId] }));
    };

    // Save milestones to Firebase
    const saveMilestones = React.useCallback(async (data: Milestone[]) => {
        const currentUser = getCurrentUser();
        if (!currentUser?.uid || !baby?.id) {
            console.log('Cannot save milestones: missing user or baby', { uid: currentUser?.uid, babyId: baby?.id });
            return;
        }
        
        try {
            const db = getFirestore();
            const milestoneDocRef = doc(db, `users/${currentUser.uid}/babies/${baby.id}/milestones/data`);
            await setDoc(milestoneDocRef, {
                milestones: data,
                updatedAt: new Date().toISOString()
            });
            console.log('Milestones saved successfully to Firebase');
        } catch (error) {
            console.error('Error saving milestones:', error);
        }
    }, [baby?.id]);

    // Load milestones from Firebase
    useEffect(() => {
        const loadMilestones = async () => {
            const currentUser = getCurrentUser();
            if (!currentUser?.uid || !baby?.id) {
                console.log('Cannot load milestones: missing user or baby', { uid: currentUser?.uid, babyId: baby?.id });
                return;
            }
            
            try {
                const db = getFirestore();
                const milestoneDocRef = doc(db, `users/${currentUser.uid}/babies/${baby.id}/milestones/data`);
                const milestoneDoc = await getDoc(milestoneDocRef);
                
                if (milestoneDoc.exists()) {
                    const data = milestoneDoc.data();
                    if (data?.milestones) {
                        const firebaseMilestones = data.milestones as Milestone[];
                        
                        // Check if migration is needed - look for month 0 in the data
                        const hasMonth0 = firebaseMilestones.some(cat => cat.month === 0);
                        
                        if (hasMonth0) {
                            console.log('Old milestone structure detected (month 0 found). Migrating to start from month 1...');
                            
                            // 1. Create a map of old milestone completions by checking both old and new ID formats
                            const completionMap = new Map<string, boolean>();
                            firebaseMilestones.forEach(category => {
                                category.milestones.forEach(item => {
                                    if (item.completed) {
                                        // Store both the original ID and the migrated ID pattern
                                        completionMap.set(item.id, true);
                                        
                                        // Also try to map old IDs (0-1) to new IDs (1-1) format
                                        const match = item.id.match(/^(\d+)-(\d+)$/);
                                        if (match) {
                                            const oldMonth = parseInt(match[1]);
                                            const itemNum = match[2];
                                            const newId = `${oldMonth + 1}-${itemNum}`;
                                            completionMap.set(newId, true);
                                        }
                                    }
                                });
                            });

                            // 2. Create a new structure from default, preserving completed status
                            const migratedData = defaultMilestones.map(newCategory => ({
                                ...newCategory,
                                milestones: newCategory.milestones.map(newItem => ({
                                    ...newItem,
                                    completed: completionMap.has(newItem.id) || newItem.completed
                                }))
                            }));

                            console.log('Migration complete. Migrated from month 0 to month 1:', migratedData);
                            setMilestonesData(migratedData);
                            saveMilestones(migratedData); // Save the migrated structure back to Firebase
                        } else {
                            console.log('Loaded milestones from Firebase:', firebaseMilestones);
                            setMilestonesData(firebaseMilestones);
                        }
                    }
                } else {
                    console.log('No milestones document found, using defaults');
                    // If no data on firebase, ensure we save the default structure
                    saveMilestones(defaultMilestones);
                }
            } catch (error) {
                console.error('Error loading milestones:', error);
            }
        };
        
        loadMilestones();
    }, [baby?.id, saveMilestones]);

    // Calculate baby's current age in months
    const calculateAgeInMonths = () => {
        if (!baby?.birthDate) return 0;
        const birthDate = new Date(baby.birthDate);
        const today = new Date();
        const months = (today.getFullYear() - birthDate.getFullYear()) * 12 + 
                      (today.getMonth() - birthDate.getMonth());
        return Math.max(0, months);
    };

    const currentAgeMonths = calculateAgeInMonths();

    const handleToggleMilestone = (categoryId: string, milestoneId: string) => {
        const newData = milestonesData.map(category =>
            category.id === categoryId
                ? {
                      ...category,
                      milestones: category.milestones.map(milestone =>
                          milestone.id === milestoneId
                              ? { ...milestone, completed: !milestone.completed }
                              : milestone
                      )
                  }
                : category
        );
        setMilestonesData(newData);
        saveMilestones(newData);
    };

    const handleAddItem = () => {
        if (!newItemTitle.trim() || !selectedCategoryId) return;
        
        const newData = milestonesData.map(category => {
            if (category.id === selectedCategoryId) {
                const newId = `${category.id}-${Date.now()}`;
                return {
                    ...category,
                    milestones: [
                        ...category.milestones,
                        {
                            id: newId,
                            title: newItemTitle.trim(),
                            description: newItemDescription.trim(),
                            completed: false
                        }
                    ]
                };
            }
            return category;
        });
        
        setMilestonesData(newData);
        saveMilestones(newData);
        setOpenAddDialog(false);
        setNewItemTitle('');
        setNewItemDescription('');
        setSelectedCategoryId('');
    };

    const getCompletionPercentage = (category: Milestone) => {
        const completed = category.milestones.filter(m => m.completed).length;
        const total = category.milestones.length;
        return Math.round((completed / total) * 100);
    };

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: '#f6f7f8',
            pb: '80px'
        }}>
            {/* Header */}
            <Box sx={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                bgcolor: '#ffffff',
                borderBottom: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 2,
                    py: 1.5
                }}>
                    <IconButton
                        onClick={() => history.push('/')}
                        sx={{
                            color: '#13a4ec',
                            '&:hover': { bgcolor: '#f0f9ff' }
                        }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </IconButton>
                    <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: '20px', fontWeight: 700, color: '#101c22' }}>
                            Milestones
                        </Typography>
                        <Typography sx={{ fontSize: '13px', color: '#6b7f8a' }}>
                            {baby?.name ? `${baby.name} - ${currentAgeMonths} tháng tuổi` : 'Theo dõi phát triển của bé'}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Content */}
            <Box sx={{ px: 2, pt: 2 }}>
                {milestonesData.map((category) => {
                    const isRelevant = currentAgeMonths === category.month;
                    const completionPercentage = getCompletionPercentage(category);
                    
                    return (
                        <Box
                            key={category.id}
                            sx={{
                                mb: 2,
                                bgcolor: '#ffffff',
                                borderRadius: '16px',
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                                overflow: 'hidden',
                                opacity: isRelevant ? 1 : 0.7
                            }}
                        >
                            {/* Category Header */}
                            <Box sx={{
                                p: 2,
                                borderBottom: '1px solid #e5e7eb',
                                bgcolor: isRelevant ? '#f0f9ff' : '#ffffff'
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                        <IconButton
                                            onClick={() => toggleMonthExpansion(category.id)}
                                            sx={{
                                                p: 0.5,
                                                width: 32,
                                                height: 32,
                                                color: '#13a4ec',
                                                '&:hover': { bgcolor: '#f0f9ff' }
                                            }}
                                        >
                                            <svg 
                                                width="20" 
                                                height="20" 
                                                viewBox="0 0 24 24" 
                                                fill="none" 
                                                xmlns="http://www.w3.org/2000/svg"
                                                style={{
                                                    transform: expandedMonths[category.id] ? 'rotate(0deg)' : 'rotate(-90deg)',
                                                    transition: 'transform 0.2s ease'
                                                }}
                                            >
                                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </IconButton>
                                        <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#101c22' }}>
                                            {category.category}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {isRelevant && (
                                            <Box sx={{
                                                px: 1.5,
                                                py: 0.5,
                                                bgcolor: '#13a4ec',
                                                color: '#ffffff',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: 600
                                            }}>
                                                Hiện tại
                                            </Box>
                                        )}
                                        <IconButton
                                            onClick={() => {
                                                setSelectedCategoryId(category.id);
                                                setOpenAddDialog(true);
                                            }}
                                            sx={{
                                                width: 32,
                                                height: 32,
                                                bgcolor: '#f6f7f8',
                                                '&:hover': { bgcolor: '#e5e7eb' }
                                            }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 5v14M5 12h14" stroke="#13a4ec" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                        </IconButton>
                                    </Box>
                                </Box>
                                
                                {/* Progress Bar */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Box sx={{
                                        flex: 1,
                                        height: '6px',
                                        bgcolor: '#e5e7eb',
                                        borderRadius: '3px',
                                        overflow: 'hidden'
                                    }}>
                                        <Box sx={{
                                            width: `${completionPercentage}%`,
                                            height: '100%',
                                            bgcolor: '#13a4ec',
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </Box>
                                    <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#13a4ec', minWidth: '45px' }}>
                                        {completionPercentage}%
                                    </Typography>
                                </Box>
                            </Box>

                            {/* Milestones List */}
                            {expandedMonths[category.id] && (
                                <Box sx={{ p: 2 }}>
                                    {category.milestones.map((milestone, index) => (
                                    <Box
                                        key={milestone.id}
                                        sx={{
                                            display: 'flex',
                                            gap: 1.5,
                                            py: 1.5,
                                            borderBottom: index < category.milestones.length - 1 ? '1px solid #f3f4f6' : 'none',
                                            '&:hover': {
                                                bgcolor: '#f9fafb'
                                            }
                                        }}
                                    >
                                        <Checkbox
                                            checked={milestone.completed}
                                            onChange={() => handleToggleMilestone(category.id, milestone.id)}
                                            sx={{
                                                p: 0,
                                                mt: 0.5,
                                                color: '#d1d5db',
                                                '&.Mui-checked': {
                                                    color: '#13a4ec'
                                                },
                                                '& .MuiSvgIcon-root': {
                                                    fontSize: 24
                                                }
                                            }}
                                        />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography
                                                sx={{
                                                    fontSize: '14px',
                                                    fontWeight: 600,
                                                    color: milestone.completed ? '#9ca3af' : '#101c22',
                                                    textDecoration: milestone.completed ? 'line-through' : 'none',
                                                    mb: 0.5
                                                }}
                                            >
                                                {milestone.title}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    fontSize: '13px',
                                                    color: milestone.completed ? '#9ca3af' : '#6b7f8a',
                                                    lineHeight: 1.5
                                                }}
                                            >
                                                {milestone.description}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {/* Note */}
            <Box sx={{
                mx: 2,
                mt: 2,
                p: 2,
                bgcolor: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: '12px'
            }}>
                <Typography sx={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.6 }}>
                    <strong>Lưu ý:</strong> Mỗi bé phát triển theo nhịp độ riêng. Những mốc này chỉ mang tính tham khảo. 
                    Nếu bé chậm hơn một vài mốc, đừng lo lắng quá mức. Tuy nhiên, nếu bé chậm nhiều mốc hoặc bạn có bất kỳ 
                    lo ngại nào, hãy tham khảo ý kiến bác sĩ nhi khoa.
                </Typography>
            </Box>

            {/* Add Item Dialog */}
            <Dialog 
                open={openAddDialog} 
                onClose={() => {
                    setOpenAddDialog(false);
                    setNewItemTitle('');
                    setNewItemDescription('');
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ 
                    fontSize: '18px', 
                    fontWeight: 700, 
                    color: '#101c22',
                    borderBottom: '1px solid #e5e7eb'
                }}>
                    Thêm mốc phát triển mới
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Tiêu đề"
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        sx={{ mb: 2 }}
                        placeholder="Ví dụ: Biết nói câu 5-6 từ"
                    />
                    <TextField
                        fullWidth
                        label="Mô tả"
                        value={newItemDescription}
                        onChange={(e) => setNewItemDescription(e.target.value)}
                        multiline
                        rows={3}
                        placeholder="Mô tả chi tiết về mốc phát triển này..."
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid #e5e7eb' }}>
                    <Button
                        onClick={() => {
                            setOpenAddDialog(false);
                            setNewItemTitle('');
                            setNewItemDescription('');
                        }}
                        sx={{ 
                            color: '#6b7f8a',
                            textTransform: 'none',
                            fontWeight: 600
                        }}
                    >
                        Hủy
                    </Button>
                    <Button
                        onClick={handleAddItem}
                        variant="contained"
                        disabled={!newItemTitle.trim()}
                        sx={{ 
                            bgcolor: '#13a4ec',
                            textTransform: 'none',
                            fontWeight: 600,
                            '&:hover': { bgcolor: '#0e8fd9' },
                            '&:disabled': { bgcolor: '#e5e7eb', color: '#9ca3af' }
                        }}
                    >
                        Thêm
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default MilestonesPage;
