import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/** Component Skeleton Loading cho Overview Dashboard */
function ZTTeam_OverviewSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse">
      {/** Skeleton Header Banner */}
      <div className="bg-fb-surface rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-2 flex-1 w-full">
          <div className="h-6 sm:h-7 bg-fb-surface-hover/80 rounded-xl w-56 sm:w-64"></div>
          <div className="h-3.5 sm:h-4 bg-fb-surface-hover/50 rounded-lg w-full max-w-md"></div>
        </div>
        <div className="h-9 bg-fb-surface-hover/80 rounded-full w-48 shrink-0"></div>
      </div>

      {/** Skeleton 4 Stat Cards (2 cột trên mobile, 4 cột trên desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-fb-surface rounded-2xl p-3.5 sm:p-5 space-y-3 shadow-lg">
            <div className="flex justify-between items-start">
              <div className="space-y-2 flex-1">
                <div className="h-3 bg-fb-surface-hover/70 rounded w-16 sm:w-20"></div>
                <div className="h-6 sm:h-8 bg-fb-surface-hover rounded-xl w-20 sm:w-24"></div>
              </div>
              <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-fb-surface-hover/80 shrink-0"></div>
            </div>
            <div className="h-3 bg-fb-surface-hover/50 rounded w-full pt-1"></div>
          </div>
        ))}
      </div>

      {/** Skeleton Biểu Đồ */}
      <div className="bg-fb-surface rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-fb-surface-hover/80 rounded-xl"></div>
            <div className="space-y-1">
              <div className="h-4 bg-fb-surface-hover/80 rounded w-36 sm:w-44"></div>
              <div className="h-3 bg-fb-surface-hover/50 rounded w-48 sm:w-64"></div>
            </div>
          </div>
        </div>
        <div className="h-60 sm:h-72 w-full bg-fb-surface-hover/30 rounded-xl"></div>
      </div>

      {/** Skeleton Grid 2 cột dưới */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-fb-surface rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="h-5 bg-fb-surface-hover/80 rounded w-44"></div>
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="h-10 bg-fb-surface-hover/40 rounded-xl"></div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-4 bg-fb-surface rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="h-5 bg-fb-surface-hover/80 rounded w-36"></div>
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-11 bg-fb-surface-hover/40 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalPages: 0,
    totalCrawled: 0,
    totalReelsCreated: 0,
    totalReelsPublished: 0,
    successRate: 100,
    activities: [] as any[],
    health: {
      crawler: { status: 'Hoạt động', details: 'OK' },
      factory: { status: 'Đang xử lý', details: '0 luồng' },
      publisher: { status: 'Sẵn sàng', details: 'OK' }
    }
  });

  const [chartDataState, setChartDataState] = useState({
    overview: {
      totalMediaViews: 0,
      totalUniqueReach: 0,
      totalEngagements: 0,
      newFollowers: 0
    },
    chartData: [] as any[],
    leaderboard: [] as any[],
    details: [] as any[]
  });

  const [isLoading, setIsLoading] = useState(true);
  const [daysRange, setDaysRange] = useState(7);
  const [gaRealtime, setGaRealtime] = useState<any>(null);

  const ztteam_formatDate = (dateStr: string | Date) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const ztteam_formatNumber = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  useEffect(() => {
    const ztteam_fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const [statsRes, chartRes, gaRes] = await Promise.allSettled([
          api.get('dashboard/stats'),
          api.get(`dashboard/chart?days=${daysRange}`),
          api.get('analytics/realtime-all')
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value?.data) setStats(statsRes.value.data);
        if (chartRes.status === 'fulfilled' && chartRes.value?.data) setChartDataState(chartRes.value.data);
        if (gaRes.status === 'fulfilled' && gaRes.value?.data) setGaRealtime(gaRes.value.data);
      } catch (e) {
        console.error('Lỗi tải dữ liệu Dashboard:', e);
      } finally {
        setIsLoading(false);
      }
    };

    ztteam_fetchDashboardData();
  }, [daysRange]);

  const { overview, chartData, leaderboard } = chartDataState;

  if (isLoading) {
    return <ZTTeam_OverviewSkeleton />;
  }

  return (
    <div className="w-full space-y-6">
      {/** Header Banner: Tiêu đề & Chọn khung thời gian */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Tổng Quan</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-400 shadow-sm shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Realtime
            </span>
          </div>
          <p className="text-sm font-medium text-fb-text-muted mt-1">Theo dõi tự động hóa, hiệu suất video Reels &amp; tăng trưởng Fanpage realtime.</p>
        </div>

        <div className="w-full sm:w-auto">
          {/** Bộ lọc số ngày chuẩn thiết kế Button Switch với 3 cột chia đều cân đối 100% */}
          <div className="grid grid-cols-3 gap-1 bg-fb-surface-hover p-1.5 rounded-full text-xs font-bold w-full sm:w-64">
            <button
              onClick={() => setDaysRange(7)}
              className={`w-full py-1.5 px-3 rounded-full text-xs text-center transition-all ${daysRange === 7
                  ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20'
                  : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              7 Ngày
            </button>
            <button
              onClick={() => setDaysRange(14)}
              className={`w-full py-1.5 px-3 rounded-full text-xs text-center transition-all ${daysRange === 14
                  ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20'
                  : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              14 Ngày
            </button>
            <button
              onClick={() => setDaysRange(30)}
              className={`w-full py-1.5 px-3 rounded-full text-xs text-center transition-all ${daysRange === 30
                  ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20'
                  : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              30 Ngày
            </button>
          </div>
        </div>
      </div>

      {/** GA4 Realtime Multi-site Cards Section */}
      {gaRealtime?.configured && Array.isArray(gaRealtime?.sites) && gaRealtime.sites.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-emerald-400">insights</span>
              <h3 className="text-sm sm:text-base font-black text-fb-text">Độc Giả Trực Tuyến (Google Analytics 4)</h3>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
                {gaRealtime.totalActiveUsers} online
              </span>
            </div>
            <button
              onClick={() => navigate('/google-analytics')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-fb-blue/10 hover:bg-fb-blue/20 text-fb-blue text-xs font-bold transition-all cursor-pointer"
            >
              <span>Xem chi tiết GA4</span>
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gaRealtime.sites.map((site: any) => (
              <div
                key={site.id}
                onClick={() => navigate('/google-analytics')}
                className="bg-fb-surface rounded-2xl p-4 shadow-md hover:shadow-lg cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between gap-2 pb-2.5">
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-fb-text truncate group-hover:text-blue-400 transition-colors">{site.name}</h4>
                    <p className="text-[10px] text-fb-text-muted font-mono truncate">{site.domain}</p>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 font-mono font-black text-lg shrink-0 px-2.5 py-0.5 bg-emerald-500/10 rounded-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>{site.activeUsers}</span>
                  </div>
                </div>

                <div className="mt-2 space-y-1.5 text-xs">
                  {site.topArticles?.[0] ? (
                    <div className="flex items-start gap-1.5 text-[11px] text-slate-300 p-2 rounded-xl bg-fb-surface-hover/30">
                      <span className="material-symbols-outlined text-xs text-slate-500 shrink-0 mt-0.5">article</span>
                      <span className="line-clamp-1 flex-1 font-medium">{site.topArticles[0].title}</span>
                      <span className="font-mono text-emerald-400 font-bold shrink-0">+{site.topArticles[0].activeUsers}</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 italic p-1.5">Chưa có độc giả đọc bài</div>
                  )}

                  {site.topCountries?.[0] && (
                    <div className="flex items-center justify-between text-[10px] text-fb-text-muted px-1">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-cyan-400">public</span>
                        <span>{site.topCountries[0].country}</span>
                      </span>
                      <span className="font-mono text-cyan-400 font-bold">{site.topCountries[0].activeUsers} online</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/** 4 Stat Cards Thống Kê Động 100% (Chia 2 cột trên mobile, 4 cột trên desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

        {/** Card 1: Tổng Lượt Xem Video */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-emerald-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2 sm:mb-3">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-emerald-400 uppercase tracking-wider">Lượt Xem Video</p>
              <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-emerald-300 transition-colors">
                {isLoading ? '...' : ztteam_formatNumber(overview.totalMediaViews)}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg sm:text-2xl">visibility</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
            <span className="truncate">Tiếp cận: <b className="text-emerald-300 font-bold">{ztteam_formatNumber(overview.totalUniqueReach)}</b></span>
            <span className="text-emerald-400 font-bold hidden sm:inline">FB Insights</span>
          </div>
        </div>

        {/** Card 2: AI Reels Đã Đăng */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-blue-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2 sm:mb-3">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-blue-400 uppercase tracking-wider">Reels Đã Đăng</p>
              <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-blue-300 transition-colors">
                {isLoading ? '...' : ztteam_formatNumber(stats.totalReelsPublished)}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-fb-blue text-white rounded-xl shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg sm:text-2xl">post_add</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
            <span className="truncate">Thành công: <b className="text-blue-400 font-bold">{stats.successRate}%</b></span>
            <span className="text-blue-400 font-bold hidden sm:inline">Auto Posted</span>
          </div>
        </div>

        {/** Card 3: AI Reels Đã Tạo */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-cyan-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2 sm:mb-3">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-cyan-400 uppercase tracking-wider">AI Reels Đã Tạo</p>
              <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-cyan-300 transition-colors">
                {isLoading ? '...' : ztteam_formatNumber(stats.totalReelsCreated)}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-600 text-white rounded-xl shadow-lg shadow-cyan-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg sm:text-2xl">auto_awesome</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
            <span className="truncate">Crawl: <b className="text-cyan-300 font-bold">{ztteam_formatNumber(stats.totalCrawled)}</b></span>
            <span className="text-cyan-400 font-bold hidden sm:inline">AI Factory</span>
          </div>
        </div>

        {/** Card 4: Tổng Người Theo Dõi & Tăng Trưởng */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-amber-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2 sm:mb-3">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-wider">Người Theo Dõi</p>
              <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-amber-300 transition-colors">
                {isLoading ? '...' : ztteam_formatNumber((overview as any).totalFollowers || (stats as any).totalFollowers || 0)}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg sm:text-2xl">groups</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
            <span className="truncate">Tăng mới ({daysRange}d): <b className="text-amber-300 font-bold">+{ztteam_formatNumber(overview.newFollowers || 0)}</b></span>
            <span className="text-amber-400 font-bold hidden sm:inline">Followers</span>
          </div>
        </div>

      </div>

      {/** Biểu Đồ Xu Hướng Tăng Trưởng Thực Tế */}
      <div className="bg-fb-surface rounded-2xl p-5 shadow-lg space-y-4">
        {/** Header biểu đồ */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
              <span className="material-symbols-outlined text-xl">show_chart</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-fb-text">Biểu Đồ Tiến Độ Tự Động Hóa</h3>
              <p className="text-xs text-fb-text-muted">Theo dõi quy trình: Bài Crawl &rarr; AI Reel Đã Tạo &rarr; Bài Đăng Facebook</p>
            </div>
          </div>

          {/** Chú thích màu biểu đồ */}
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Crawl Bài
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Tạo AI Reel
            </span>
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span> Đã Đăng FB
            </span>
          </div>
        </div>

        {/** Content biểu đồ */}
        <div className="h-72 w-full pt-2">
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCrawled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradPublished" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="crawled" name="Bài Crawl" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#gradCrawled)" />
                <Area type="monotone" dataKey="created" name="Tạo AI Reel" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#gradCreated)" />
                <Area type="monotone" dataKey="published" name="Đã Đăng FB" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradPublished)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-fb-text-muted text-xs italic">
              Chưa có dữ liệu xu hướng trong khoảng thời gian này
            </div>
          )}
        </div>
      </div>

      {/** Hàng Dữ Liệu Kép: Bảng Xếp Hạng Fanpage & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/** Bảng Xếp Hạng Top Fanpage Hiệu Suất Cao (Leaderboard 8 cols) */}
        <div className="lg:col-span-8 bg-fb-surface rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          {/** Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <span className="material-symbols-outlined text-xl">leaderboard</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-fb-text">Top Fanpage tương tác tốt</h3>
                <p className="text-xs text-fb-text-muted">Xếp hạng theo Lượt xem &amp; Tương tác thực tế từ Facebook</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/facebook')}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>Xem tất cả ({stats.totalPages})</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/** Content: Table */}
          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full text-left text-xs min-w-[500px] sm:min-w-0">
              <thead className="text-fb-text-muted uppercase text-[9px] sm:text-[10px] font-black">
                <tr>
                  <th className="py-2 px-2 sm:px-3">Fanpage</th>
                  <th className="py-2 px-2 sm:px-3 text-center">Lượt Xem (Views)</th>
                  <th className="py-2 px-2 sm:px-3 text-center">Reels Đã Đăng</th>
                  <th className="py-2 px-2 sm:px-3 text-center">Tỉ Lệ Thành Công</th>
                  <th className="py-2 px-2 sm:px-3 text-right">Báo Cáo</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard && leaderboard.length > 0 ? (
                  leaderboard.slice(0, 5).map((item: any, i: number) => (
                    <tr key={item.pageId || i} className="hover:bg-fb-surface-hover/50 transition-colors rounded-xl">
                      <td className="py-2.5 px-2 sm:px-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center font-black text-[9px] sm:text-[10px] shrink-0 ${i === 0 ? 'bg-amber-400 text-slate-950' :
                              i === 1 ? 'bg-slate-300 text-slate-950' :
                                i === 2 ? 'bg-amber-700 text-white' : 'bg-fb-surface-hover text-fb-text-muted'
                            }`}>{i + 1}</span>
                          {item.avatar ? (
                            <img src={item.avatar} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover bg-slate-900 shrink-0" />
                          ) : (
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px] sm:text-xs shrink-0">FB</div>
                          )}
                          <span className="font-bold text-fb-text truncate max-w-[100px] sm:max-w-[160px]">{item.pageName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 sm:px-3 text-center font-bold text-emerald-400">
                        {ztteam_formatNumber(item.views || 0)}
                      </td>
                      <td className="py-2.5 px-2 sm:px-3 text-center font-bold text-blue-400">
                        {item.published || 0}
                      </td>
                      <td className="py-2.5 px-2 sm:px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400">
                          {item.rate || 100}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 sm:px-3 text-right">
                        <button
                          onClick={() => navigate(`/facebook/pages/${item.pageId}/report`)}
                          className="px-2 sm:px-2.5 py-1 bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500 hover:text-white rounded-full font-bold text-[10px] transition-colors"
                          title="Xem chi tiết"
                        >
                          <span className="hidden sm:inline">Xem chi tiết</span>
                          <span className="sm:hidden">Chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-fb-text-muted italic">Chưa có dữ liệu xếp hạng Fanpage</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/** Activity Feed Gần Đây (4 cols) */}
        <div className="lg:col-span-4 bg-fb-surface rounded-2xl p-5 shadow-lg flex flex-col space-y-3">
          {/** Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                <span className="material-symbols-outlined text-xl">history</span>
              </div>
              <h3 className="text-base font-bold text-fb-text">Hoạt Động Gần Đây</h3>
            </div>
          </div>

          {/** Content */}
          <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar flex-1">
            {stats.activities && stats.activities.length > 0 ? (
              stats.activities.map((act: any, idx: number) => (
                <div key={act.id || idx} className="flex items-start gap-3 text-xs bg-fb-surface-hover/40 p-2.5 rounded-xl hover:bg-fb-surface-hover/70 transition-colors">
                  <div className={`w-7 h-7 shrink-0 rounded-lg text-white flex items-center justify-center shadow-md ${act.type === 'CRAWL' ? 'bg-emerald-500' :
                      act.type === 'CREATE_VIDEO' ? 'bg-cyan-500' :
                        act.type === 'POST_FACEBOOK' ? 'bg-blue-500' : 'bg-amber-500'
                    }`}>
                    <span className="material-symbols-outlined text-sm">
                      {act.type === 'CRAWL' ? 'rss_feed' :
                        act.type === 'CREATE_VIDEO' ? 'movie' :
                          act.type === 'POST_FACEBOOK' ? 'share' : 'info'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-fb-text font-bold truncate">{act.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-fb-text-muted mt-0.5">
                      <span>{act.pageName || act.sourceName || 'Hệ thống'}</span>
                      <span>•</span>
                      <span>{ztteam_formatDate(act.date)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-fb-text-muted italic text-xs">
                Chưa ghi nhận hoạt động nào gần đây
              </div>
            )}
          </div>
        </div>

      </div>

      {/** Footer Info */}
      <footer className="pt-2 flex flex-col sm:flex-row items-center justify-between text-xs text-fb-text-muted gap-2 font-medium">
        <p>© 2026 CreatorPro AI. Phát triển bởi <a href="https://ztteam.site" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-bold">ZTTeam</a>.</p>
        <div className="flex items-center gap-4">
          <span className="hover:text-fb-text transition-colors cursor-pointer">Điều khoản</span>
          <span className="hover:text-fb-text transition-colors cursor-pointer">Bảo mật</span>
          <span className="hover:text-fb-text transition-colors cursor-pointer">Trợ giúp</span>
        </div>
      </footer>
    </div>
  );
}