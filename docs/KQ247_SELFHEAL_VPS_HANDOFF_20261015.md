# KQ247 — bàn giao tự phục hồi VPS (15/10/2026, GMT+7)

## Yêu cầu người dùng
- Chỉ một VPS VinaHost 64.120.92.172 để chạy các hệ thống KQ247, không chuyển nơi xử lý sang dịch vụ ngoài VPS.
- Áp dụng cho mọi công cụ/bản chính/bản khách/bot/tác vụ nền: bóng đá, xổ số, Vietlott, bán hàng, SEO Web, SEO Telegram, nghiên cứu và vận hành.
- Tự phát hiện lỗi, thử phục hồi có giới hạn, kiểm tra sau phục hồi; cách ly từng dịch vụ để không chồng chéo.
- Không dừng/restart container đang chạy; không ghi đè snapshot chưa được xác minh; không phát tin bot lặp hay tự bật lại timer bị tắt.
- Giữ nguyên public link, giao diện, mã khách và tính liên tục của snapshot.
- Bảo toàn lịch sử tiến độ/commit/log để tiếp nối sau khi chat chuyển. Tài liệu này là tóm tắt, **không phải bản sao nguyên văn toàn bộ tin nhắn**.

## Đã xác minh
- Repo chính: `liemtv87-lang/r55-system`, mã `ops/selfheal/kq247_selfheal.py`.
- 9 scope độc lập: `football xs vietlott bots sales seo-web seo-telegram research ops`, timer `kq247-selfheal-<scope>.timer` thiết lập `OnUnitInactiveSec=10min` với jitter.
- GitHub Actions cài `38753515497` thành công, cập nhật `38754384684` thành công, kiểm thử `38754385127` thành công (6/6).
- Audit run `38754916443` thành công, lúc 14:50 UTC (21:50 Việt Nam): 9/9 timer `active` và `enabled`, có bản ghi trạng thái per-scope trong `/opt/kq247/ops/selfheal/state`.
- Các container production đang chạy không bị thay đổi ID trong bước cài/kiểm tra.
- Cơ chế: allowlist container được phép khởi động khi đã dừng; cảnh báo Docker unhealthy, timer/service có khóa theo scope, giới hạn số lần retry, postcheck sau kích hoạt, chặn retry oneshot có thể gây bot double-send hoặc SEO spam, không sửa dữ liệu snapshot.
- Audit ghi nhận container ngoài allowlist ở football, Vietlott, sales; một số timer SEO Web/Telegram đang disabled: chỉ ghi nhận, không tự bật lại.
- Live Vietlott tại `https://vietlott.64-120-92-172.sslip.io`: audit `38752296092` lúc 21:32 VN trả `/health 200` nhưng `status=failed`, runtime `R40_VPS_USER33_FULL30_60_150_20261013`, `/api/state=503` vì snapshot R33 chưa sẵn sàng; `/guest-snapshot.html=404`, `/client.html=200`. Audit VPS `38754916443` cũng xác nhận `/api/state=503`.
- Bộ tự phục hồi cấm kích hoạt retry lỗi trên R33/R40, yêu cầu runtime bắt đầu `R41_VPS_USER35` và snapshot Mega/Power đúng ngày/khóa và ruleset `USER_35_HARD_RULES_ADJACENT_HEAD_PAIRS_2026_10_15_R1`.

## Trạng thái CHƯA xong
1. **Chưa đồng bộ Vietlott R35 lên VPS live**: mã nằm repo `liemtv87-lang/vietlott-auto-hoc`, chưa có chứng cứ VPS R41 đang chạy. Dữ liệu cùng ngày `/api/state` 503 phải sửa tận gốc bằng nguồn hai nhà xuất bản XSMB full 27 giải rồi kiểm tra snapshot.
2. **Chưa thể cam kết mọi dịch vụ không bao giờ lỗi**: 9 watchdog đang chạy nhưng chỉ có retry generic và giám sát Vietlott chuyên biệt; chưa đủ semantic checks cho mọi bot, bản khách, BD/XS và SEO.
3. **Chưa gỡ được mọi dịch vụ ngoài VPS**; ít nhất 6 Render Vietlott/Zeabur dịch vụ cũ còn trong tài khoản, cần xác minh trước khi tắt/xóa để không đứt link.
4. **Không được tự bật lại timer disabled** và không tự khởi động các container ngoài allowlist khi chưa phân loại nhiệm vụ/quyền sở hữu.
5. Runtime R41 mới phải pass backtest 35 điều kiện, xuất TXT, kiểm thử cả hai bản chính/khách, bảo vệ snapshot đã khóa trước khi chuyển phục vụ.

## Thứ tự tiếp theo
- Kiểm tra lại các lỗi Vietlott full 27 giải + `/api/state`, thử bản R35 ở đường riêng, kiểm thử HTTP/lock/snapshot; chỉ đưa bản live sau gate và rollback an toàn, không restart container đang chạy.
- Hoàn thiện giám sát nội dung cho từng dịch vụ: bản chính/khách, thời gian snapshot, độ mới dữ liệu, bot một bản tin/đài/trận, SEO số backlink đã duyệt, nghiên cứu đầu vào và quota CPU/disk.
- Xác minh các timer selfheal tiếp tục chạy sau reboot, giám sát lưu nhật ký, và kiểm tra phục hồi thực tế bằng test lỗi an toàn, không phá hoại sản xuất.
- Cập nhật tài liệu này sau mỗi lượt có commit/run/trạng thái xác minh.

## Vietlott R35 — triển khai bị chặn bởi quyền repo private (15/10 lúc 22:40 VN)
- Đã soát VPS bằng workflow `38760764316` và `38761033760`: dịch vụ `kq247-vietlott-vps` vẫn R40/USER33 `status=failed`; source hiện có trên VPS không chứa luật R35/điều kiện giờ 20h; không có `/opt/kq247/vietlott/current/.git`, và VPS chưa đọc được repo `liemtv87-lang/vietlott-auto-hoc`.
- Bootstrap khóa ED25519 **chỉ đọc** trên VPS thành công, workflow `38761511656`. Public key (không phải private key): `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMe7If2a28PXyesp0YH6UIgNCBdVJGAhEpzzFMjp6OW8 kq247-vietlott-readonly-vps-20261015`.
- Cần chủ repo private thêm khóa tại `https://github.com/liemtv87-lang/vietlott-auto-hoc/settings/keys`, KHÔNG bật quyền write. Không thể thực hiện thao tác quản trị này qua các GitHub connector hiện có.
- Workflow `kq247-vietlott-r35-private-stage.yml` đã tạo, hai run `38762033188`, `38762305880` dừng an toàn ở bước `WAITING_FOR_READONLY_DEPLOY_KEY` (exit 3), **không thay runtime/snapshot/container live**. Khi khóa được cấp quyền, rerun workflow để lấy commit private pin `e9bca84c3d2ac67b528eb4ae02e2fddee84d3500`, chạy kiểm thử offline, mở stage readonly cổng `127.0.0.1:18141` và audit.
- Repo private đã chốt mốc snapshot sau 20h VN, gồm R35 và giới hạn 180.000/450.000; **chưa có chứng cứ code đã lên VPS**. Private CI run `38760456429` fail trước khi có steps, cần kiểm thử trên VPS sau khi quyền clone được cấp. Không báo đồng bộ toàn bộ hoặc chuyển link khách cho đến khi R35 pass release gate với hai snapshot.
