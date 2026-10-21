
<div>
  <p align="center">
    <a href="https://www.linkedin.com/in/ninh-tr%E1%BB%8Bnh-a69648416/">
      <img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Follow me on LinkedIn" />
    </a>
    <a href="https://www.facebook.com/ninh.trinh.18400700/">
      <img src="https://img.shields.io/badge/Join%20our%20Facebook-0866FF?style=for-the-badge&logo=facebook&logoColor=white" alt="Follow me on Facebook"/>
    </a>
  </p>
</div>

# ** IcedTea v3.0 🥛**

v1.0: https://github.com/kevin715855/IceTea-v1.0

v2.0: https://gitlab.com/vuonghieu.hd/icedtea-v2
# IceTea mới: Thiết kế hệ thống điểm danh QR

Oct 18, 2026 · @Kevin Trinh

## Mục tiêu và phạm vi

Đây là web app điểm danh/check-in bằng QR, quét online, có đăng nhập, bảo mật chặt và phân quyền theo vai trò. Làm mới hoàn toàn, không dùng lại code của v1.0.

**Đã chốt:**

- Mục đích: quét QR để điểm danh/check-in.
- Là web app, mọi thao tác đều cần đăng nhập.
- Bắt buộc quét online. Không có chế độ offline hay hàng đợi đồng bộ.
- Nhân viên (staff) dùng điện thoại quét QR in trên thẻ sinh viên của sinh viên, mỗi lần quét ghi một lượt check-in vào một buổi/sự kiện.
- Tài khoản staff do admin tạo, có thời hạn hiệu lực chỉ vài giờ (đủ cho một buổi); hết hạn thì khoá, không quét được.
- Thẻ sinh viên có QR hoặc barcode. Kết quả quét chỉ ra đúng MSSV, không kèm ký tự khác: 8 chữ số cho khoá 2023 trở về trước, 9 chữ số cho khoá 2024 trở đi.
- Chỉ có hai vai trò: Admin và Staff. Admin có quyền ngừng hoạt động tài khoản staff khi thấy bất thường.
- Giai đoạn đầu tự host trên Vercel, chuyển sang server của trường sau nếu cần.

## Vai trò và phân quyền

Quyền gắn theo hành động, vai trò chỉ là tập hợp các quyền. Thêm vai trò mới sau này chỉ cần thêm một dòng cấu hình.

| Hành động | Admin | Staff |
| --- | --- | --- |
| Quét và tạo check-in | Có | Có (khi tài khoản còn hiệu lực) |
| Xem check-in của chính mình | Có | Có |
| Xem check-in của mọi buổi | Có | Không |
| Huỷ check-in | Có | Không |
| Tạo và quản lý buổi/sự kiện | Có | Không |
| Nhập và quản lý danh sách sinh viên | Có | Không |
| Tạo tài khoản staff, đặt thời hạn, khoá hoặc ngừng hoạt động | Có | Không |

Nguyên tắc: mặc định từ chối, kiểm tra quyền ở backend cho mọi route, không dựa vào việc frontend ẩn nút.

Bổ sung cho việc nhân viên quét thẻ sinh viên:

- Tài khoản staff do admin tạo và có thời hạn hiệu lực. Hết hạn là khoá, không quét được nữa, kể cả với token đang sống.
- Staff không sửa hoặc huỷ check-in, và không xem được danh sách sinh viên ngoài kết quả của lượt quét vừa thực hiện.
- Cảnh báo bất thường và nhật ký lượt quét bị từ chối chỉ Admin được xem.

## Luồng quét điểm danh online

Một lượt quét thành công đi qua 6 bước, mọi bước xác thực nằm ở server:

1. Staff đăng nhập và chọn buổi/sự kiện đang diễn ra.
2. Trình duyệt mở camera (cần HTTPS) và giải mã QR hoặc barcode trên thẻ thành MSSV. Nếu quên thẻ, nhân viên nhập tay MSSV và chọn lý do.
3. Frontend gửi `POST /api/checkins` với MSSV (quét hoặc nhập tay), nguồn nhập và id buổi. Không gửi user id hay giờ, server tự lấy từ token và đồng hồ server.
4. Server kiểm tra tài khoản còn hiệu lực, tách MSSV từ chuỗi và kiểm tra đúng định dạng, buổi còn mở
5. Server ghi check-in trong một câu lệnh có ràng buộc duy nhất `(buổi, người)`
6. Frontend hiện kết quả rõ ràng: tên người, giờ check-in, xanh nếu thành công, đỏ nếu lỗi.

**Xử lý lỗi (hiện thông báo rõ, không im lặng):**

