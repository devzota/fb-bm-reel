import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';

/**
 * ZTTeam: Trang Hướng Dẫn Tạo Token Meta Business Manager (BM)
 * Hướng dẫn trực quan, từng bước chuẩn kỹ thuật Meta cho System User Token vĩnh viễn (Never Expire).
 * Tuân thủ nghiêm ngặt Style Guidelines: Không dùng màu hồng/tím, dùng cấu trúc component của hệ thống.
 */
export default function MetaBMGuidePage() {
  const navigate = useNavigate();
  const { ztteam_showToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<number>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  /** Danh sách 6 quyền bắt buộc cần tích khi tạo Token */
  const ztteam_requiredPermissions = [
    {
      name: 'pages_show_list',
      desc: 'Cho phép hệ thống quét và nạp toàn bộ danh sách Fanpage được gán cho System User.',
      required: true,
      tag: 'Cơ bản'
    },
    {
      name: 'pages_read_engagement',
      desc: 'Đọc số lượt xem, tương tác, cảm xúc, bình luận của các bài viết và video Reels.',
      required: true,
      tag: 'Thống kê'
    },
    {
      name: 'pages_manage_posts',
      desc: 'Quyền đăng video Reel, bài viết hình ảnh tự động và đăng bình luận mồi dưới bài viết.',
      required: true,
      tag: 'Xuất bản'
    },
    {
      name: 'pages_read_user_content',
      desc: 'Đọc bình luận của độc giả để kích hoạt auto-reply (trả lời bình luận có chứa link bài gốc).',
      required: true,
      tag: 'Tự động hóa'
    },
    {
      name: 'read_insights',
      desc: 'Truy vấn chỉ số hiệu suất từ Facebook Page Insights (Lượt xem, người tiếp cận, tăng trưởng).',
      required: true,
      tag: 'Báo cáo'
    },
    {
      name: 'business_management',
      desc: 'Xác thực cấu trúc Doanh nghiệp, nhận diện Meta App và phân loại tài sản tập trung.',
      required: true,
      tag: 'Doanh nghiệp'
    }
  ];

  /** Sao chép danh sách quyền vào Clipboard */
  const ztteam_copyPermissions = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    ztteam_showToast(`Đã sao chép: ${key}`, 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const ztteam_copyAllPermissions = () => {
    const all = ztteam_requiredPermissions.map(p => p.name).join(', ');
    navigator.clipboard.writeText(all);
    setCopiedKey('ALL');
    ztteam_showToast('Đã sao chép toàn bộ 6 quyền Meta BM!', 'success');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/** 1. Top Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-fb-surface-hover/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-fb-blue to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0">
            <span className="material-symbols-outlined text-2xl">menu_book</span>
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Hướng Dẫn Tạo Token Meta BM</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Vĩnh Viễn (Never Expire)
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-fb-text-muted mt-1">
              Quy trình chuẩn kỹ thuật Meta tạo System User Token hoạt động 24/7/365 và miễn nhiễm checkpoint.
            </p>
          </div>
        </div>

        {/** Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href="https://business.facebook.com/settings/system-users"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-full text-xs font-bold bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text border border-white/5 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            title="Mở Meta Business Settings trong tab mới"
          >
            <span className="material-symbols-outlined text-sm text-cyan-400">open_in_new</span>
            <span>Mở Cài Đặt BM</span>
          </a>

          <button
            onClick={() => navigate('/facebook/business-hub')}
            className="px-5 py-2.5 rounded-full text-xs font-bold bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-90 text-white flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">domain</span>
            <span>Quản Lý BM &amp; App</span>
          </button>
        </div>
      </div>

      {/** 2. Clean 3-Tab Navigation Bar */}
      <div className="flex border-b border-fb-surface-hover/60 bg-fb-surface px-4 pt-2 rounded-2xl shadow-sm gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab(1)}
          className={`px-5 py-3 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 1
              ? 'border-fb-blue text-fb-blue bg-fb-blue/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
          1. Quy Trình 5 Bước Chuẩn
        </button>

        <button
          onClick={() => setActiveTab(2)}
          className={`px-5 py-3 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 2
              ? 'border-cyan-400 text-cyan-400 bg-cyan-400/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">checklist</span>
          2. Danh Sách 6 Quyền Bắt Buộc
        </button>

        <button
          onClick={() => setActiveTab(3)}
          className={`px-5 py-3 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 3
              ? 'border-amber-400 text-amber-400 bg-amber-400/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">help</span>
          3. Hỏi Đáp &amp; Khắc Phục Lỗi
        </button>
      </div>

      {/** TAB 1: QUY TRÌNH 5 BƯỚC */}
      {activeTab === 1 && (
        <div className="space-y-5">
          {/** Bước 1 */}
          <div className="bg-fb-surface rounded-2xl p-5 sm:p-6 shadow-md border border-fb-surface-hover/60 flex flex-col md:flex-row gap-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-black text-xl shrink-0 shadow-inner border border-blue-500/30">
              1
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-fb-text">Truy Cập Cài Đặt Doanh Nghiệp (Business Settings)</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400">Khởi đầu</span>
              </div>
              <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed">
                Đăng nhập tài khoản Facebook có quyền <b>Quản trị viên (Admin)</b> của Doanh Nghiệp Meta (Meta Business Suite). Sau đó truy cập vào trang quản lý:
              </p>
              <div className="p-3 bg-fb-surface-hover/50 rounded-xl flex items-center justify-between gap-3 border border-white/5">
                <code className="text-xs font-mono text-cyan-400 truncate">https://business.facebook.com/settings/system-users</code>
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-fb-blue text-white rounded-lg text-xs font-bold hover:bg-fb-blue-hover transition-colors shrink-0 flex items-center gap-1"
                >
                  <span>Mở Ngay</span>
                  <span className="material-symbols-outlined text-xs">arrow_outward</span>
                </a>
              </div>
            </div>
          </div>

          {/** Bước 2 */}
          <div className="bg-fb-surface rounded-2xl p-5 sm:p-6 shadow-md border border-fb-surface-hover/60 flex flex-col md:flex-row gap-5">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center font-black text-xl shrink-0 shadow-inner border border-cyan-500/30">
              2
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-fb-text">Tạo Hoặc Kết Nối Meta App</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400">Ứng dụng</span>
              </div>
              <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed">
                Trong thanh menu bên trái của BM, bấm vào mục <b>Tài khoản (Accounts) &rarr; Ứng dụng (Apps)</b>:
              </p>
              <ul className="text-xs sm:text-sm text-fb-text-muted space-y-1.5 list-disc pl-5">
                <li>Nếu chưa có App: Bấm <b>Thêm (Add) &rarr; Tạo ID ứng dụng mới</b> &rarr; Chọn loại ứng dụng là <b>Doanh nghiệp (Business)</b>.</li>
                <li>Đặt tên App gợi nhớ (ví dụ: <code className="text-fb-text font-bold">Reel Studio Hub</code>) và lưu lại.</li>
              </ul>
            </div>
          </div>

          {/** Bước 3 */}
          <div className="bg-fb-surface rounded-2xl p-5 sm:p-6 shadow-md border border-fb-surface-hover/60 flex flex-col md:flex-row gap-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-black text-xl shrink-0 shadow-inner border border-emerald-500/30">
              3
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-fb-text">Tạo Người Dùng Hệ Thống (System User)</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400">Quan trọng</span>
              </div>
              <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed">
                Vào mục <b>Người dùng (Users) &rarr; Người dùng hệ thống (System Users)</b> &rarr; Bấm <b>Thêm (Add)</b>:
              </p>
              <ul className="text-xs sm:text-sm text-fb-text-muted space-y-1.5 list-disc pl-5">
                <li>Tên người dùng hệ thống: Đặt tên gợi nhớ (ví dụ: <code className="text-fb-text font-bold">ZT Reel Bot</code>).</li>
                <li>Vai trò người dùng hệ thống: Bắt buộc chọn <b>Quản trị viên (Admin)</b> để được toàn quyền đăng bài và lấy insights.</li>
              </ul>
            </div>
          </div>

          {/** Bước 4 - ĐẶC BIỆT QUAN TRỌNG */}
          <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-amber-950/20 rounded-2xl p-5 sm:p-6 shadow-md border border-amber-500/40 flex flex-col md:flex-row gap-5 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xl shrink-0 shadow-inner border border-amber-500/40">
              4
            </div>
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-amber-300">BƯỚC THEN CHỐT: Gán Tài Sản Fanpage (Assign Assets)</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/25 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                  Bắt buộc
                </span>
              </div>
              <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-xs text-amber-200">
                ⚠️ <b>LƯU Ý QUYẾT ĐỊNH:</b> Nếu bỏ qua bước này, Token tạo ra sẽ <b>hoàn toàn không nhìn thấy Fanpage nào</b> và hệ thống sẽ báo lỗi không tìm thấy trang!
              </div>
              <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed">
                Các thao tác thực hiện:
              </p>
              <ol className="text-xs sm:text-sm text-fb-text-muted space-y-1.5 list-decimal pl-5">
                <li>Nhấp vào tên <b>System User</b> vừa tạo ở Bước 3.</li>
                <li>Bấm vào nút <b>Gán tài sản (Assign Assets)</b> ở góc trên bên phải.</li>
                <li>Ở cột bên trái, chọn mục <b>Trang (Pages)</b> &rarr; Tích chọn các Fanpage bạn muốn kết nối.</li>
                <li>Ở cột bên phải, kéo xuống dưới cùng và bật công tắc: <b>Quản lý toàn quyền (Full Control / Manage Page)</b>.</li>
                <li>Bấm <b>Lưu thay đổi (Save Changes)</b>.</li>
              </ol>
            </div>
          </div>

          {/** Bước 5 */}
          <div className="bg-fb-surface rounded-2xl p-5 sm:p-6 shadow-md border border-fb-surface-hover/60 flex flex-col md:flex-row gap-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-black text-xl shrink-0 shadow-inner border border-blue-500/30">
              5
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-fb-text">Tạo Token Vĩnh Viễn (Never Expire) &amp; Tích Quyền</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400">Hoàn tất</span>
              </div>
              <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed">
                Vẫn tại trang System User đó:
              </p>
              <ol className="text-xs sm:text-sm text-fb-text-muted space-y-1.5 list-decimal pl-5">
                <li>Bấm nút <b>Tạo mã token mới (Generate New Token)</b>.</li>
                <li>Chọn <b>Ứng dụng (App)</b> bạn đã tạo ở Bước 2.</li>
                <li>Mục <b>Thời hạn mã (Token Expiry)</b>: Chọn mục <b className="text-emerald-400">Không bao giờ (Never)</b>.</li>
                <li>Ở danh sách quyền (Permissions), tích chọn đủ <b>6 quyền bắt buộc</b> (xem ở Tab 2).</li>
                <li>Bấm nút <b>Tạo mã token (Generate Token)</b> &rarr; Meta sẽ hiển thị chuỗi Token dài bắt đầu bằng chữ <code className="text-cyan-400 font-bold">EAAT...</code>.</li>
                <li>Bấm <b>Sao chép (Copy)</b> và lưu lại token an toàn.</li>
              </ol>

              <div className="pt-3">
                <button
                  onClick={() => navigate('/facebook/business-hub')}
                  className="px-5 py-2.5 bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-90 text-white rounded-full font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">login</span>
                  <span>Mở Trang Nhập Token BM Ngay &rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/** TAB 2: CHECKLIST 6 QUYỀN BẮT BUỘC */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="bg-fb-surface p-5 rounded-2xl shadow-md border border-fb-surface-hover/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-fb-text">Checklist 6 Quyền Bắt Buộc</h3>
              <p className="text-xs text-fb-text-muted mt-0.5">Tích đủ 6 quyền này khi tạo token để đảm bảo hệ thống tự động hóa vận hành 100% trơn tru.</p>
            </div>
            <button
              onClick={ztteam_copyAllPermissions}
              className="px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 rounded-full font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer border border-cyan-500/30"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              <span>{copiedKey === 'ALL' ? 'Đã sao chép tất cả!' : 'Sao chép tất cả 6 quyền'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {ztteam_requiredPermissions.map((perm) => (
              <div
                key={perm.name}
                className="bg-fb-surface rounded-2xl p-4 shadow-sm border border-fb-surface-hover/50 hover:border-blue-500/40 transition-colors flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
                      {perm.tag}
                    </span>
                    <button
                      onClick={() => ztteam_copyPermissions(perm.name, perm.name)}
                      className="text-fb-text-muted hover:text-cyan-400 p-1 rounded-md transition-colors"
                      title="Sao chép tên quyền"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copiedKey === perm.name ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </div>
                  <h4 className="text-sm font-mono font-black text-fb-text group-hover:text-cyan-300 transition-colors">
                    {perm.name}
                  </h4>
                  <p className="text-xs text-fb-text-muted mt-1 leading-relaxed">
                    {perm.desc}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-fb-surface-hover/40 flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                  <span className="material-symbols-outlined text-xs">verified</span>
                  <span>Bắt buộc phải tích</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/** TAB 3: HỎI ĐÁP & SỰ CỐ */}
      {activeTab === 3 && (
        <div className="space-y-4">
          <div className="bg-fb-surface rounded-2xl p-5 shadow-md border border-fb-surface-hover/60 space-y-2">
            <h3 className="text-base font-black text-fb-text flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400">help</span>
              <span>1. Tại sao kết nối thành công nhưng hệ thống không thấy Fanpage nào?</span>
            </h3>
            <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed pl-7">
              <b>Nguyên nhân 99%:</b> Bạn đã bỏ quên <b>Bước 4 (Gán tài sản - Assign Assets)</b>. Dù System User đã có quyền Quản trị viên của BM, nhưng nếu chưa được chỉ định quản lý cụ thể Fanpage nào trong BM thì token sinh ra sẽ trả về mảng rỗng.
              <br />
              <b className="text-cyan-400">Cách sửa:</b> Vào lại Cài đặt BM &rarr; Người dùng hệ thống &rarr; Chọn System User &rarr; Bấm <b>Gán tài sản (Assign Assets)</b> &rarr; Chọn các Page &rarr; Bật <b>Quản lý toàn quyền</b> &rarr; Lưu lại. Sau đó quay lại website và bấm nút "Đồng Bộ Lại".
            </p>
          </div>

          <div className="bg-fb-surface rounded-2xl p-5 shadow-md border border-fb-surface-hover/60 space-y-2">
            <h3 className="text-base font-black text-fb-text flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400">help</span>
              <span>2. Tôi vừa thêm Fanpage mới vào Business Manager, làm sao để hệ thống nhận diện?</span>
            </h3>
            <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed pl-7">
              Bạn chỉ cần vào BM &rarr; Người dùng hệ thống &rarr; Bấm <b>Gán tài sản</b> và tích thêm Fanpage mới đó. Sau đó, trên website vào trang <b className="text-fb-blue">Quản Lý BM &amp; App</b>, tìm đến Doanh Nghiệp tương ứng và bấm nút <b>Đồng Bộ</b>, hệ thống sẽ tự động quét và thêm Fanpage mới mà không cần tạo lại token!
            </p>
          </div>

          <div className="bg-fb-surface rounded-2xl p-5 shadow-md border border-fb-surface-hover/60 space-y-2">
            <h3 className="text-base font-black text-fb-text flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400">help</span>
              <span>3. Token có thực sự không bao giờ hết hạn không?</span>
            </h3>
            <p className="text-xs sm:text-sm text-fb-text-muted leading-relaxed pl-7">
              <b>Đúng 100%!</b> Theo tài liệu chính thức của Meta for Developers, Access Token được tạo từ System User với tùy chọn <code className="text-emerald-400 font-bold">Never</code> có trường <code className="text-fb-text font-mono">expires_at = 0</code>, nghĩa là token vĩnh viễn không bao giờ hết hạn, trừ khi bạn chủ động bấm nút "Thu hồi mã (Revoke Token)" trong Business Settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
