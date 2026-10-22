# Quyết định kiến trúc (ROAD-95)

Mỗi quyết định: 2 phương án, phương án đã chọn, lý do, điều kiện sẽ khiến đổi ý.

## 1. Chống trùng check-in cùng MSSV trong một buổi

**Phương án A:** Chỉ xử lý ở ứng dụng — bắt mã lỗi Prisma `P2002` khi vi phạm unique index và trả 409 "đã điểm danh".
**Phương án B:** Phải được Code bằng cơ sở dữ liệu — chỉ mục duy nhất phần `CREATE UNIQUE INDEX ON checkins(session_id, student_code) WHERE cancelled_at IS NULL` — GẦN METHODS xử lý P2002 ở ứng dụng làm lớp thứ hai.

**Đã chọn:** B (cả hai lớp cùng chạy).
**Lý do:** Chỉ ứng dụng không đủ khi có nhiều Staff quét cùng lúc (race condition): hai request có thể cùng đọc "chưa tồn tại" rồi cùng ghi → trùng dữ liệu. Chỉ mục ở cấp CSDL đảm bảo tính đúng đắn tuyệt đối; xử lý P2002 ở ứng dụng đưa về thông báo 409 thân thiện thay vì lỗi 500 thô.
**Điều kiện đổi ý:** Nếu Prisma chưa hỗ trợ triển khai chỉ mục phần qua migration được hỗ trợ, hoặc Neon không cho tạo chỉ mục có điều kiện — thì giữ chỉ ứng dụng và ghi nhận rủi ro trong báo cáo test.

## 2. Vị trí kiểm tra quy tắc MSSV

**Phương án A:** Chỉ kiểm tra ở frontend (trang quét).
**Phương án B:** Backend kiểm tra lại mọi MSSV gửi đến `POST /checkins` (defense in depth).

**Đã chọn:** B.
**Lý do:** API nhận MSSV trực tiếp nên người có tài khoản vẫn có thể gửi MSSV bypass giao diện (đã ghi trong CLAUDE.md §3 "Hạn chế đã知"). Backend phải là nơi xác định cuối cùng.
**Điều kiện đổi ý:** Không có — quy tắc này là yêu cầu cốt lõi §11/§5.

## 3. Cơ chế phiên đăng nhập

**Phương án A:** Một JWT trong cookie `HttpOnly`, `Secure`, `SameSite=Strict`, không có refresh token.
**Phương án B:** JWT access token ngắn hạn + refresh token luân chuyển.

**Đã chọn:** A.
**Lý do:** Đơn giản, phù hợp nhóm nhỏ, mỗi request tra DB kiểm tra `is_active`/`valid_until` nên khoá tài khoản có hiệu lực ngay. Không cần refresh token theo thiết kế hiện tại.
**Điều kiện đổi ý:** Cần phiên kéo dài dài hạn hoặc luân chuyển token bảo mật cao hơn.

## 4. Định dạng ZXing bật trên trang quét

**Phương án A:** Chỉ bật `QR_CODE`.
**Phương án B:** Bật đầy đủ định dạng ZXing hỗ trợ, sau đó giảm dần dựa trên kết quả kiểm thử trên thiết bị thực (QR Code + các mã 1D phổ biến như Code 128, EAN, ITF...).

**Đã chọn:** B.
**Lý do:** Barcode trên thẻ sinh viên thực chưa biết định dạng chính xác (CLAUDE.md §3: "Cần thử với thẻ thật để biết định dạng barcode nào cần bật"). Bật đầy đủ tránh lỡ định dạng, rồi thu gọn sau khi xác minh.
**Điều kiện đổi ý:** Kiểm thử thiết bị thực xác định rõ định dạng cần thiết → thu gọn danh sách để tránh quét nhầm.

## 5. Cách xuất báo cáo CSV

**Phương án A:** Tạo CSV ở client (frontend) sau khi gọi API báo cáo JSON.
**Phương án B:** Route handler server `GET /sessions/:id/report?format=csv` trả trực tiếp file CSV, kiểm tra quyền Admin ở server.

**Đã chọn:** B.
**Lý do:** Logic báo cáo đã ở server (`getSessionReport`), kiểm tra quyền Admin tập trung ở server, tránh gửi toàn bộ dữ liệu sang client chỉ để format CSV.
**Điều kiện đổi ý:** Không có — phù hợp với kiến trúc hiện tại.

## 6. Thuật toán băm mật khẩu

**Phương án A:** bcrypt (đang dùng qua `bcryptjs`).
**Phương án B:** Argon2id.

**Đã chọn:** A.
**Lý do:** Đã triển khai và hoạt động; CLAUDE.md §8 cho phép một trong hai.
**Điều kiện đổi ý:** Yêu cầu tuân thủ bảo mật bắt buộc Argon2id.

---

## Top 3 rủi ro và cách giảm thiểu

| # | Rủi ro | Cách giảm thiểu |
|---|--------|-----------------|
| 1 | Race condition: hai lượt quét cùng MSSV trong cùng một buổi được ghi hai lần vì chưa có chỉ mục DB | Triển khai chỉ mục duy nhất phần ở cấp CSDL (Quyết định 1) + giữ bắt P2002 ở ứng dụng; test gửi đồng thời hai request trùng và xác nhận chỉ có 1 bản ghi. |
| 2 | ZXing trên thiết bị di động thực không đọc được barcode thẻ sinh viên (định dạng chưa知, quyền camera, HTTPS) | Kiểm thử trên thiết bị thực trước khi giao (sub-issue 카메ラ kiểm thử), bật đầy đủ định dạng ZXing rồi thu gọn, ghi lại định dạng đã xác nhận vào spec/decisions.md. |
| 3 | Test tự động cần `DATABASE_URL` thật (Neon) nên không chạy được cục bộ mà không có CSDL | Dokument hướng dẫn thiết lập DATABASE_URL cho môi trường test; CI/CD cung cấp DATABASE_URL test; local chạy được khi có biến môi trường. |

---

## Giả định chưa xác nhận

1. Test tự động cho parser MSSV, quyền truy cập, tài khoản hết hạn, check-in trùng và ngoài giờ đã được viết (xem `tests/`) nhưng **chưa thể chạy cục bộ** vì chưa có `DATABASE_URL` thật — chưa xác nhận tất cả pass.
2. Prisma migration có thể tạo chỉ mục có điều kiện (`WHERE cancelled_at IS NULL`) trên Neon — chưa xác nhận bằng migration thật.
3. Định dạng barcode trên thẻ sinh viên thực chưa xác định — chờ kiểm thử thiết bị thực (Quyết định 4).