| Tình huống | Server trả | Giao diện |
| --- | --- | --- |
| Mất mạng hoặc server lỗi | Không có phản hồi | Báo lỗi đỏ, không lưu tạm, bảo quét lại khi có mạng |
| Token hết hạn | 401 | Tự thử làm mới token một lần, nếu vẫn lỗi thì về trang đăng nhập |
| Không có quyền với buổi này | 403 | Báo không được phép |
| Mã không tồn tại | 404 | Báo mã không hợp lệ |
| Buổi chưa mở hoặc đã đóng | 422 | Báo buổi không còn nhận check-in |
| Quét quá nhanh | 429 | Báo chờ vài giây |

Vì bắt buộc online, mất mạng thì quét thất bại và báo ngay, tránh việc người dùng tưởng đã điểm danh nhưng chưa có bản ghi.

**Đọc MSSV từ thẻ.** Thẻ có QR hoặc barcode, và kết quả quét chỉ là MSSV, không kèm ký tự khác. Server vẫn kiểm tra lại mọi đầu vào, vì dữ liệu từ client không đáng tin.

- Năm nhập học là 4 chữ số đầu của MSSV. Khoá 2023 trở về trước có 8 chữ số (ví dụ 2023xxxx), khoá 2024 trở đi có 9 chữ số (ví dụ 2024xxxxx).
- Chuỗi không phải toàn chữ số, hoặc có độ dài sai so với năm đầu (2023 mà có 9 chữ số, hoặc 2024 mà có 8 chữ số), bị từ chối là sai định dạng và không tra database.
- MSSV hợp lệ được tra trong bảng `students`. Chuỗi gốc người dùng gửi lên được lưu (cắt tối đa 128 ký tự) vào `scan_attempts` để phân tích lỗi.
- Tài khoản hết hạn hoặc bị khoá: trả 403 và báo liên hệ admin, kể cả khi token còn sống.
- Barcode cần thư viện hỗ trợ cả QR và mã vạch (ZXing), quét bằng camera điện thoại. Có thể thêm máy quét USB sau nếu camera đọc barcode không ổn định.ho phép nhập tay, y là đường dễ gian lận nhất&#32;

**K****hông cho ****phép ****n****hập tay MSSV** vì đây là đường dễ gian lận nhất&#32;

Mô hình dữ liệu

PostgreSQL, 8 bảng, khóa chính dạng UUID để không đoán được theo thứ tự. Thay đổi cấu trúc chỉ qua migration.

| Bảng | Cột chính | Ghi chú |
| --- | --- | --- |
| `users` | id, username (duy nhất), password\_hash, role (admin hoặc staff), is\_active, valid\_from, valid\_until, created\_by, created\_at | Tài khoản đăng nhập. Staff chỉ dùng được trong khoảng valid\_from đến valid\_until (vài giờ, mặc định 4 giờ, tối đa 12 giờ); hết hạn hoặc is\_active = false thì khoá, kiểm tra ở mỗi request. Không xoá cứng. |
| `refresh_tokens` | id, user\_id, token\_hash, expires\_at, revoked\_at | Chỉ lưu hash của token, có thể thu hồi. |
| `sessions` | id, name, starts\_at, ends\_at, status (draft, open, closed), allow\_manual, created\_by | Buổi/sự kiện, nhận mọi sinh viên trong danh sách. Chỉ buổi `open` mới nhận check-in. |
| `checkins` | id, session\_id, student\_id, scanned\_by, source (scan hoặc manual), manual\_reason, checked\_in\_at, UNIQUE (session\_id, student\_id) | Ràng buộc duy nhất chống điểm danh trùng. Giờ do server đặt. |
| `audit_logs` | id, actor\_id, action, target\_type, target\_id, ip, created\_at | Ghi đăng nhập, check-in, sửa/huỷ, khoá hoặc mở khoá tài khoản. Chỉ thêm, không sửa. |

| Bảng | Cột chính | Ghi chú |
| --- | --- | --- |
| `scan_attempts` | id, user\_id, session\_id, raw\_input, mssv, source, result, checkin\_id, ip, user\_agent, device\_id, scanned\_at | Ghi mọi lượt quét, cả thất bại. raw\_input là chuỗi gốc (cắt tối đa 128 ký tự). result gồm ok, duplicate, unknown\_student, invalid\_format, out\_of\_window. Là nguồn dữ liệu chính cho phát hiện bất thường. |
| `alerts` | id, rule, severity, user\_id, session\_id, details (JSON), status (new, reviewing, confirmed, dismissed), reviewed\_by, review\_note, created\_at | Cờ cảnh báo do bộ luật sinh ra. Admin xem xét, ngừng hoạt động tài khoản nếu cần và bắt buộc ghi lý do khi đóng. |

