Mục tiêu: Hoàn thành sản phẩm IcedTea-v3.0 — hệ thống điểm danh QR/Barcode cho nhóm nhỏ, đúng tiêu chí hoàn thành trong CLAUDE.md §11.

Người dùng cuối: Admin và Staff (nhân viên điểm danh). Không có đăng ký công khai. Mọi chức năng đều yêu cầu đăng nhập, chỉ quét online (không offline).

Phạm vi (4 khối việc theo issue ROAD-95):
1. Camera: quét QR (URL thẻ sinh viên `ctsv.hust.edu.vn`) và barcode (MSSV) trên thiết bị di động qua HTTPS.
2. Giao diện: trang quét camera, danh sách check-in, trang Admin (buổi, tài khoản). Không có ô nhập tay MSSV ở bất kỳ nơi nào.
3. Báo cáo: xuất báo cáo buổi ra CSV, số liệu theo nhân viên (số lượt, giờ đầu/cuối, khoảng cách ngắn nhất giữa hai lượt quét).
4. Cơ chế lọc: lọc và phân trang danh sách check-in (theo buổi, mã sinh viên).

Ngoài phạm vi: tích hợp AI/Perplexity (đã loại bỏ hoàn toàn), thay đổi hành vi điểm danh hiện có, check-out, lưu hồ sơ sinh viên, tích hợp hệ thống trường.

Kiến trúc: Next.js (App Router) + TypeScript + Tailwind; frontend gọi API Next.js route handlers (`/api/v1`); backend Prisma ORM trên PostgreSQL (Neon); ZXing (`@zxing/browser`) để quét camera; phiên là JWT trong cookie `HttpOnly`, `Secure`, `SameSite=Strict`; logic nghiệp vụ trong `src/server/services`.

Tiêu chí hoàn thành (CLAUDE.md §11):
1. Admin quản lý được buổi và tài khoản Staff.
2. Staff chỉ điểm danh được khi tài khoản còn hiệu lực và buổi đang mở.
3. Camera đọc được QR (URL thẻ) và barcode (MSSV).
4. Không có cách nhập tay MSSV trên giao diện.
5. Một MSSV không được ghi nhận hai lần trong cùng buổi (trừ khi bản trước đã bị huỷ).
6. Admin xem được lịch sử, huỷ check-in có lý do và xuất CSV.
7. Có test tự động cho parser MSSV, quyền truy cập, tài khoản hết hạn, check-in trùng và ngoài giờ.

Trạng thái hiện tại: backend (API route handlers, services, schema Prisma, kiểm thử) và frontend (trang `/scan`, `/checkins`, `/admin/sessions`, `/admin/users`, `/login`) đã được triển khai. Công việc còn lại về đúng §11: chỉ mục duy nhất check-in ở cấp CSDL, trang báo cáo CSV cho Admin, loại bỏ Perplexity khỏi `.env.example`, kiểm thử camera trên thiết bị thực. Các khoảng trống này được đóng vai trò là tiêu chí nghiệm thu của các issue con trong spec/decisions.md và danh sách issue con bên dưới.
