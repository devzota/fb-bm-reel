# ZTTeam - History Crawler Tool (Công Cụ Cào & Lọc Bài Viết Lịch Sử)

Công cụ độc lập được phát triển riêng bởi **ZTTeam** dành cho việc cào, lọc tự động bài viết lịch sử từ `https://biz1.translatetooldenglish.com/` (hoặc các website WordPress tương tự), loại bỏ 100% truyện kịch bản gia đình và các ngôn ngữ lạ, xuất ra file JSON/CSV hoặc đẩy trực tiếp vào WordPress.

---

## 🌟 Tính Năng Nổi Bật

1. **Quét đa trang quy mô lớn (Deep Multi-Page Pagination)**:
   - Tận dụng tốc độ của WordPress REST API (`100 bài / lượt tải`), quét mượt mà từ vài chục đến hàng trăm trang (50.000+ bài viết).
   - Tự động phát hiện tổng số trang và bài viết trên website nguồn.

2. **Bộ lọc Lịch Sử chuẩn 100% (History Filter Gatekeeper)**:
   - Tự động nhận diện các mẫu tiêu đề lịch sử:
     - `In 1924, as national soda brands dismissed the rural South...`
     - `In 1892, Cornelius Vanderbilt II watched his wooden Newport...`
     - `On June 22nd, 1964, James Carlisle abandoned his dozer...`
     - `Two weeks after seeing combat, 20-year-old...` (`X days/weeks/months/years after/before/following...`)
     - `When Dad's Army first aired in 1968...`
     - `Just before dawn on November 4, 1791...`
   - Tự động loại bỏ hoàn toàn các bài viết tiếng Đức, Pháp, Séc, Ý, Thụy Điển, Phần Lan và các bài kịch bản tình cảm gia đình.

3. **Cơ chế Checkpoint (Resume)**:
   - Tự động ghi nhớ trang đã quét vào `data/checkpoint.json`.
   - Nếu bạn dừng tool (Ctrl+C hoặc tắt máy), lần sau chỉ cần thêm tham số `--resume` là tool sẽ tiếp tục chạy từ trang cũ, không bao giờ phải cào lại từ đầu.

4. **Đa dạng định dạng đầu ra**:
   - **JSON**: Đầy đủ tiêu đề, URL gốc, ngày đăng, nội dung text, nội dung HTML (có ảnh), danh sách ảnh.
   - **CSV**: Định dạng UTF-8 có BOM, mở trực tiếp bằng **Microsoft Excel** hoặc **Google Sheets** hiển thị tiếng Việt và ký tự đặc biệt hoàn hảo.

5. **Tự động đẩy vào WordPress (Tùy chọn)**:
   - Tự động xuất bản các bài lịch sử đã lọc sang website WordPress của bạn qua Application Password.

---

## 🚀 Cách Cài Đặt & Sử Dụng

### 1. Chạy nhanh qua lệnh `npm`:
```bash
# Quét 10 trang đầu tiên (1.000 bài viết):
npm run tool:history-crawler

# Hoặc chạy trực tiếp bằng Node.js:
node tools/history-crawler/ztteam_history_crawler.js --start 1 --end 10
```

### 2. Các ví dụ tham số thông dụng:

- **Quét 20 trang đầu (2.000 bài viết)**:
  ```bash
  node tools/history-crawler/ztteam_history_crawler.js --start 1 --end 20
  ```

- **Quét từ trang 21 đến trang 50 (khoảng 3.000 bài viết)**:
  ```bash
  node tools/history-crawler/ztteam_history_crawler.js --start 21 --end 50
  ```

- **Chạy tự động quét HẾT toàn bộ các trang trên site**:
  ```bash
  node tools/history-crawler/ztteam_history_crawler.js --start 1 --all
  ```

- **Tiếp tục chạy từ trang đã dừng lần trước (Resume)**:
  ```bash
  node tools/history-crawler/ztteam_history_crawler.js --resume
  ```

- **Xuất ra tên file riêng tùy chọn**:
  ```bash
  node tools/history-crawler/ztteam_history_crawler.js --start 1 --end 30 --output-json my_history.json --output-csv my_history.csv
  ```

- **Vừa lọc bài vừa đẩy trực tiếp lên website WordPress của bạn**:
  ```bash
  node tools/history-crawler/ztteam_history_crawler.js --start 1 --end 5 \
    --wp-url https://site-cua-ban.com \
    --wp-user admin \
    --wp-pass "xxxx xxxx xxxx xxxx" \
    --wp-cat 1 \
    --wp-status publish
  ```
  *(Lưu ý: Mật khẩu ứng dụng `wp-pass` lấy tại: WP Admin ➔ Thành viên (Users) ➔ Hồ sơ (Profile) ➔ Mật khẩu ứng dụng (Application Passwords))*

---

## ⚙️ Cấu Hình Mặc Định (`config.json`)

Bạn cũng có thể mở file `tools/history-crawler/config.json` để sửa các giá trị mặc định theo ý muốn:

```json
{
  "sourceSite": "https://biz1.translatetooldenglish.com",
  "startPage": 1,
  "endPage": 10,
  "perPage": 100,
  "delayMs": 1000,
  "outputJson": "data/history_posts.json",
  "outputCsv": "data/history_posts.csv",
  "checkpointFile": "data/checkpoint.json"
}
```

---

## 📁 Cấu Trúc Thư Mục Dữ Liệu

Khi chạy, kết quả sẽ tự động được lưu vào thư mục `tools/history-crawler/data/`:
- `data/history_posts.json`: File dữ liệu JSON chứa toàn bộ bài lịch sử đầy đủ chi tiết.
- `data/history_posts.csv`: File bảng tính CSV mở bằng Excel.
- `data/checkpoint.json`: File lưu tiến độ quét để resume.
