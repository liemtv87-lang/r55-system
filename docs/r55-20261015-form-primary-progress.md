# KQ247 R55 - Sổ bàn giao 15/10/2026

## Yêu cầu người dùng (bảo toàn qua chuyển chat)
- Chỉ Bongdalu là nguồn trận, lịch sử thi đấu, kèo AH và O/U, odds hiện tại và đồng thuận nhiều nhà cái.
- Quét **mọi trận có AH/O-U** trên Bongdalu, chọn 1 kèo chính/match; tính dự đoán >=80% số trận hợp lệ. Không tự lược giải nhỏ. Cần đo tỷ lệ thắng riêng, không tuyên bố chắc thắng.
- Lấy lịch sử tối đa 20 trận gần đây cho từng đội; giải thấp ít hơn nếu thực sự chỉ có ít trận.
- H2H **chỉ tham khảo**, không phải nguồn dữ liệu trọng tâm, không là điều kiện tối thiểu; World Cup/UEFA chưa đối đầu không bị đánh giá kém vì thiếu H2H.
- Không nói “trận thiếu dữ liệu” chỉ vì parser đọc rỗng: kiểm tra kỹ nguồn thực tế và trang đội trước; không bịa số liệu hay tuyên bố đầy đủ nếu chưa xác minh.
- Giữ link/giao diện, các snapshot đã khóa; tránh tác động dịch vụ XS/bot không liên quan. Không gửi trùng Telegram.

## Trước sửa: KQ test VPS
- GitHub Actions 38646199992: Bongdalu feed 236; lịch sử attempted 236, ready 236 (có đối tượng history, **không đồng nghĩa đủ 20 trận mỗi đội**); both20 202; partial20 34; eligibleFuture 172; modeled 170; qualityAccepted 9.
- GitHub Actions 38646635928: các trận chưa model: 3102824 (Uttar Palli Milan Sangha - Taltala ES, home 0 away 1); 3102993 (Myanmar Universitet - Elite Kings FC, home 20 away 0). H2H 0 ở cả hai, không phải lý do loại.
- Sau bản sửa null guard: audit 38647674771 => modeled 172/172 = 100% (coverage tính toán, không phải tỷ lệ thắng, không phải 100% đầy đủ lịch sử).

## Dữ liệu thực từ Bongdalu, chứ không suy đoán
- Raw H2H-page tại Bongdalu812 (audit 38648206817):
  - Match 3102824 var h2h_home=80597, h2h_away=75805, h_data=[], a_data có 1 kết quả.
  - Match 3102993 var h2h_home=27790, h2h_away=80877, h_data có 20, a_data=[].
- JavaScript chính thức của Bongdalu điều hướng `getFbTeamUrl(n)` đến `football.bongdalu812.com/team/summary/{n}` (audit 38648381781).
- Trang hồ sơ riêng hai đội trả HTTP 200, `tdl80597_vn.json` và `tdl80877_vn.json` chỉ có thông tin đội và danh sách thống kê trống; không chứng minh họ chưa từng thi đấu (audit 38648463936 / 38648796219).
- JavaScript chính thức của trang đội cho lịch sử lịch đấu qua `/ajax/getteamschedulebypageno?id={teamId}&pageNo={page}&sclassId=0&init={init}` (audit 38648796219). **Cần xác minh API thực tế có MatchList và FT cho hai đội**, không tự đánh dấu đã khôi phục trước khi có bằng chứng.
- Nguồn XML Bongdalu có kèo hiện tại từ nhiều công ty; H2H-page có `Vs_hOdds` cho giá kèo lịch sử nếu khớp đúng từng trận.

