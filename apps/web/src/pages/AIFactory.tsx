import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useUIStore } from '../stores/uiStore';
import { ztteam_decodeHtmlEntity } from '../utils/stringUtils';
import CustomDropdown from '../components/CustomDropdown';
import ZTTeamAIPostCard from '../components/AIPostCard';

/**
 * ZTTeam AIFactory Component
 * Quản lý hàng đợi bài viết & ảnh 2K AI chuẩn Facebook Feed
 * Tối ưu bộ lọc Tabs trạng thái, tìm kiếm từ khóa, phân trang và đếm số lượng thời gian thực
 */
export default function AIFactory() {
  /** Data List States */
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{
    total: number;
    queued: number;
    rendering: number;
    completed: number;
    posted: number;
    failed: number;
    videoFailed?: number;
    manual?: number;
  }>({
    total: 0,
    queued: 0,
    rendering: 0,
    completed: 0,
    posted: 0,
    failed: 0,
    videoFailed: 0,
    manual: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  /** Filter States */
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVideoStatus, setFilterVideoStatus] = useState('');
  const [filterPage, setFilterPage] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [pages, setPages] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(24);
  const [isPosting, setIsPosting] = useState<Record<string, boolean>>({});

  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const searchTimeoutRef = useRef<any>(null);

  /** Debounce tìm kiếm từ khóa 350ms */
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
      setCurrentPage(1);
    }, 350);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchKeyword]);

  /** Load danh sách Fanpage khi mount */
  useEffect(() => {
    ztteam_loadPages();
  }, []);

  /** Fetch danh sách bài viết khi filterStatus, filterVideoStatus, filterPage, debouncedKeyword, limit hoặc currentPage thay đổi */
  useEffect(() => {
    ztteam_loadItems();
  }, [filterStatus, filterVideoStatus, filterPage, debouncedKeyword, currentPage, limit]);

  /** SSE Live Time Update & Polling ngầm */
  useEffect(() => {
    const sse = new EventSource('/api/image/events');

    sse.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setItems((prevItems) => {
          const exists = prevItems.find((r) => r.id === payload.id);
          if (exists) {
            return prevItems.map((r) => (r.id === payload.id ? { ...r, ...payload } : r));
          }
          return prevItems;
        });
      } catch (err) {
        /** ignore parse error */
      }
    };

    /** Background polling ngầm mỗi 10 giây để đồng bộ trạng thái mới */
    const interval = setInterval(() => {
      ztteam_loadItems(true);
    }, 10000);

    return () => {
      sse.close();
      clearInterval(interval);
    };
  }, [filterStatus, filterVideoStatus, filterPage, debouncedKeyword, currentPage, limit]);

  /** Tải danh sách bài viết từ API */
  const ztteam_loadItems = async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterVideoStatus) params.append('videoStatus', filterVideoStatus);
      if (filterPage) params.append('fbPageId', filterPage);
      if (debouncedKeyword) params.append('search', debouncedKeyword);
      params.append('page', String(currentPage));
      params.append('limit', String(limit));

      const res = await api.get(`image/list?${params.toString()}`);
      setItems(res.data?.data || []);
      setTotal(res.data?.total || 0);
      if (res.data?.counts) {
        setCounts(res.data.counts);
      }
    } catch (error: any) {
      if (!isSilent) ztteam_showToast('Lỗi tải danh sách bài viết AI', 'error');
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  /** Tải danh sách Fanpage */
  const ztteam_loadPages = async () => {
    try {
      const res = await api.get('facebook/pages');
      setPages(res.data || []);
    } catch {
      /** ignore */
    }
  };

  /** Làm mới khung giờ / Thử lại */
  const ztteam_retryItem = async (itemOrId: any) => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    if (!id) return;
    try {
      const res = await api.post(`image/retry/${id}`);
      ztteam_showToast(res.data?.message || 'Đã làm mới lại khung giờ xuất bản (giữ nguyên ảnh)', 'success');
      ztteam_loadItems();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi làm mới', 'error');
    }
  };

  /** Xóa bài viết khỏi hàng đợi */
  const ztteam_deleteItem = async (itemOrId: any) => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    if (!id) return;
    const confirmed = await ztteam_showConfirm('Xác nhận xóa', 'Xóa bài viết này khỏi hàng đợi? Hành động không thể hoàn tác.');
    if (!confirmed) return;
    try {
      await api.delete(`image/${id}`);
      ztteam_showToast('Đã xóa thành công', 'success');
      ztteam_loadItems();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi xóa', 'error');
    }
  };

  /** Đăng ngay lên Fanpage */
  const ztteam_postToFB = async (item: any) => {
    const confirmed = await ztteam_showConfirm('Đăng ngay lên Fanpage', 'Bạn muốn đăng bài viết này lên Fanpage ngay bây giờ?');
    if (!confirmed) return;

    try {
      setIsPosting((prev) => ({ ...prev, [item.id]: true }));
      await api.post(`image/${item.id}/post-to-fb`);
      ztteam_showToast('Đã đăng bài lên Fanpage thành công', 'success');
      ztteam_loadItems();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi đăng bài', 'error');
    } finally {
      setIsPosting((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  /** Đưa bài viết vào hàng đợi tạo Video Reel qua Muse Worker */
  const ztteam_queueVideoReel = async (itemOrId: any) => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    if (!id) return;
    try {
      const res = await api.post(`image/${id}/queue-video`);
      ztteam_showToast(res.data?.message || 'Đã đưa vào hàng đợi tạo Video Reel cho Worker', 'success');
      ztteam_loadItems(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi đưa vào hàng đợi tạo Reel', 'error');
    }
  };

  /** Lấy ảnh gốc từ website làm chuẩn để tạo Video Reel */
  const ztteam_useOriginalImage = async (itemOrId: any) => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    if (!id) return;
    try {
      const res = await api.post(`image/${id}/use-original-image`);
      ztteam_showToast(res.data?.message || 'Đã lấy ảnh gốc thành công và đưa vào hàng đợi tạo Video Reel', 'success');
      ztteam_loadItems(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi lấy ảnh gốc', 'error');
    }
  };

  /** Đặt lại toàn bộ bộ lọc */
  const ztteam_resetFilters = () => {
    setFilterStatus('');
    setFilterVideoStatus('');
    setFilterPage('');
    setSearchKeyword('');
    setDebouncedKeyword('');
    setCurrentPage(1);
  };

  /** Tính toán phân trang */
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = total > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endIndex = Math.min(currentPage * limit, total);

  /** Cấu hình Tabs trạng thái chuẩn UI Guidelines */
  const statusTabs = [
    { key: '', label: 'Tất cả bài viết', icon: 'photo_library', count: counts.total },
    { key: 'QUEUED', label: 'Đang chờ', icon: 'hourglass_empty', count: counts.queued },
    { key: 'RENDERING', label: 'Đang vẽ AI', icon: 'auto_awesome', count: counts.rendering },
    { key: 'COMPLETED', label: 'Sẵn sàng đăng', icon: 'schedule', count: counts.completed },
    { key: 'POSTED', label: 'Đã xuất bản', icon: 'check_circle', count: counts.posted },
    { key: 'FAILED', label: 'Lỗi Ảnh AI', icon: 'broken_image', count: counts.failed },
    { key: 'VIDEO_FAILED', label: 'Lỗi Video Render', icon: 'videocam_off', count: counts.videoFailed || 0 },
  ];

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/** Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-3xl">auto_awesome</span>
            AI Factory
          </h2>
          <p className="text-sm font-medium text-fb-text-muted mt-1">
            Quản lý và giám sát hàng đợi bài viết & ảnh 2K AI tự động xuất bản lên Fanpage Facebook.
          </p>
        </div>

        {/** Tổng quan nhanh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-fb-surface-hover/60 rounded-xl text-cyan-400 text-xs font-bold shrink-0 shadow-md">
            <span className="material-symbols-outlined text-base">inventory_2</span>
            <span>Tổng số: {counts.total} bài viết</span>
          </div>
        </div>
      </div>

      {/** Hàng Tab Cấp 1: Phân Loại Nguồn Bài (Xuất Bản Fanpage vs Kho Đăng Thủ Công) */}
      <div className="flex items-center gap-2.5 border-b border-fb-surface-hover/60 pb-3">
        <button
          type="button"
          onClick={() => {
            setFilterPage('');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            filterPage !== 'MANUAL'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-fb-text-muted hover:text-fb-text hover:bg-fb-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">dynamic_feed</span>
          <span>⚡ Xuất Bản Fanpage</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              filterPage !== 'MANUAL' ? 'bg-white/20 text-white' : 'bg-fb-surface-hover text-fb-text-muted'
            }`}
          >
            {Math.max(0, (counts.total || 0) - (counts.manual || 0))}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterPage('MANUAL');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            filterPage === 'MANUAL'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
              : 'text-fb-text-muted hover:text-fb-text hover:bg-fb-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">edit_document</span>
          <span>✍️ Kho Đăng Thủ Công</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              filterPage === 'MANUAL' ? 'bg-white/20 text-white' : 'bg-fb-surface-hover text-emerald-400'
            }`}
          >
            {counts.manual || 0}
          </span>
        </button>
      </div>

      {/** Tabs Trạng Thái Chuẩn UI Guidelines (Dùng shadow, không border nổi bật, không màu hồng/tím) */}
      <div className="bg-fb-surface rounded-2xl p-2 shadow-lg">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {statusTabs.map((tab) => {
            const isActive = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setFilterStatus(tab.key);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-fb-blue text-white shadow-md shadow-blue-500/20'
                    : 'text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-fb-surface-hover text-fb-text-muted'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/** Thanh Công Cụ Bộ Lọc & Tìm Kiếm */}
      <div className="bg-fb-surface rounded-2xl p-4 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/** Ô Tìm Kiếm Từ Khóa */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-fb-text-muted text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm theo tiêu đề, nội dung bài viết..."
              className="w-full bg-fb-surface-hover text-fb-text text-xs font-medium pl-9 pr-8 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-fb-blue shadow-inner"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fb-text-muted hover:text-fb-text"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/** Dropdown Chọn Fanpage (Chỉ hiển thị khi đang ở Tab Xuất Bản Fanpage) */}
          {filterPage !== 'MANUAL' && (
            <div className="flex items-center gap-2 min-w-[200px]">
              <CustomDropdown
                value={filterPage}
                onChange={(val) => {
                  setFilterPage(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: '', label: 'Tất cả Fanpage' },
                  ...pages.map((p: any) => ({
                    value: p.id,
                    label: ztteam_decodeHtmlEntity(p.name),
                  })),
                ]}
                className="w-full"
              />
            </div>
          )}

          {/** Dropdown Lọc Trạng Thái Video */}
          <div className="flex items-center gap-2 min-w-[190px]">
            <CustomDropdown
              value={filterVideoStatus}
              onChange={(val) => {
                setFilterVideoStatus(String(val));
                setCurrentPage(1);
              }}
              options={[
                { value: '', label: 'Tất cả trạng thái Video' },
                { value: 'FAILED', label: '⚠️ Lỗi Video Render' },
                { value: 'PENDING', label: '⏳ Đang tạo Video' },
                { value: 'COMPLETED', label: '🎬 Đã có Video Reel' },
                { value: 'NONE', label: '🚫 Chưa tạo Video' },
              ]}
              className="w-full"
            />
          </div>

          {/** Chọn Số Bài Mỗi Trang */}
          <div className="flex items-center gap-2 min-w-[130px]">
            <CustomDropdown
              value={limit}
              onChange={(val) => {
                setLimit(Number(val));
                setCurrentPage(1);
              }}
              options={[
                { value: 12, label: '12 bài/trang' },
                { value: 24, label: '24 bài/trang' },
                { value: 48, label: '48 bài/trang' },
              ]}
              className="w-full"
            />
          </div>

          {/** Nút Đặt Lại (Hiển thị khi đang lọc) */}
          {(filterStatus || filterVideoStatus || filterPage || searchKeyword) && (
            <button
              type="button"
              onClick={ztteam_resetFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all shadow-sm cursor-pointer"
              title="Đặt lại toàn bộ bộ lọc"
            >
              <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
              <span>Đặt lại</span>
            </button>
          )}
        </div>

        {/** Nút Làm Mới */}
        <div className="flex items-center gap-3 shrink-0 self-end lg:self-auto">
          <button
            type="button"
            onClick={() => ztteam_loadItems()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Làm Mới</span>
          </button>
        </div>
      </div>

      {/** Lưới Bài Viết */}
      <div className="bg-fb-surface rounded-2xl p-6 shadow-lg min-h-[420px] flex flex-col justify-between">
        <div>
          {isLoading ? (
            <div className="py-28 text-center text-fb-text-muted flex flex-col items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">refresh</span>
              <span className="text-sm font-bold text-fb-text">Đang tải danh sách bài viết...</span>
            </div>
          ) : !items || items.length === 0 ? (
            <div className="py-24 text-center text-fb-text-muted flex flex-col items-center justify-center bg-fb-surface-hover/20 rounded-2xl shadow-inner">
              <span className="material-symbols-outlined text-5xl mb-3 text-fb-text-muted/40">
                photo_library
              </span>
              <p className="text-base font-bold text-fb-text">
                Không tìm thấy bài viết nào phù hợp
              </p>
              <p className="text-xs text-fb-text-muted mt-1 max-w-md">
                {filterStatus || filterPage || searchKeyword
                  ? 'Hãy thử thay đổi điều kiện lọc hoặc từ khóa tìm kiếm để xem các bài viết khác.'
                  : 'Các bài viết mới sau khi cào và tạo ảnh 2K sẽ tự động xuất hiện tại đây.'}
              </p>
              {(filterStatus || filterPage || searchKeyword) && (
                <button
                  type="button"
                  onClick={ztteam_resetFilters}
                  className="mt-4 px-4 py-2 bg-fb-blue text-white rounded-xl text-xs font-bold shadow-md hover:bg-fb-blue-hover transition-all"
                >
                  Xóa bộ lọc để xem tất cả
                </button>
              )}
            </div>
          ) : (
            /** Facebook Feed Post Card Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {items.map((item) => (
                <ZTTeamAIPostCard
                  key={item.id}
                  item={item}
                  isPosting={isPosting[item.id] || false}
                  onPostNow={ztteam_postToFB}
                  onRetry={ztteam_retryItem}
                  onDelete={ztteam_deleteItem}
                  onQueueVideo={ztteam_queueVideoReel}
                  onUseOriginalImage={ztteam_useOriginalImage}
                  onMarkPosted={() => ztteam_loadItems(true)}
                />
              ))}
            </div>
          )}
        </div>

        {/** Thanh Phân Trang Chuẩn UI Guidelines */}
        {!isLoading && total > 0 && (
          <div className="mt-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-fb-text-muted font-medium">
              Đang xem <strong className="text-fb-text">{startIndex}</strong> -{' '}
              <strong className="text-fb-text">{endIndex}</strong> trên tổng số{' '}
              <strong className="text-cyan-400 font-bold">{total}</strong> bài viết
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 shadow-sm bg-fb-surface-hover/40 p-1 rounded-xl">
                {/** Nút Trang Trước */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    currentPage === 1
                      ? 'text-fb-text-muted/30 cursor-not-allowed'
                      : 'text-fb-text hover:bg-fb-surface shadow-xs cursor-pointer'
                  }`}
                  title="Trang trước"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>

                {/** Danh sách số trang */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => {
                    const prevP = arr[idx - 1];
                    const showEllipsis = prevP && p - prevP > 1;

                    return (
                      <div key={p} className="flex items-center">
                        {showEllipsis && (
                          <span className="px-1 text-xs text-fb-text-muted">...</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            currentPage === p
                              ? 'bg-fb-blue text-white shadow-md shadow-blue-500/20'
                              : 'text-fb-text-muted hover:text-fb-text hover:bg-fb-surface'
                          }`}
                        >
                          {p}
                        </button>
                      </div>
                    );
                  })}

                {/** Nút Trang Kế Tiếp */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    currentPage === totalPages
                      ? 'text-fb-text-muted/30 cursor-not-allowed'
                      : 'text-fb-text hover:bg-fb-surface shadow-xs cursor-pointer'
                  }`}
                  title="Trang kế tiếp"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