## Danh sách API

Tiền tố `/api/v1`. Tất cả route trừ đăng nhập đều yêu cầu token hợp lệ và kiểm tra quyền.

| Route | Quyền | Mô tả |
| --- | --- | --- |
| `POST /auth/login` | Công khai, giới hạn tốc độ | Đăng nhập, trả access token, đặt refresh token vào cookie httpOnly; từ chối nếu tài khoản hết hạn hoặc bị khoá |
| `POST /auth/refresh` | Cookie refresh | Cấp access token mới, xoay vòng refresh token |
| `POST /auth/logout` | Đã đăng nhập | Thu hồi refresh token |
| `GET /sessions` | Đã đăng nhập | Staff thấy các buổi đang mở, Admin thấy mọi buổi |
| `POST /sessions`, `PATCH /sessions/:id` | Admin | Tạo, sửa, mở, đóng buổi |
| `POST /checkins` | Staff còn hiệu lực, Admin | Gửi MSSV (quét), nguồn nhập và id buổi, tạo check-in; nhập tay phải kèm lý do |
| `GET /checkins` | Theo quyền | Staff chỉ thấy của mình; Admin lọc theo buổi, ngày, sinh viên, có phân trang |
| `DELETE /checkins/:id` | Admin | Huỷ check-in, bắt buộc ghi lý do (ghi audit log) |
| `GET /sessions/:id/report` | Admin | Tổng hợp có mặt/vắng, xuất CSV |
| `GET/POST/PATCH /students` | Admin | Quản lý danh sách, nhập hàng loạt từ CSV |
| `GET/POST/PATCH /users` | Admin | Tạo tài khoản staff (có thể tạo hàng loạt cho một buổi, mật khẩu ngẫu nhiên hiện một lần), đặt thời hạn vài giờ, gia hạn, khoá hoặc ngừng hoạt động |
| `GET /audit-logs` | Admin | Xem nhật ký, có phân trang |
| `GET /health` | Công khai | Kiểm tra server và kết nối DB |

Route bổ sung cho kiểm soát nhân viên:

| Route | Quyền | Mô tả |
| --- | --- | --- |
| `GET /scan-attempts` | Admin | Xem mọi lượt quét kể cả thất bại, lọc theo nhân viên, buổi, kết quả |
| `GET /staff/:id/activity` | Admin | Tổng hợp hoạt động quét của một nhân viên qua các buổi |

## Bảo mật

Rủi ro lớn nhất không nằm ở mã QR mà ở người quét: nhân viên có thể điểm danh hộ sinh viên vắng hoặc quét ngoài giờ. Vì QR trên thẻ là cố định, không thể chống hoàn toàn bằng kỹ thuật, nên phải giảm rủi ro theo nhiều lớp và phát hiện hành vi bất thường (do bộ phận quản lý nhân viên làm).

**Mã QR và** **B****arcod****e**

- Mã trong QR là mã cố định trên thẻ sinh viên và có thể đoán được, nên không coi mã là bí mật. Bảo vệ nằm ở việc kiểm soát ai được quét, khi nào và quét ở đâu (xem mục kiểm soát nhân viên).
- Chỉ tài khoản đã đăng nhập và được cấp quyền mới quét được, người ngoài có mã cũng không tự check-in được. Cho phép nhập sai mật khẩu 5 lần nếu không sẽ chặn IP
- Chỉ nhận check-in khi buổi đang mở, trong khung giờ; giờ do server đặt.
- Ghi audit log mỗi lần quét gồm ai quét, quét mã nào, lúc nào, IP nào để truy vết khi có gian lận..&#32;

**Đăng nhập và phiên**

- Mật khẩu hash bằng argon2id (hoặc bcrypt cost từ 12), tối thiểu 10 ký tự. Không có tài khoản mặc định. Admin đầu tiên tạo bằng script, mật khẩu lấy từ biến môi trường.
- Access token JWT sống 15 phút, refresh token sống tối đa đến valid\_until của tài khoản (vài giờ), lưu dạng hash trong DB, xoay vòng mỗi lần dùng, lưu trong cookie httpOnly, Secure, SameSite=Strict.
- Khoá tài khoản (is\_active = false) hoặc tài khoản hết hạn (quá valid\_until) có hiệu lực ngay, kể cả với token đang sống, vì trạng thái và thời hạn được kiểm tra ở mỗi request. Refresh token cũng bị từ chối khi tài khoản hết hạn.

**Ứng dụng và hạ tầng**

