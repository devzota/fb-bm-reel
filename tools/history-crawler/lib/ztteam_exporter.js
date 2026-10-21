/**
 * ZTTeam: Module xuất dữ liệu ra file JSON & CSV
 * Hỗ trợ định dạng UTF-8 có BOM tương thích 100% với Microsoft Excel
 */

const fs = require('fs');
const path = require('path');

/**
 * Thoát chuỗi an toàn cho định dạng CSV
 * @param {string} str - Chuỗi cần xử lý
 * @returns {string} - Chuỗi an toàn trong CSV
 */
function ztteam_escapeCsv(str) {
  if (str === null || str === undefined) return '""';
  const val = String(str).replace(/"/g, '""');
  return `"${val}"`;
}

/**
 * Đảm bảo thư mục cha tồn tại
 * @param {string} filePath - Đường dẫn file
 */
function ztteam_ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Xuất toàn bộ danh sách bài viết ra file JSON
 * @param {Array} posts - Mảng bài viết
 * @param {string} jsonPath - Đường dẫn file JSON
 */
function ztteam_exportJson(posts, jsonPath) {
  ztteam_ensureDir(jsonPath);
  fs.writeFileSync(jsonPath, JSON.stringify(posts, null, 2), 'utf8');
}

/**
 * Xuất toàn bộ danh sách bài viết ra file CSV (UTF-8 BOM cho Excel)
 * @param {Array} posts - Mảng bài viết
 * @param {string} csvPath - Đường dẫn file CSV
 */
function ztteam_exportCsv(posts, csvPath) {
  ztteam_ensureDir(csvPath);

  const headers = [
    'ID',
    'Tiêu đề (Title)',
    'URL gốc',
    'Ngày đăng',
    'Số lượng ảnh',
    'Ảnh đại diện',
    'Trích đoạn',
    'Nội dung sạch (Preview 500 ký tự)'
  ];

  const rows = [headers.map(ztteam_escapeCsv).join(',')];

  posts.forEach(p => {
    const previewContent = p.content_text ? p.content_text.substring(0, 500).replace(/\n/g, ' ') : '';
    const row = [
      p.id || '',
      p.title || '',
      p.url || '',
      p.date || '',
      p.images ? p.images.length : 0,
      p.featured_image || (p.images && p.images[0]) || '',
      p.excerpt || '',
      previewContent
    ];
    rows.push(row.map(ztteam_escapeCsv).join(','));
  });

  /** Thêm UTF-8 BOM (\ufeff) để Excel mở tiếng Việt/ký tự đặc biệt không bị lỗi */
  const csvContent = '\ufeff' + rows.join('\r\n');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
}

/**
 * Cập nhật/nối thêm bài viết vào file JSON và CSV hiện có (Streaming mode an toàn)
 * @param {Array} newPosts - Các bài viết mới thu thập
 * @param {string} jsonPath - File JSON
 * @param {string} csvPath - File CSV
 * @returns {number} - Tổng số bài hiện có sau khi cập nhật
 */
function ztteam_appendPosts(newPosts, jsonPath, csvPath) {
  if (!newPosts || newPosts.length === 0) return 0;

  ztteam_ensureDir(jsonPath);
  ztteam_ensureDir(csvPath);

  /** 1. Nạp và gộp vào JSON */
  let existingPosts = [];
  if (fs.existsSync(jsonPath)) {
    try {
      const data = fs.readFileSync(jsonPath, 'utf8');
      existingPosts = JSON.parse(data);
      if (!Array.isArray(existingPosts)) existingPosts = [];
    } catch (e) {
      existingPosts = [];
    }
  }

  const existingIds = new Set(existingPosts.map(p => String(p.id)));
  const uniqueNew = newPosts.filter(p => !existingIds.has(String(p.id)));

  if (uniqueNew.length === 0) {
    return existingPosts.length;
  }

  const combined = existingPosts.concat(uniqueNew);
  fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2), 'utf8');

  /** 2. Nối tiếp vào file CSV */
  const csvNeedsHeader = !fs.existsSync(csvPath) || fs.statSync(csvPath).size === 0;
  const rows = [];

  if (csvNeedsHeader) {
    const headers = [
      'ID',
      'Tiêu đề (Title)',
      'URL gốc',
      'Ngày đăng',
      'Số lượng ảnh',
      'Ảnh đại diện',
      'Trích đoạn',
      'Nội dung sạch (Preview 500 ký tự)'
    ];
    rows.push(headers.map(ztteam_escapeCsv).join(','));
  }

  uniqueNew.forEach(p => {
    const previewContent = p.content_text ? p.content_text.substring(0, 500).replace(/\n/g, ' ') : '';
    const row = [
      p.id || '',
      p.title || '',
      p.url || '',
      p.date || '',
      p.images ? p.images.length : 0,
      p.featured_image || (p.images && p.images[0]) || '',
      p.excerpt || '',
      previewContent
    ];
    rows.push(row.map(ztteam_escapeCsv).join(','));
  });

  const appendData = (csvNeedsHeader ? '\ufeff' : '') + rows.join('\r\n') + '\r\n';
  fs.appendFileSync(csvPath, appendData, 'utf8');

  return combined.length;
}

module.exports = {
  ztteam_exportJson,
  ztteam_exportCsv,
  ztteam_appendPosts,
  ztteam_escapeCsv,
};