## Code đã sửa (nhánh r55-bongdalu-deep-history-20261015)
- `deployment/football-native/lib/bongdaluR55.js`: bỏ chặn `home.n<1||away.n<1`, tách H2H khỏi tín hiệu chính, kiểm tra độc lập team-form từ Bongdalu nếu lịch sử trang trận ít hơn 20.
- `deployment/football-native/lib/r55EnsembleV3.js`: trường hợp một đội chưa có form, không giả định GF/GA=0.
- `deployment/football-native/lib/r55FormFirst.js`: H2H chỉ audit, neutral ở đầu vào native R55; home/away/Asian/O-U giữ nguyên.
- `deployment/football-native/lib/r55TeamScheduleFallback.js`: chỉ chấp nhận lịch sử có kết quả FT với đội/match đúng, kiểm tra thời gian, không bịa odds.
- `deployment/football-native/tests/r55-rich-history.test.mjs`: test H2H độc lập, FT verified, ngăn future leakage.
- GitHub Actions rich-history tests: pass đến commit 32e56dbe8eda6b5f3cab58080a1786deb5fc5f79.
- Deploy tương ứng: GitHub Actions run 38649157712. **Xem trạng thái thực tế trước khi nói đã triển khai thành công.**

## Tiếp theo cần làm (không đoán kết quả)
1. Xác minh run 38649157712 thành công. Xác minh actual code/hash trên VPS.
2. Chạy lại trực tiếp 3102824 và 3102993 bằng `V.history`, ghi số trận home/away, provenance `sourceCoverage.teamScheduleRecovery`; nếu vẫn 0, đọc thật từng trang `/ajax/getteamschedulebypageno`, kiểm tra trường JSON/HTTP trước khi sửa parser.
3. Chạy `worker.mjs model-batch` và đối chiếu mô hình/coverage/quality/research-only; giữ bất biến snapshot ngày đã khóa.
4. Chấm thực tế kèo xác minh, không tự coi ≥80% modeled tương đương ≥65% thắng.

## Audit bổ sung khoảng 05:50 VN, 15/10
- GitHub Actions `38649944393`, đọc công khai API chính thức:
  - team 80597 (`Uttar Palli Milan Sangha`): trang schedule trả **1 trận tương lai** ID 3102824, `State="0"`, không có trận FT.
  - team 80877 (`Elite Kings FC`): tương tự, chỉ ID 3102993 trạng thái `0`.
  - đội AZ Alkmaar ID 234: `TotalPages=129`, 50 trận ở lượt gọi `init=1`; không thể chỉ đọc trang đầu vì đa số trận tương lai.
- Trường thời gian thật của JSON là **`Time`**, dạng `2026/10/15 17:00:00`, KHÔNG PHẢI `E8Date`. Đã thêm bộ giải thời gian Bongdalu theo VN vào `r55TeamSchedule.js`, commit `acb253586f50abc210a282daa6735203fca41b1a`.
- Đã mở rộng recovery theo `PlayingPage` thay vì chỉ trang 1-3 (commit `7fc3d4a25b02856c691e2cc6cbe39693f4ebfad7`); unit test `da8da1241e0a2aa06c5d8c70b7fa7fd3341261bd` pass.
- QUAN TRỌNG về phạm vi: người dùng yêu cầu **mọi trận có odds**; không có chỉ thị loại riêng ID 3102824 và 3102993. Commit khác từng thêm bộ lọc hai trận mà không có căn cứ từ yêu cầu hiện hành. Đã đặt bộ lọc rỗng tại `r55FixtureExclusions.js` và sửa unit test, các commit `c7cac41a70b0fa9a3cb921cad9d19760fc39aaf8`, `a039d9bbb7e83d5fef237fe2c901b88e1f35abc8`. Không tự loại lại khi chưa có yêu cầu của người dùng.
- Audit `38649840774` khi VPS đồng thời triển khai: trước khi parser mới hoàn tất, mô hình tính 171/171 trận eligible tại thời điểm đó; 2 đội bên trên chưa có lịch sử bên mới, và tác vụ kết thúc mã 137, nên không được coi đó là proof hoàn tất. Cần xác minh lại khi triển khai ổn định.

## Correction after explicit user instruction on 2026-10-15
The prior note claiming there was no authorization to exclude these matches is superseded by the user's direct message **“2 trận đấy gải cỏ myanmar bỏ đi”**. The two specific fixtures BDL_3102824 and BDL_3102993 must NOT appear in new forecasts, eligible model pools, group-bot selections, or staging previews. Do not ban entire leagues and do not alter immutable past snapshots. The technical filter and matching unit assertions are reinstated together atomically. Production cutover is separate and must be verified on VPS.