- Bắt buộc HTTPS (camera trình duyệt cũng cần HTTPS), HSTS, các security header cấu hình trong Next.js, CORS chỉ cho phép domain của app.
- Validate mọi đầu vào bằng schema (zod hoặc class-validator), dùng truy vấn tham số hóa, không nối chuỗi SQL.
- Không trả thông báo lỗi nội bộ ra client. Log chi tiết ở server, có request id.
- Bí mật (mật khẩu DB, khoá ký JWT) chỉ nằm trong biến môi trường, không có giá trị mặc định; thiếu là server từ chối khởi động. Không commit `.env`, `node_modules`, thư mục build.
- Các lỗi của v1.0 cần tránh: token giả kiểm tra bằng chuỗi, endpoint quét không cần đăng nhập, tự tạo tài khoản khi quét, mật khẩu mặc định trong code và README.

## Stack, cấu trúc và lộ trình

**Stack đề xuất (hợp với Vercel):** Next.js (App Router) + TypeScript chạy cả giao diện lẫn API, PostgreSQL trên Neon hoặc Supabase, Prisma hoặc Drizzle (migration), Tailwind, thư viện quét ZXing (`@zxing/browser`, đọc được cả QR lẫn barcode). Logic nghiệp vụ đặt trong `server/services`, không phụ thuộc Vercel, để sau này chuyển sang server trường bằng Docker.

**Cấu trúc thư mục (monorepo):**

```
icetea/
  src/
    app/
      login/         # trang đăng nhập
      scan/          # trang quét và nhập tay MSSV
      admin/         # buổi, sinh viên, tài khoản tạm, cảnh báo
      api/           # route handlers: auth, checkins, sessions, ...
    server/
      services/      # logic nghiệp vụ, không phụ thuộc Vercel
      rules/         # bộ luật phát hiện bất thường
      auth/          # JWT, kiểm tra vai trò và thời hạn tài khoản
      db/            # Prisma client, truy vấn
    lib/             # parse MSSV, http client
  prisma/            # schema + migrations
  scripts/           # tạo admin đầu tiên
  tests/
  docs/
```

**Lộ trình:**

| Giai đoạn | Nội dung | Xong khi |
| --- | --- | --- |
| 1. Nền tảng | Repo mới, dự án Next.js + TypeScript, Postgres trên Neon, schema + migration, script tạo admin, `/api/health` | Deploy bản đầu lên Vercel, đăng nhập được bằng admin |
| 2. Xác thực | Login, refresh, logout, kiểm tra vai trò và thời hạn tài khoản, rate limit, audit log | Test chứng minh token giả bị từ chối, tài khoản hết hạn không quét được, route sai quyền trả 403 |
| 3. Nghiệp vụ | students, sessions, `POST /api/checkins` với ràng buộc duy nhất | Quét trùng trả 409, buổi đóng trả 422 |
| 4. Giao diện | Đăng nhập, trang quét mobile (QR, barcode, nhập tay), danh sách check-in, admin tạo tài khoản tạm | Quét thật trên điện thoại qua HTTPS |
| 5. Giám sát và báo cáo | Thống kê có mặt/vắng, xuất CSV, nhập sinh viên từ CSV, bộ luật phát hiện bất thường và màn hình cảnh báo | Xuất được báo cáo một buổi; test giả lập từng luật cho ra đúng cảnh báo |
| 6. Hoàn thiện | Test tự động (vitest hoặc jest), CI GitHub Actions, README sạch, chuyển sang server trường nếu cần | CI xanh, README không chứa bí mật |

**Triển khai: Vercel trước, server trường sau:**

- Vercel chạy Next.js dạng serverless, không có tiến trình chạy nền và không giữ trạng thái trong bộ nhớ. Vì vậy rate limit và khoá tạm phải lưu trong Postgres hoặc Redis (Upstash), và kết nối DB dùng connection pooling hoặc driver serverless.
- HTTPS có sẵn, đáp ứng yêu cầu camera của trình duyệt. Tên miền mặc định `*.vercel.app` đủ để thử nghiệm.
- Bí mật (JWT secret, DATABASE\_URL) đặt trong Environment Variables của Vercel, tách bản Preview và Production, không commit.
- Gói miễn phí (Hobby) của Vercel dành cho dùng cá nhân phi thương mại và có giới hạn riêng. Hãy kiểm tra lại điều khoản và giới hạn hiện hành trước khi chạy cho buổi thật.
- Khi chuyển sang server trường: đóng gói Docker, Postgres cục bộ, Nginx + HTTPS, đồng bộ giờ NTP, sao lưu hằng ngày, PostgreSQL chỉ nghe trên mạng nội bộ.

Cần bạn trả lời trước khi chốt schema (đã trả lời)

- [ ] Đồng ý đổi stack từ NestJS sang Next.js để chạy trên Vercel
- [ ] Bỏ luật IP giả đi
