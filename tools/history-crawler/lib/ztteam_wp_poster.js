/**
 * ZTTeam: Module đăng bài trực tiếp vào WordPress thông qua REST API
 * Hỗ trợ xác thực bằng Application Password của WordPress
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Gửi HTTP request an toàn hỗ trợ cả HTTP và HTTPS
 * @param {string} targetUrl - URL đích
 * @param {object} options - Cấu hình request
 * @param {string|Buffer} body - Dữ liệu gửi đi
 * @returns {Promise<{ statusCode: number, data: string, json: any }>}
 */
function ztteam_httpRequest(targetUrl, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'ZTTeam-History-Crawler/1.0',
        ...options.headers,
      },
      rejectUnauthorized: false,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({ statusCode: res.statusCode, data, json });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Đăng bài viết vào website WordPress đích
 * @param {object} postData - Dữ liệu bài viết { title, content_html, excerpt, categoryId, status }
 * @param {object} wpConfig - Cấu hình { wpUrl, wpUser, wpPass, wpStatus, wpCategory }
 * @returns {Promise<{ success: boolean, wpPostId?: number, wpPostUrl?: string, error?: string }>}
 */
async function ztteam_publishToWordPress(postData, wpConfig) {
  if (!wpConfig || !wpConfig.wpUrl || !wpConfig.wpUser || !wpConfig.wpPass) {
    return { success: false, error: 'Thiếu thông tin cấu hình WordPress (URL, User hoặc Application Password)' };
  }

  try {
    const baseUrl = wpConfig.wpUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;

    /** Mã hóa Basic Auth */
    const authHeader = 'Basic ' + Buffer.from(`${wpConfig.wpUser}:${wpConfig.wpPass}`).toString('base64');

    const payload = {
      title: postData.title,
      content: postData.content_html || postData.content_text,
      status: wpConfig.wpStatus || 'publish',
    };

    if (postData.excerpt) {
      payload.excerpt = postData.excerpt;
    }

    const catId = wpConfig.wpCategory || postData.categoryId;
    if (catId && !isNaN(Number(catId))) {
      payload.categories = [Number(catId)];
    }

    const payloadString = JSON.stringify(payload);

    const response = await ztteam_httpRequest(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
      },
    }, payloadString);

    if (response.statusCode >= 200 && response.statusCode < 300 && response.json) {
      return {
        success: true,
        wpPostId: response.json.id,
        wpPostUrl: response.json.link,
      };
    } else {
      const errMsg = (response.json && (response.json.message || response.json.code)) || `HTTP ${response.statusCode}`;
      return {
        success: false,
        error: errMsg,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  ztteam_publishToWordPress,
  ztteam_httpRequest,
};
