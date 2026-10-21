/**
 * ZTTeam: Bộ lọc nhận diện bài viết lịch sử & chuẩn hóa nội dung
 * Hỗ trợ bóc tách các bài viết dạng tư liệu lịch sử, loại trừ ngoại ngữ và truyện gia đình
 */

/**
 * Giải mã các ký tự HTML entities thông dụng trong tiêu đề
 */
function ztteam_decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Kiểm tra xem tiêu đề bài viết có phải là bài lịch sử hay không
 * @param {string} rawTitle - Tiêu đề bài viết
 * @returns {boolean} - true nếu là bài lịch sử, false nếu không phải
 */
function ztteam_isHistoryPost(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return false;

  const decoded = ztteam_decodeHtmlEntities(rawTitle).trim();
  if (!decoded) return false;

  /** 1. Loại trừ các ngôn ngữ không phải tiếng Anh (Pháp, Đức, Thụy Điển, Séc, Ý, Đan Mạch, Phần Lan) và từ khóa drama gia đình */
  const nonEnglishWords = /\b(ich|mich|mir|dass|nicht|meine|meiner|meines|und|ist|war|sie|wir|ihr|schmutzige|ungläubig|scheidungspapiere|j'ai|j'étais|c'est|dans|avec|pour|qui|que|sur|ma|mon|mes|une|des|nous|vous|elle|lui|jag|stod|mig|med|och|det|min|mamma|seděla|jsem|před|byla|quella|notte|mio|mia|nella|della|hände|händerna|tulin|kotiin|tunsin|sanoi|mor|tager|vielä|mutta|fick|honom|henne|bara|hade|vad|när|eller|utan|vår|vårt|dina|ditt|mitt|mina|když|jsem|jsme|byl|byli|byla|bylo|jsem|můj|moje|mojí|své|svou|svůj|jeho|její|jako|tak|ale|nebo|jen|pro|při|pod|nad|mezi)\b/i;
  if (nonEnglishWords.test(decoded)) {
    return false;
  }

  /** 2. Danh sách regex nhận diện tiêu đề bài viết lịch sử theo các mẫu chuẩn */
  const historyPatterns = [
    /** Mẫu 1: In/On/By/During + [Tháng/Mùa/Năm/Thập kỷ/Thế kỷ]
     * Ví dụ: In 1924, as national soda brands...
     *        In 1892, Cornelius Vanderbilt II...
     *        On June 22nd, 1964, James Carlisle a...
     *        In August 1992, Sarah Ferguson...
     *        During World War II, ...
     */
    /^(in|on|by|during)\s+(the\s+)?(early\s+|late\s+|mid-)?(winter|spring|summer|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december|[0-9]{1,2}(st|nd|rd|th)?|\b[12][0-9]{3}s?\b)/i,

    /** Mẫu 2: Khoảng thời gian + after/before/following
     * Ví dụ: Two weeks after seeing combat, 20-year-old...
     *        Four days after the invasion...
     *        Three months before Pearl Harbor...
     */
    /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[0-9]+)\s+(days|weeks|months|years|hours|decades)\s+(after|before|following)/i,

    /** Mẫu 3: Khoảng thời gian kéo dài trong năm
     * Ví dụ: Over 12 days in 1944...
     *        Over several months in 1918...
     */
    /^over\s+[a-z0-9]+\s+(days|weeks|months|years)\s+in\s+/i,

    /** Mẫu 4: When + Sự kiện lịch sử / Năm
     * Ví dụ: When Dad's Army first aired in 1968...
     *        When World War II broke out...
     */
    /^when\s+.*\b(in\s+[12][0-9]{3}|world war|war|1[0-9]{3}|20[0-9]{2})\b/i,

    /** Mẫu 5: Just before / Just after + Mốc thời gian
     * Ví dụ: Just before dawn on November 4, 1791...
     *        Just after the surrender in 1945...
     */
    /^just\s+(before|after)\s+.*\b(in|on|by)\s+[12][0-9]{3}\b/i,

    /** Mẫu 6: In + Thời đại cổ / Giai đoạn lịch sử
     * Ví dụ: In medieval England...
     *        In ancient Rome...
     *        In post-war Berlin...
     */
    /^in\s+(the\s+)?(medieval|ancient|colonial|post-war|pre-war|feudal|victorian|edwardian|renaissance)\s+/i,

    /** Mẫu 7: Bắt đầu trực tiếp bằng mốc năm
     * Ví dụ: 1944: The year that changed everything...
     */
    /^[12][0-9]{3}\b/i,

    /** Mẫu 8: Mô tả nhân vật lịch sử kèm mốc năm/ngày tháng
     * Ví dụ: A 36-year-old SS administrative lawyer... on April 3, 1945...
     */
    /^a\s+[0-9]+-year-old\s+.*\b(in\s+[12][0-9]{3}|on\s+[a-z]+\s+[0-9]{1,2},\s+[12][0-9]{3})\b/i
  ];

  return historyPatterns.some(regex => regex.test(decoded));
}

/**
 * Trích xuất danh sách URL ảnh từ nội dung HTML
 * @param {string} html - Chuỗi HTML
 * @returns {string[]} - Mảng các URL hình ảnh
 */
function ztteam_extractImagesFromHtml(html) {
  if (!html) return [];
  const imageUrls = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1] && !imageUrls.includes(match[1])) {
      imageUrls.push(match[1]);
    }
  }
  return imageUrls;
}

/**
 * Làm sạch nội dung câu chuyện (loại bỏ quảng cáo, mã rác, script)
 * @param {string} rawHtml - Chuỗi HTML thô
 * @returns {{ cleanText: string, cleanHtml: string, images: string[] }}
 */
function ztteam_cleanStoryContent(rawHtml) {
  if (!rawHtml) return { cleanText: '', cleanHtml: '', images: [] };

  const images = ztteam_extractImagesFromHtml(rawHtml);

  /** Làm sạch HTML: loại bỏ script, style, iframe quảng cáo */
  let cleanHtml = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  /** Chuyển HTML thành text thuần túy cho AI/đọc hiểu */
  let cleanText = cleanHtml
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  cleanText = ztteam_decodeHtmlEntities(cleanText);

  return { cleanText, cleanHtml, images };
}

module.exports = {
  ztteam_decodeHtmlEntities,
  ztteam_isHistoryPost,
  ztteam_extractImagesFromHtml,
  ztteam_cleanStoryContent,
};
