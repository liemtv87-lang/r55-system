# KQ247 SEO hiệu quả thực tế — baseline 2026-11-08 (Asia/Ho_Chi_Minh)

## Phạm vi được xác minh
- Website chính: https://64-120-92-172.sslip.io/
- Telegram landing: https://64-120-92-172.sslip.io/cong-dong-telegram-kq247.html
- Telegram targets: https://t.me/keochuyengia79, https://t.me/xsbm999, https://t.me/tooldudoan999.
- Search Console: dữ liệu đọc qua Windsor.ai searchconsole account `https://64-120-92-172.sslip.io/` ngày 08/11/2026. Không dùng lượng source đã quét làm backlink.

## Số liệu GSC
- 16/10–05/11/2026: **4 impressions, 0 clicks** (tổng ngày). Dữ liệu mỏng; không suy ra tăng trưởng.
- Trang được ghi nhận trong page dimension:
  - `/`: 2 impressions, 0 clicks.
  - `/kenh-tool-du-doan-kq247.html`: 2 impressions, 0 clicks.
- Query+page dimension trả về 0 rows; không được suy diễn rằng không ai tìm kiếm.
- `/sitemap.xml`: **63 submitted URLs**, **0 errors, 0 warnings**; thời điểm last_downloaded mới nhất được trả về: **2026-11-08T12:39:33.043Z**. Submitted không có nghĩa indexed.
- GSC Wizard subscription_required; kết quả trên dùng kết nối Windsor.ai, không phải GSC Wizard.

## Chứng cứ liên kết ngoài
- PromoteIndex public listing `/p/kq247-football-and-lottery-community`: outbound reported 0, link tới hub được ghi nofollow (chưa đủ vote). 
- PromoteIndex `/p/kq247-two-digit-frequency-calculator`: 142 listing views, 0 recorded outbound clicks tại thời điểm kiểm tra.
- Không có chứng cứ phiên này chứng minh có backlink mới được xuất bản; không tăng bộ đếm backlink nếu chỉ mới gửi đơn, gặp CAPTCHA hoặc form đang chờ duyệt.

## Sửa mã giám sát trong repository
- `seo-monitor/audit.py`: thêm kiểm tra URL trang chủ VPS, trang hub Telegram, robots.txt, sitemap.xml (từ 6 lên 10 technical targets); kiểm tra ba href Telegram xuất hiện trực tiếp trong hub.
- `seo-monitor/test_audit.py`: bài kiểm tra regression mạng giả lập cho đủ link, mất link và tracking query.
- `.github/workflows/seo-hourly-audit.yml`: gọi unit tests trước bước HTTP health audit.
- Không có sửa đổi service/container hay cơ sở dữ liệu VPS; nguồn GitHub không tự chứng minh deployed lên VPS.
- Chưa có kết quả xác nhận workflow Actions chạy qua sau commit.

## Ưu tiên hiệu quả
1. Khắc phục rào cản crawl/index thực tế của trang nội dung có giá trị; kiểm tra canonical, robots, nội dung có tính độc đáo và liên kết nội bộ theo từng trang.
2. Nâng nội dung bài hướng dẫn bóng đá và thống kê xổ số thật sự hữu ích thay vì chỉ sinh thêm hàng loạt landing page mỏng.
3. Chuyển Telegram CTA thành lời mời rõ ràng; đo số lần click thực tế bằng first-party event/analytics có consent, tránh click ảo.
4. Backlink từ nguồn phù hợp có quyền đăng, liên kết công khai kiểm chứng độc lập; loại nguồn trùng và nguồn cấm quảng bá.
5. Mỗi đợt so sánh 28 ngày impressions, clicks, CTR, unique referring domains, outbound Telegram clicks; phân biệt submitted, published, indexed và actual visits.

Không dùng phần lớn nguồn phát hiện tự động làm bằng chứng backlink thành công. Không sử dụng traffic giả, mua link truyền PageRank hay bypass CAPTCHA.
