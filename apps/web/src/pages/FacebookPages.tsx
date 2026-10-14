import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import { useUIStore } from '../stores/uiStore';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { ztteam_decodeHtmlEntity } from '../utils/stringUtils';
import api from '../services/api';
import CustomDropdown from '../components/CustomDropdown';

/** Component FanpageCard chuẩn Grid Card tích hợp 3 biểu đồ xu hướng sparkline mini */
function FanpageCard({ page, isExpired, testingPageId, handleTestPost, handleToggleActive }: any) {
  const navigate = useNavigate();
  const { ztteam_getPageReport, ztteam_deletePage } = useZTTeamFacebookStore();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const [insights, setInsights] = useState<any>(null);

  const isCurrentlyActive = page.isActive !== false;

  const handleToggleActiveClick = async () => {
    const confirm = await ztteam_showConfirm(
      isCurrentlyActive ? 'Tắt Fanpage' : 'Bật lại Fanpage',
      isCurrentlyActive
        ? `Bạn có chắc muốn tắt Fanpage "${page.name}"? Fanpage sẽ được chuyển sang Tab "Fanpage Đã Tắt" và ẩn khỏi menu sidebar, thống kê & 100% quy trình tự động.`
        : `Bạn muốn bật lại Fanpage "${page.name}"? Fanpage sẽ khôi phục về Tab "Fanpage Đang Hoạt Động" và xuất hiện lại trên menu & thống kê.`
    );
    if (confirm && handleToggleActive) {
      handleToggleActive(page.id, !isCurrentlyActive);
    }
  };

  useEffect(() => {
    if (!isExpired) {
      ztteam_getPageReport(page.id).then(data => setInsights(data));
    }
  }, [page.id, isExpired]);

  /** Xử lý dữ liệu chuỗi 28 ngày cho 3 mini sparklines */
  let viewsChartData: any[] = [];
  let followsChartData: any[] = [];
  let engChartData: any[] = [];

  if (insights && Array.isArray(insights)) {
    const viewMetric = insights.find((m: any) => m.name === 'page_media_view');
    if (viewMetric?.values) {
      viewsChartData = viewMetric.values.map((v: any) => ({ value: v.value || 0 }));
    }
    const followMetric = insights.find((m: any) => m.name === 'page_daily_follows');
    if (followMetric?.values) {
      followsChartData = followMetric.values.map((v: any) => ({ value: v.value || 0 }));
    }
    const engMetric = insights.find((m: any) => m.name === 'page_post_engagements');
    if (engMetric?.values) {
      engChartData = engMetric.values.map((v: any) => ({ value: v.value || 0 }));
    }
  }

  const handleDeletePage = async () => {
    const confirm = await ztteam_showConfirm(
      'Xóa Fanpage',
      `Bạn có chắc muốn xóa Fanpage "${page.name}"? Tất cả bài đã đăng sẽ bị xóa. Các bài chưa đăng sẽ được tự động chia đều cho các Fanpage còn lại.`
    );
    if (confirm) {
      try {
        const result = await ztteam_deletePage(page.id);
        ztteam_showToast(result?.message || `Đã xóa Fanpage ${page.name} thành công`, 'success');
      } catch (error: any) {
        ztteam_showToast(error.message, 'error');
      }
    }
  };

  /** ZTTeam: Kiểm tra trạng thái cấu hình đầy đủ hay còn thiếu */
  const missingConfigs: string[] = [];
  const sourcesCount = page.sourcesCount ?? 0;
  const pendingImages = page.pendingImagesCount ?? 0;
  const pendingReels = page.pendingReelsCount ?? 0;
  const totalPending = page.totalPendingCount ?? (pendingImages + pendingReels);
  const fixedTimes = page.scheduleFixedTimes || [];

  if (sourcesCount === 0) {
    missingConfigs.push('Chưa có nguồn cào');
  }
  if (page.scheduleMode === 'fixed' && fixedTimes.length === 0) {
    missingConfigs.push('Chưa cài khung giờ');
  }
  if (page.autoPublishEnabled === false) {
    missingConfigs.push('Đang tắt tự động đăng');
  }
  if (totalPending === 0) {
    missingConfigs.push('Hàng đợi rỗng (0 bài)');
  }
  const isConfigComplete = missingConfigs.length === 0;

  /** ZTTeam: Định dạng nhãn hiển thị định dạng đăng */
  const postFormatLabel =
    page.postFormat === 'reel' ? 'Video Reel' :
      page.postFormat === 'mixed' ? 'Ảnh 2K & Reel' : 'Bài viết Ảnh 2K';

  /** ZTTeam: Định dạng nhãn hiển thị lịch đăng */
  const scheduleLabel =
    page.scheduleMode === 'immediate'
      ? `Cách quãng ${page.scheduleImmediateGapMinutes || 60}p`
      : `${fixedTimes.length} khung giờ/ngày`;

  /** ZTTeam: Format thời gian đăng tiếp theo */
  const ztteam_formatNextPublish = (dateStr?: string | null) => {
    if (!dateStr) return 'Đang chờ khung giờ';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      return isToday ? `${timeStr} (Hôm nay)` : `${timeStr} (${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`;
    } catch {
      return dateStr;
    }
  };

  const postUrl = `https://facebook.com/${page.fb_page_id || page.id}`;

  return (
    <div className="bg-fb-surface-hover/30 rounded-2xl overflow-hidden transition-all duration-300 shadow-lg hover:shadow-2xl group flex flex-col justify-between">
      {/** 1. Header Card Section: Nền đồng màu với Footer (bg-fb-surface-hover/70) */}
      <div className="p-4 bg-fb-surface-hover/70 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {page.avatar ? (
            <img
              src={page.avatar}
              alt={page.name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.fallback) {
                  target.dataset.fallback = 'true';
                  target.src = `https://graph.facebook.com/${page.fb_page_id || page.id}/picture?type=large`;
                }
              }}
              className="w-11 h-11 rounded-2xl object-cover bg-slate-900 shadow-md shrink-0 mt-0.5"
            />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-black flex items-center justify-center shadow-md shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-xl">pages</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base text-fb-text truncate leading-snug">{page.name}</p>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2 mt-1 text-[11px] font-medium text-fb-text-muted">
              <span className="truncate block">Nick: <b className="text-blue-400">{page.ownerName || 'Admin'}</b></span>
              <span className="hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1 text-slate-300 font-semibold truncate">
                <span className="material-symbols-outlined text-[13px] text-blue-400">group</span>
                {(page.followersCount ?? 0).toLocaleString()} <span className="text-[10px] text-fb-text-muted font-normal">sub</span>
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="text-fb-text-muted text-[10px] sm:text-[11px] truncate block">ID: {page.id}</span>
            </div>

            {/** Badges phân loại Doanh Nghiệp (BM), Meta App & Thời hạn Token */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span
                onClick={(e) => { e.stopPropagation(); navigate('/facebook/business-hub'); }}
                className="cursor-pointer px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 flex items-center gap-1 transition-colors"
                title="Bấm để mở Hub Quản Lý Doanh Nghiệp"
              >
                <span className="material-symbols-outlined text-[12px]">corporate_fare</span>
                <span className="truncate max-w-[120px]">{page.businessName || 'Doanh Nghiệp BM'}</span>
              </span>

              {page.appName && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">apps</span>
                  <span className="truncate max-w-[100px]">{page.appName}</span>
                </span>
              )}

              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${(page.tokenExpiry === 'NEVER' || page.accountType === 'SYSTEM_USER')
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-slate-700/50 text-slate-300 border-slate-600/40'
                }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>{(page.tokenExpiry === 'NEVER' || page.accountType === 'SYSTEM_USER') ? 'Vĩnh Viễn' : 'Token'}</span>
              </span>
            </div>
          </div>
        </div>

        {isExpired ? (
          <span className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded-full text-[10px] font-extrabold shrink-0 flex items-center gap-1 shadow-sm">
            <span className="material-symbols-outlined text-xs">error</span> Lỗi Token
          </span>
        ) : (
          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-extrabold shrink-0 flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span> Active
          </span>
        )}
      </div>

      {/** 2. Content Section: Nền khác biệt với Header & Footer (bg-fb-surface) */}
      <div className="p-4 space-y-3 flex-1 bg-fb-surface">
        {/** Badges Cấu hình Auto & Template */}
        <div className="flex flex-wrap items-center gap-2">
          {page.autoPublishEnabled !== false ? (
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-extrabold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">play_circle</span> ĐĂNG: BẬT
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-[10px] font-extrabold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">pause_circle</span> ĐĂNG: TẮT
            </span>
          )}

          {page.autoCreateEnabled ? (
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-extrabold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">videocam</span> TẠO: BẬT
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-[10px] font-extrabold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">videocam_off</span> TẠO: TẮT
            </span>
          )}
        </div>

        {/** ZTTeam: Khối Tóm Tắt & Đánh Giá Cấu Hình - Sử dụng Shadow & Elevation thay vì Border */}
        <div className="p-3 rounded-xl bg-slate-900/80 shadow-md shadow-black/40 flex flex-col gap-2.5 text-xs">
          {/** Tiêu đề & Badge Đầy đủ / Cần cấu hình (Shadow thay cho Border) */}
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <span className="text-[11px] font-bold text-fb-text uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-cyan-400">tune</span>
              Cấu hình hoạt động
            </span>
            {isConfigComplete ? (
              <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 shadow-sm shadow-emerald-500/25 rounded-full text-[10px] font-black flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-xs">check_circle</span> Đầy đủ
              </span>
            ) : (
              <span className="px-2.5 py-0.5 bg-amber-500/15 text-amber-400 shadow-sm shadow-amber-500/25 rounded-full text-[10px] font-black flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-xs">warning</span> Cần cấu hình
              </span>
            )}
          </div>

          {/** Lưới 2 Cột x 2 Hàng thông số - Mỗi ô có shadow nhẹ làm nổi bật */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {/** 1. Nguồn cào */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">language</span>
              <div className="truncate">
                <span className="text-fb-text-muted">Nguồn: </span>
                {sourcesCount > 0 ? (
                  <strong className="text-emerald-400 font-semibold">{sourcesCount} web</strong>
                ) : (
                  <strong className="text-amber-400 font-semibold">Chưa có</strong>
                )}
              </div>
            </div>

            {/** 2. Định dạng đăng */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">
                {page.postFormat === 'reel' ? 'movie' : page.postFormat === 'mixed' ? 'auto_awesome_motion' : 'photo_library'}
              </span>
              <div className="truncate">
                <span className="text-fb-text-muted">Dạng: </span>
                <strong className="text-fb-text font-semibold">{postFormatLabel}</strong>
              </div>
            </div>

            {/** 3. Lịch đăng */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">schedule</span>
              <div className="truncate">
                <span className="text-fb-text-muted">Lịch: </span>
                <strong className={`font-semibold ${fixedTimes.length > 0 || page.scheduleMode === 'immediate' ? 'text-fb-text' : 'text-amber-400'}`}>
                  {scheduleLabel}
                </strong>
              </div>
            </div>

            {/** 4. Hàng đợi bài chờ */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">hourglass_top</span>
              <div className="truncate">
                <span className="text-fb-text-muted">Hàng đợi: </span>
                {totalPending > 0 ? (
                  <strong className="text-emerald-400 font-semibold">{totalPending} bài chờ</strong>
                ) : (
                  <strong className="text-amber-400 font-semibold">0 bài chờ</strong>
                )}
              </div>
            </div>
          </div>

          {/** Dòng Đăng tiếp theo & Khung giờ chi tiết */}
          <div className="pt-2 flex flex-col gap-1.5 text-[10px]">
            <div className="flex items-center justify-between gap-1 bg-slate-800/30 px-2 py-1.5 rounded-lg shadow-sm shadow-black/20">
              <span className="text-fb-text-muted flex items-center gap-1">
                <span className="material-symbols-outlined text-xs text-emerald-400">timer</span>
                Đăng tiếp theo:
              </span>
              <span className="font-bold text-emerald-400">
                {ztteam_formatNextPublish(page.nextPublishTime)}
              </span>
            </div>
            {page.scheduleMode === 'fixed' && fixedTimes.length > 0 && (
              <div className="flex items-center gap-1 overflow-hidden text-slate-400 px-1">
                <span className="shrink-0 text-[10px] text-fb-text-muted">Khung giờ:</span>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {fixedTimes.map((t: string, idx: number) => (
                    <span key={idx} className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] font-mono shrink-0 shadow-sm shadow-black/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/** Cảnh báo nếu chưa hoàn thiện cấu hình */}
          {!isConfigComplete && (
            <div className="mt-0.5 p-2 bg-amber-500/10 text-amber-300 rounded-lg text-[10px] flex items-start gap-1.5 shadow-sm shadow-amber-500/10">
              <span className="material-symbols-outlined text-xs shrink-0 mt-0.5 text-amber-400">info</span>
              <span className="truncate">
                Cần: <strong className="font-semibold">{missingConfigs.join(' • ')}</strong>
              </span>
            </div>
          )}
        </div>

        {/** Khối Biểu Đồ Sparkline Xu Hướng (3 Mini Charts: Lượt xem, Theo dõi, Tương tác) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {/** Mini Chart 1: Lượt Xem */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Lượt xem
            </span>
            <div className="h-9 w-full">
              {viewsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={viewsChartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-views-${page.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={1.5} fillOpacity={1} fill={`url(#grad-views-${page.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[9px] text-fb-text-muted italic">---</div>
              )}
            </div>
          </div>

          {/** Mini Chart 2: Theo Dõi */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Theo dõi
            </span>
            <div className="h-9 w-full">
              {followsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={followsChartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-follows-${page.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={1.5} fillOpacity={1} fill={`url(#grad-follows-${page.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[9px] text-fb-text-muted italic">---</div>
              )}
            </div>
          </div>

          {/** Mini Chart 3: Tương Tác */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Tương tác
            </span>
            <div className="h-9 w-full">
              {engChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={engChartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-eng-${page.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={1.5} fillOpacity={1} fill={`url(#grad-eng-${page.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[9px] text-fb-text-muted italic">---</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/** 3. Footer Action Bar Section: Nền đồng màu với Header (bg-fb-surface-hover/70) */}
      <div className="p-4 bg-fb-surface-hover/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate(`/facebook/pages/${page.id}/report`)}
            className="w-8 h-8 sm:w-auto sm:h-9 px-0 sm:px-3.5 bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500 hover:text-white rounded-full font-bold text-xs flex items-center justify-center gap-0 sm:gap-1.5 transition-all shadow-sm shrink-0 aspect-square sm:aspect-auto"
            title="Báo cáo Fanpage"
          >
            <span className="material-symbols-outlined text-base sm:text-sm">query_stats</span>
            <span className="hidden sm:inline">Báo cáo</span>
          </button>
          <button
            onClick={() => navigate(`/facebook/pages/${page.id}/settings`)}
            className="w-8 h-8 sm:w-auto sm:h-9 px-0 sm:px-3.5 bg-blue-500/15 text-blue-400 hover:bg-blue-500 hover:text-white rounded-full font-bold text-xs flex items-center justify-center gap-0 sm:gap-1.5 transition-all shadow-sm shrink-0 aspect-square sm:aspect-auto"
            title="Cài đặt Fanpage"
          >
            <span className="material-symbols-outlined text-base sm:text-sm">settings</span>
            <span className="hidden sm:inline">Cài đặt</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/** Tạm ẩn nút Test đăng bài theo yêu cầu */}
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center text-fb-text-muted bg-fb-surface-hover hover:bg-fb-surface-hover/80 hover:text-white rounded-full transition-all shadow-sm"
            title="Xem Fanpage trên Facebook"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
          </a>

          <button
            onClick={handleToggleActiveClick}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-sm ${isCurrentlyActive
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500 hover:text-white'
              : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white'
              }`}
            title={isCurrentlyActive ? 'Tắt Fanpage' : 'Bật lại Fanpage'}
          >
            <span className="material-symbols-outlined text-sm">power_settings_new</span>
          </button>

          <button
            onClick={handleDeletePage}
            className="w-8 h-8 flex items-center justify-center text-red-400 bg-red-500/15 hover:bg-red-500 hover:text-white rounded-full transition-all shadow-sm"
            title="Xóa Fanpage"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FacebookPages() {
  const {
    isConnected,
    pages,
    accounts = [],
    isLoading,
    error,
    ztteam_checkLoginStatus,
    ztteam_loginWithFacebook,
    ztteam_fetchPages,
    ztteam_fetchPagesFromDB,
    ztteam_fetchAccounts,
    ztteam_deleteAccount,
    ztteam_testPost
  } = useZTTeamFacebookStore();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const navigate = useNavigate();

  const [testingPageId, setTestingPageId] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState<'active' | 'deactivated'>('active');
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);

  /** Lọc dữ liệu */
  const [filterOwner, setFilterOwner] = useState('');
  const [filterBusiness, setFilterBusiness] = useState('');
  const [filterTag, setFilterTag] = useState('');

  const uniqueOwners = Array.from(new Set(pages.map(p => p.ownerName).filter(Boolean)));
  const uniqueBusinesses = Array.from(new Set(pages.map(p => p.businessName).filter(Boolean)));
  const uniqueTags = Array.from(new Set(pages.flatMap(p => p.tags || [])));

  const filteredPages = pages.filter(p => {
    let match = true;
    if (filterOwner && p.ownerName !== filterOwner) match = false;
    if (filterBusiness && p.businessName !== filterBusiness) match = false;
    if (filterTag && (!p.tags || !p.tags.includes(filterTag))) match = false;
    return match;
  });

  const activePages = filteredPages.filter(p => p.isActive !== false);
  const deactivatedPages = filteredPages.filter(p => p.isActive === false);
  const currentTabPages = pageTab === 'active' ? activePages : deactivatedPages;

  useEffect(() => {
    const handleSDKLoad = () => {
      ztteam_checkLoginStatus();
    };

    if (window.FB) {
      ztteam_checkLoginStatus();
    } else {
      window.addEventListener('fbSDKLoaded', handleSDKLoad);
      return () => window.removeEventListener('fbSDKLoaded', handleSDKLoad);
    }
  }, []);

  useEffect(() => {
    ztteam_fetchPagesFromDB();
    ztteam_fetchAccounts();
  }, []);

  const handleTestPost = async (pageId: string) => {
    if (testingPageId) return;
    setTestingPageId(pageId);
    try {
      await ztteam_testPost(pageId, "Bài đăng thử nghiệm hệ thống AutoContent AI");
      ztteam_showToast("Đăng bài thành công!", 'success');
    } catch (error: any) {
      ztteam_showToast(error.message || "Lỗi khi đăng bài", 'error');
    } finally {
      setTestingPageId(null);
    }
  };

  const handleCheckHealth = async () => {
    try {
      setIsCheckingHealth(true);
      const res = await api.post('/facebook/accounts/check-health');
      if (res.data?.success) {
        ztteam_showToast('Đã kiểm tra xong sức khỏe Token Nick FB & Fanpage!', 'success');
        await ztteam_fetchPagesFromDB();
        await ztteam_fetchAccounts();
      }
    } catch (e: any) {
      ztteam_showToast('Lỗi kiểm tra Token Nick FB', 'error');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleTogglePageActive = async (pageId: string, isActive: boolean) => {
    try {
      const res = await api.put(`/facebook/pages/${pageId}/toggle-active`, { isActive });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || 'Cập nhật trạng thái Fanpage thành công', 'success');
        await ztteam_fetchPagesFromDB();
      }
    } catch (e: any) {
      ztteam_showToast(e.response?.data?.message || 'Có lỗi xảy ra', 'error');
    }
  };

  const handleDeleteAccount = async (accountId: string, accountName: string) => {
    const confirm = await ztteam_showConfirm(
      'Xóa Nick Facebook',
      `Bạn có chắc chắn muốn xóa Nick Facebook "${accountName}" khỏi hệ thống?`
    );
    if (!confirm) return;

    try {
      await ztteam_deleteAccount(accountId);
      ztteam_showToast(`Đã xóa Nick Facebook ${accountName} thành công`, 'success');
    } catch (e: any) {
      ztteam_showToast(e.message || 'Lỗi khi xóa Nick Facebook', 'error');
    }
  };

  const expiredPagesCount = pages.filter(p => p.status === 'expired').length;
  const totalFollowers = activePages.reduce((acc, p) => acc + (p.followersCount || 0), 0);
  const formattedFollowers = totalFollowers > 1000000 ? (totalFollowers / 1000000).toFixed(1) + 'M' :
    totalFollowers > 1000 ? (totalFollowers / 1000).toFixed(1) + 'k' : totalFollowers;

  return (
    <div className="w-full space-y-6">

      {/* Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Quản Lý Fanpage</h2>
          <p className="text-sm font-medium text-fb-text-muted mt-1">Theo dõi trạng thái, cấu hình tự động đăng bài &amp; tạo Reels AI.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
          {/** Hàng 1 trên Mobile: 2 nút Quản lý nick & Quét lỗi */}
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
            <button
              onClick={() => {
                ztteam_fetchAccounts();
                setIsAccountsModalOpen(true);
              }}
              className="px-3.5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors w-full"
            >
              <span className="material-symbols-outlined text-base">manage_accounts</span>
              <span className="truncate">Quản Lý Nick ({accounts.length})</span>
            </button>

            <button
              onClick={handleCheckHealth}
              disabled={isCheckingHealth}
              className="px-3.5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 w-full"
            >
              <span className={`material-symbols-outlined text-base text-emerald-400 ${isCheckingHealth ? 'animate-spin' : ''}`}>health_and_safety</span>
              <span className="truncate">Quét Lỗi Token</span>
            </button>

            <button
              onClick={() => navigate('/facebook/business-hub')}
              className="px-3.5 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors border border-blue-500/30 col-span-2 sm:col-span-1"
              title="Mở Quản Lý Doanh Nghiệp (BM) & Token Vĩnh Viễn"
            >
              <span className="material-symbols-outlined text-base">domain</span>
              <span className="truncate">Quản Lý BM &amp; App</span>
            </button>
          </div>

          {/** Hàng 2 trên Mobile: Nút Kết nối thêm */}
          <button
            onClick={ztteam_loginWithFacebook}
            disabled={isLoading}
            className="w-full sm:w-auto justify-center bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-90 text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            {isLoading ? (
              <span className="material-symbols-outlined text-lg animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-lg [font-variation-settings:'FILL'_1]">qr_code_2</span>
            )}
            <span>{isConnected ? 'Kết Nối Thêm FB' : 'Kết Nối Facebook'}</span>
          </button>
        </div>
      </div>

      {/* Early Warning Banner */}
      {expiredPagesCount > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">error</span>
            </div>
            <div>
              <p className="font-extrabold text-sm text-red-400"><span className="material-symbols-outlined text-[18px] text-rose-400 align-middle mr-1">warning</span>CẢNH BÁO: Phát hiện {expiredPagesCount} Fanpage / Nick Facebook bị lỗi Token!</p>
              <p className="text-xs text-red-300 mt-0.5">Token hết hạn hoặc Nick bị checkpoint. Vui lòng "Quét Lỗi Token" &amp; Kết nối lại ngay để không làm gián đoạn tự động hóa.</p>
            </div>
          </div>
          <button
            onClick={handleCheckHealth}
            disabled={isCheckingHealth}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-xs shrink-0 flex items-center gap-1.5 transition-colors shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${isCheckingHealth ? 'animate-spin' : ''}`}>sync</span>
            Xử Lý Lỗi
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500 [font-variation-settings:'FILL'_1]">warning</span>
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Summary Cards Grid (2 cột trên Mobile, 4 cột trên Desktop) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/** Card 1: Tổng Fanpage */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-blue-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-blue-400 uppercase tracking-wider">Tổng Fanpage</p>
              <h3 className="text-2xl sm:text-3xl font-black text-fb-text mt-1 group-hover:text-blue-300 transition-colors">
                {pages.length}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-fb-blue text-white rounded-xl shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">pages</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Đã kết nối: <b className="text-blue-400 font-bold">{pages.length} page</b></span>
            <span className="text-blue-400 font-bold hidden sm:inline">System</span>
          </div>
        </div>

        {/** Card 2: Đang Hoạt Động */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-emerald-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-emerald-400 uppercase tracking-wider">Đang Hoạt Động</p>
              <h3 className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 group-hover:text-emerald-300 transition-colors">
                {activePages.length}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">check_circle</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Active: <b className="text-emerald-300 font-bold">{pages.length > 0 ? Math.round((activePages.length / pages.length) * 100) : 0}%</b></span>
            <span className="text-emerald-400 font-bold hidden sm:inline">Auto Ready</span>
          </div>
        </div>

        {/** Card 3: Token Hết Hạn */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-red-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-red-400 uppercase tracking-wider">Token Hết Hạn</p>
              <h3 className={`text-2xl sm:text-3xl font-black mt-1 transition-colors ${expiredPagesCount > 0 ? 'text-red-400 group-hover:text-red-300' : 'text-fb-text'}`}>
                {expiredPagesCount}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-xl shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">warning</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Trạng thái: <b className={expiredPagesCount > 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{expiredPagesCount > 0 ? 'Cần gia hạn' : 'An toàn'}</b></span>
            <span className="text-red-400 font-bold hidden sm:inline">Token Check</span>
          </div>
        </div>

        {/** Card 4: Tổng Follower Active */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-amber-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-wider">Tổng Follower</p>
              <h3 className="text-2xl sm:text-3xl font-black text-amber-400 mt-1 group-hover:text-amber-300 transition-colors">
                {formattedFollowers}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">groups</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Followers: <b className="text-amber-300 font-bold">{formattedFollowers}</b></span>
            <span className="text-amber-400 font-bold hidden sm:inline">Audience</span>
          </div>
        </div>
      </div>

      {/* Filter Bar & Table Container */}
      <div className="bg-fb-surface rounded-2xl shadow-lg overflow-hidden border border-white/5">

        {/* Filter Tabs (Cân đối đầy đặn trên Mobile) */}
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 border-b border-fb-surface-hover/50">
          <div className="flex items-center gap-1.5 bg-fb-surface-hover p-1 rounded-full w-full sm:w-auto">
            <button
              onClick={() => setPageTab('active')}
              className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-1.5 rounded-full text-xs text-center transition-colors ${pageTab === 'active'
                ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20'
                : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              Đang Hoạt Động ({activePages.length})
            </button>
            <button
              onClick={() => setPageTab('deactivated')}
              className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-1.5 rounded-full text-xs text-center transition-colors ${pageTab === 'deactivated'
                ? 'bg-amber-500/20 text-amber-400 font-bold shadow-md'
                : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              Đã Tắt ({deactivatedPages.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {uniqueBusinesses.length > 0 && (
              <CustomDropdown
                value={filterBusiness}
                onChange={(val) => setFilterBusiness(val)}
                options={[
                  { value: '', label: 'Tất cả Doanh Nghiệp (BM)' },
                  ...uniqueBusinesses.map((bName: any) => ({ value: bName, label: bName }))
                ]}
                className="flex-1 sm:w-48"
              />
            )}
            {uniqueOwners.length > 0 && (
              <CustomDropdown
                value={filterOwner}
                onChange={(val) => setFilterOwner(val)}
                options={[
                  { value: '', label: 'Tất cả Nick' },
                  ...uniqueOwners.map((owner: any) => ({ value: owner, label: owner }))
                ]}
                className="flex-1 sm:w-40"
              />
            )}
            <button onClick={() => ztteam_fetchPagesFromDB()} disabled={isLoading} className="px-3 py-2 rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-fb-text text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shrink-0">
              <span className={`material-symbols-outlined text-base shrink-0 ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
            </button>
          </div>
        </div>

        {/** Bố cục Grid Card đa cột (Desktop & Mobile) */}
        <div className="p-4 sm:p-5">
          {currentTabPages.length === 0 ? (
            <div className="py-16 text-center text-fb-text-muted">
              <span className="material-symbols-outlined text-5xl mb-2 opacity-40">inbox</span>
              <p className="font-bold text-base text-fb-text">Không có Fanpage nào</p>
              <p className="text-xs text-fb-text-muted mt-1">Fanpage được kết nối sẽ hiển thị tại đây.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {currentTabPages.map(page => (
                <FanpageCard
                  key={page.id}
                  page={page}
                  isExpired={page.status === 'expired'}
                  testingPageId={testingPageId}
                  handleTestPost={handleTestPost}
                  handleToggleActive={handleTogglePageActive}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health Alerts Section */}
      {(expiredPagesCount > 0) && (
        <div className="mt-8 grid grid-cols-1 gap-5">
          <div className="p-5 bg-red-500/10 rounded-2xl flex gap-4 items-start">
            <div className="w-11 h-11 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400 shrink-0 shadow-md">
              <span className="material-symbols-outlined text-2xl">report</span>
            </div>
            <div>
              <h4 className="font-extrabold text-base text-fb-text">Cảnh báo Token hết hạn</h4>
              <p className="text-xs text-fb-text-muted mt-1">{expiredPagesCount} Fanpage của bạn cần được kết nối lại để tiếp tục quy trình tự động hóa Reels.</p>
              <button onClick={ztteam_loginWithFacebook} className="mt-3 text-red-400 hover:text-red-300 font-bold text-xs flex items-center gap-1">
                <span>Gia hạn tất cả ngay</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/** ACCOUNTS MANAGEMENT MODAL: Quản Lý Danh Sách Nick Facebook */}
      {isAccountsModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-fb-surface w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] flex flex-col">
            {/** Header Modal */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-2xl">account_circle</span>
                </div>
                <div>
                  <h4 className="text-lg font-black text-fb-text tracking-tight">Quản Lý Danh Sách Nick FB</h4>
                  <p className="text-xs text-fb-text-muted mt-0.5">Xem và hủy kết nối các tài khoản Facebook cá nhân đã liên kết</p>
                </div>
              </div>
              <button
                onClick={() => setIsAccountsModalOpen(false)}
                className="w-9 h-9 rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-white hover:bg-fb-surface-hover/80 flex items-center justify-center p-0 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/** Content List */}
            <div className="overflow-y-auto space-y-3 flex-1 pr-1 custom-scrollbar">
              {accounts.length === 0 ? (
                <div className="py-12 text-center text-fb-text-muted">
                  <span className="material-symbols-outlined text-5xl mb-2 opacity-40">person_off</span>
                  <p className="font-bold text-sm text-fb-text">Chưa có tài khoản Facebook nào kết nối</p>
                </div>
              ) : (
                accounts.map(acc => {
                  const isExpired = acc.status === 'expired';
                  return (
                    <div key={acc.id} className="p-4 rounded-2xl bg-fb-surface-hover/40 flex items-center justify-between gap-3 hover:bg-fb-surface-hover/80 transition-colors">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center shrink-0 font-black text-base shadow-md">
                          {acc.name ? acc.name[0].toUpperCase() : 'FB'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-sm text-fb-text truncate">{acc.name || 'Nick Facebook'}</p>
                          <div className="flex items-center gap-2 text-xs text-fb-text-muted mt-0.5 font-medium">
                            <span className="font-bold text-blue-400">
                              {acc.pagesCount > 0 ? `${acc.pagesCount} Fanpage` : '0 Fanpage (Rỗng)'}
                            </span>
                            <span>•</span>
                            <span>ID: {acc.fbUserId || acc.id.substring(0, 8)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {isExpired ? (
                          <span className="px-3 py-1 bg-red-500/15 text-red-400 rounded-full text-xs font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            Token Lỗi
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-emerald-500/15 text-emerald-400 rounded-full text-xs font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            Connected
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteAccount(acc.id, acc.name)}
                          className="px-3.5 py-1.5 bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white rounded-full font-bold text-xs flex items-center gap-1 transition-colors"
                          title="Xóa / Hủy kết nối Nick FB này"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          Xóa Nick
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/** Footer Modal */}
            <div className="pt-2 flex items-center justify-between text-xs text-fb-text-muted font-medium">
              <span>Tổng cộng: <b className="text-fb-text font-bold">{accounts.length} Nick FB</b></span>
              <button
                onClick={() => setIsAccountsModalOpen(false)}
                className="px-5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold rounded-full transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
