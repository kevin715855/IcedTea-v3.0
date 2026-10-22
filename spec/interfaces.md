# Giao diện giữa các phần (hàm, API, schema)

## Cơ sở dữ liệu (PostgreSQL, Prisma, khoá chính UUID)

**users**: `id` (UUID PK), `username` (unique), `password_hash`, `role` (`admin`|`staff`), `is_active`, `valid_from` (timestamptz, nullable), `valid_until` (timestamptz, nullable; Admin để trống), `created_by` (UUID, nullable), `created_at` (timestamptz).

**sessions**: `id` (UUID PK), `name`, `starts_at` (timestamptz), `ends_at` (timestamptz), `closed_at` (timestamptz, nullable), `created_by` (UUID, nullable), `created_at` (timestamptz).
- Buổi "đang mở" khi `now` nằm trong `[starts_at, ends_at]` và `closed_at` trống. Không lưu trạng thái, không cần tác vụ nền.

**checkins**: `id` (UUID PK), `session_id` (UUID), `student_code` (varchar, MSSV), `scanned_by` (UUID), `checked_in_at` (timestamptz, default now()), `cancelled_at` (timestamptz, nullable), `cancelled_by` (UUID, nullable), `cancel_reason` (varchar, nullable).
- Ràng buộc chống trùng: chỉ mục duy nhất phần `(session_id, student_code) WHERE cancelled_at IS NULL` (xem spec/decisions.md). Huỷ là huỷ mềm, cho phép quét lại sau khi huỷ.

**audit_logs** (chỉ thêm): `id` (UUID PK), `actor_id` (UUID, nullable), `action`, `target_id` (UUID, nullable), `ip` (varchar, nullable), `request_id` (varchar, nullable), `metadata` (JSON, đã lọc), `created_at` (timestamptz).
- Ghi: đăng nhập, check-in, quét trùng, quét bị từ chối (chỉ mã lý do), huỷ check-in (kèm lý do), tạo hoặc khoá tài khoản, sửa buổi. Không ghi mật khẩu, token, URL hay nội dung QR.

## API (`/api/v1`)

| Route | Method | Quyền | Mô tả |
|---|---|---|---|
| `/auth/login` | POST | Công khai, giới hạn tốc độ | Đăng nhập, đặt cookie phiên |
| `/auth/logout` | POST | Đã đăng nhập | Xoá phiên |
| `/sessions` | GET | Đã đăng nhập | Staff thấy buổi đang mở; Admin thấy mọi buổi |
| `/sessions` | POST | Admin | Tạo buổi |
| `/sessions/:id` | PATCH | Admin | Sửa/đóng buổi (`closed_at`) |
| `/checkins` | POST | Staff còn hiệu lực, Admin | Tạo check-in từ MSSV + ID buổi |
| `/checkins` | GET | Theo quyền | Staff xem của mình; Admin xem tất cả; lọc `session_id`, `student_code`; phân trang `page`, `page_size` |
| `/checkins/:id` | DELETE | Admin | Huỷ mềm, bắt buộc `cancel_reason` |
| `/sessions/:id/report` | GET | Admin | Tổng hợp + số liệu theo nhân viên; `?format=csv` xuất CSV |
| `/users` | GET/POST | Admin | Danh sách / tạo Staff |
| `/users/:id` | PATCH | Admin | Gia hạn / khoá tài khoản |
| `/audit-logs` | GET | Admin | Xem nhật ký, phân trang |
| `/health` | GET | Công khai | Kiểm tra app và database |

## Tầng dịch vụ (`src/server/services`)

- `sessions.ts`: `listSessions(account, now)`, `createSession(input, actor)`, `updateSession(id, input, actor)`, `getSessionReport(sessionId, actor)`.
- `checkins.ts`: `createCheckin(sessionId, studentCode, scanner, now)`, `listCheckins(account, filter)`, `cancelCheckin(id, reason, actor)`.
- `audit.ts`: `writeAuditLog(input)`, `listAuditLogs(actor, filter)`.
- `users.ts`: `listUsers(actor)`, `createStaff(actor, input)` (trả mật khẩu một lần), `updateUser(id, actor, input, ip, requestId)`.
- `access.ts`: `requireUser(account, now)`, `requireAdmin(result)`, `isAccountActive(account, now)`.
- `validation.ts`: `validateMssv(code)`, `parseQrCard(raw)`, `parseBarcode(raw)`.

## Quy tắc MSSV (backend kiểm tra lại)

- Toàn chữ số.
- Bốn số đầu là năm nhập học.
- Năm ≤ 2023 → 8 chữ số; năm ≥ 2024 → 9 chữ số.
- Sai định dạng → từ chối (422 "Mã không hợp lệ").

## Trang frontend (Next.js App Router, client components)

| Đường dẫn | Vai trò | Người dùng |
|---|---|---|
| `/` | Trang chủ, chuyển hướng `/scan` hoặc `/login` | Cả hai |
| `/scan` | Trang quét camera (ZXing), chọn buổi đang mở | Cả hai |
| `/checkins` | Lịch sử check-in, lọc buồi/MSSV, phân trang, huỷ (Admin) | Cả hai |
| `/admin/sessions` | Tạo, sửa, đóng buổi | Admin |
| `/admin/users` | Tạo, gia hạn, khoá tài khoản Staff | Admin |
| `/login` | Đăng nhập | Công khai |

Không có ô nhập tay MSSV ở bất kỳ trang nào.
