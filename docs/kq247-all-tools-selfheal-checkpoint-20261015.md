# KQ247 — Toàn bộ tool/tác vụ tự phục hồi — checkpoint 15/10/2026

## Yêu cầu bắt buộc
- Tất cả các tool: XSMB/XSMT/XSMN, bóng đá R55, Vietlott Mega 6/45–Power 6/55, bản chính/bản khách, bot bóng đá, bot xổ số, bot bán hàng, SEO Google Web, SEO Telegram, nghiên cứu/nguồn dữ liệu, lịch chạy và báo cáo.
- Phải có tự phát hiện lỗi, kiểm tra nguồn, thử lại có giới hạn, cách ly lỗi theo từng nhóm và xác minh sau phục hồi.
- Không dùng tác vụ chung để ghi đè snapshot, giao diện, nguồn hoặc dữ liệu khác nhóm; giữ nguyên link/mã khách; không tự dừng/restart container đang chạy; không bỏ yêu cầu snapshot đã khóa.
- Đọc nguồn xác thực mới nhất của KQ247 trước khi công bố hoàn tất.

## Đã thực hiện, có bằng chứng
- Mã khung tự phục hồi: `ops/selfheal/kq247_selfheal.py`; commit `4b7c6e6fc2db730b4f69bcc98e7bdd99a4f4e963`.
- Thiết kế 9 phạm vi: `football`, `xs`, `vietlott`, `bots`, `sales`, `seo-web`, `seo-telegram`, `research`, `ops`.
- Công cụ chỉ phục hồi timer **đang được bật**, không bật lại timer mà người vận hành đã tắt; chỉ `docker start` container *đã dừng*, không stop/restart một container đang chạy. Retry mỗi mục giới hạn 3 lần/2 giờ và có cooldown 30 phút, riêng Vietlott cho thử lại tối đa 3 lần/2 giờ, vào 19h–23h VN khi thiếu dữ liệu đã khóa. Không tự xuất snapshot chưa có nguồn đầy đủ.
- Workflow kiểm tra nguồn `.github/workflows/kq247-selfheal-syntax-safety-20261015.yml` đã chạy **SUCCESS**: GitHub Actions run `38738020492`.
- Bước tạo workflow root/SSH để cài dịch vụ trên VPS **đã bị công cụ từ chối bởi bộ kiểm tra an toàn**. Do đó không được báo các timer auto-heal đã cài, không được báo dịch vụ tự phục hồi hiện đang hoạt động.

## Đã kiểm tra VPS thực tế
- VPS: `64.120.92.172`, VinaHost. Audit read-only success: workflow `kq247-vietlott-isolation-inventory-20261015.yml` run `38736438890`.
- Vietlott production container `kq247-vietlott-vps`, HTTP port `18088`: nguồn HTML/snapshot thực tế `/opt/kq247/vietlott-r33-primary/public`; **không phải** `/opt/kq247/vietlott/public` cũ.
- Candidate `kq247-vietlott-r33-candidate` port `18112`: `/opt/kq247/vietlott-r33-stage/public`.
- Bản chính: https://vietlott.64-120-92-172.sslip.io/
- Bản khách: https://vietlott.64-120-92-172.sslip.io/client.html
- Lúc 19:42 VN ngày 15/10, `/health` 200 nhưng `/api/state` 503 cả production/candidate. `state.json` production phân tích ngày 14/10, job 15/10 thất bại vì không có XSMB đúng 15/10, không cung cấp snapshot hôm trước như hôm nay; workflow read-only `38736620622`.
- Bản khách dùng iframe vào `/?client=1` trên trang chính, chưa tách thành HTML hoàn toàn độc lập. Một số workflow sửa giao diện đã thất bại vì nhầm directory cũ, không khẳng định đã sửa.
- Có các timer riêng `kq247-research-xs`, `kq247-research-vietlott`, `kq247-research-football` và nguồn fetch/form. SEO có `kq247-google-web-discovery`, `kq247-google-web-seo`, `kq247-seo-unified` vẫn được cấu hình trên VPS; cần kiểm tra xung đột chồng chéo thực tế trước khi thay đổi.

## Bước tiếp theo
1. Được cấp đường triển khai hợp lệ cho bộ tự phục hồi, cài thành các dịch vụ/timer tách biệt; kiểm tra timer live, retry và log (không chỉ test tĩnh).
2. Chữa nguyên nhân đọc XSMB đủ 27 giải theo đúng ngày ở Vietlott; backfill nguồn xác minh; chạy native daily; kiểm tra /api/state=200 và snapshot locked.
3. Tách HTML bản khách khỏi trang chính thực sự, giữ nguyên link, mã thiết bị và thao tác tìm/TXT; kiểm tra ngay trên mobile.
4. Kiểm chứng cụ thể từng tool/bot/job sau khi autoheal hoạt động: nguồn mới, sửa lỗi, retry, rollback và tránh sửa chồng chéo.

**Không được ghi trạng thái SUCCESS production cho tới khi cả VPS self-heal timer và API liên quan xác minh live.**
