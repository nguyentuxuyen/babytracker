export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const changelogEntries: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-07-30',
    title: 'Header changelog & version badge',
    changes: [
      'Thêm badge version và nút Changelog ở header để xem bản hiện tại và các cập nhật mới.',
      'Tự động mở modal changelog khi app chạy với version mới lần đầu.',
      'Tách dữ liệu release thành danh sách dễ mở rộng cho các bản cập nhật sau.'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-07-01',
    title: 'Initial release',
    changes: [
      'Ra mắt app Baby Tracker với các màn hình theo dõi hoạt động, ngủ và thông tin bé.',
      'Hỗ trợ sync dữ liệu và các tính năng nhắc nhở cơ bản.'
    ]
  }
];
