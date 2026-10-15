import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart
} from 'recharts';
import api from '../services/api';
import { useZTTeamAuthStore } from '../stores/authStore';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import { useWordpressStore } from '../stores/wordpressStore';
import CustomDropdown from '../components/CustomDropdown';

export default function StatisticsPage() {
  const { user } = useZTTeamAuthStore();
  const userRole = (user?.role || '').toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRATOR';

  const { pages, ztteam_fetchPagesFromDB } = useZTTeamFacebookStore();
  const { sites, ztteam_fetchSites } = useWordpressStore();

  /** Dữ liệu sản lượng & đăng bài */
  const [data, setData] = useState({
    chartData: [] as any[],
    leaderboard: [] as any[],
    details: [] as any[]
  });
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(7);
  
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [systemUsers, setSystemUsers] = useState<any[]>([]);

  const ztteam_formatNumber = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  /** Lấy danh sách fanpage, website và users */
  useEffect(() => {
    ztteam_fetchPagesFromDB();
    ztteam_fetchSites();
    if (isAdmin) {
      api.get('/users').then(res => {
        const userList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        setSystemUsers(userList);
      }).catch(console.error);
    }
  }, [ztteam_fetchPagesFromDB, ztteam_fetchSites, isAdmin]);

  /** Lấy dữ liệu biểu đồ */
  useEffect(() => {
    const fetchChart = async () => {
      setIsLoading(true);
      try {
        let url = `dashboard/chart?days=${days}`;
        if (selectedUserId) url += `&targetUserId=${selectedUserId}`;
        if (selectedPageId) url += `&pageId=${selectedPageId}`;
        if (selectedSiteId) url += `&siteId=${selectedSiteId}`;
        
        const res = await api.get(url);
        if (res.data) {
          setData(res.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchChart();
  }, [days, selectedUserId, selectedPageId, selectedSiteId]);

  /** Trích xuất dynamic chart keys */
  const crawlKeys = useMemo(() => {
    if (!data.chartData.length) return [];
    return Object.keys(data.chartData[0]).filter(k => k.startsWith('crawl_'));
  }, [data.chartData]);

  const pubKeys = useMemo(() => {
    if (!data.chartData.length) return [];
    return Object.keys(data.chartData[0]).filter(k => k.startsWith('pub_'));
  }, [data.chartData]);

  const createKeys = useMemo(() => {
    if (!data.chartData.length) return [];
    return Object.keys(data.chartData[0]).filter(k => k.startsWith('create_'));
  }, [data.chartData]);

  const totalCrawled = useMemo(() => {
    return data.chartData.reduce((sum, d) => {
      let dailySum = 0;
      crawlKeys.forEach(k => dailySum += (d[k] || 0));
      return sum + dailySum;
    }, 0);
  }, [data.chartData, crawlKeys]);

  const totalPublished = useMemo(() => {
    return data.chartData.reduce((sum, d) => {
      let dailySum = 0;
      pubKeys.forEach(k => dailySum += (d[k] || 0));
      return sum + dailySum;
    }, 0);
  }, [data.chartData, pubKeys]);

  const totalCreated = useMemo(() => {
    return data.chartData.reduce((sum, d) => {
      let dailySum = 0;
      createKeys.forEach(k => dailySum += (d[k] || 0));
      return sum + dailySum;
    }, 0);
  }, [data.chartData, createKeys]);

  const ztteam_chartColors = ['#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#14b8a6', '#ef4444'];
  const ztteam_pubColors = ['#3b82f6', '#06b6d4', '#14b8a6', '#f59e0b', '#10b981', '#ef4444'];

  /** Custom dropdown option sets */
  const ztteam_userOptions = useMemo(() => [
    { value: '', label: 'Tất cả Thành viên' },
    ...systemUsers.map(u => ({ value: u.id, label: `${u.email} (${u.role})` }))
  ], [systemUsers]);

  const ztteam_pageOptions = useMemo(() => [
    { value: '', label: 'Tất cả Fanpage' },
    ...pages.map(p => ({ value: p.id, label: p.name }))
  ], [pages]);

  const ztteam_siteOptions = useMemo(() => [
    { value: '', label: 'Tất cả Website' },
    ...sites.map(s => ({ value: s.id, label: s.wp_url }))
  ], [sites]);

  return (
    <div className="w-full space-y-6">
          {/** Header & Filter Bar */}
          <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Báo Cáo Thống Kê</h2>
                <Link
                  to="/google-analytics"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm shrink-0 hover:bg-emerald-500/25 transition-all cursor-pointer"
                  title="Xem báo cáo Google Analytics 4 Realtime"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Google Analytics Realtime &rarr;</span>
                </Link>
              </div>
              <p className="text-sm font-medium text-fb-text-muted mt-1">Hiệu suất cào bài, đăng video và tương tác Facebook Insights toàn hệ thống.</p>
            </div>
            
            {/** Responsive Filters & Tab Switcher */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full xl:w-auto">
              {isAdmin && (
                <CustomDropdown
                  value={selectedUserId}
                  onChange={(val) => setSelectedUserId(String(val))}
                  options={ztteam_userOptions}
                  className="w-full sm:w-48"
                />
              )}

              <CustomDropdown
                value={selectedPageId}
                onChange={(val) => setSelectedPageId(String(val))}
                options={ztteam_pageOptions}
                className="w-full sm:w-44"
              />

              <CustomDropdown
                value={selectedSiteId}
                onChange={(val) => setSelectedSiteId(String(val))}
                options={ztteam_siteOptions}
                className="w-full sm:w-44"
              />

              {/** Tab 7 ngày và 30 ngày */}
              <div className="grid grid-cols-2 gap-1 bg-fb-surface-hover p-1.5 rounded-full text-xs font-bold w-full sm:w-52 shrink-0">
                <button 
                  onClick={() => setDays(7)} 
                  className={`w-full py-1.5 px-3 rounded-full text-xs text-center transition-all ${
                    days === 7 
                      ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20' 
                      : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                  }`}
                >
                  7 Ngày
                </button>
                <button 
                  onClick={() => setDays(30)} 
                  className={`w-full py-1.5 px-3 rounded-full text-xs text-center transition-all ${
                    days === 30 
                      ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20' 
                      : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                  }`}
                >
                  30 Ngày
                </button>
              </div>
            </div>
          </div>

          {/** 4 Stat Cards Thống Kê Động */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/** Card 1: Lượt Xem Video */}
            <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-emerald-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
              <div className="flex justify-between items-start mb-2 sm:mb-3">
                <div>
                  <p className="text-[10px] sm:text-xs font-black text-emerald-400 uppercase tracking-wider">Lượt Xem Video</p>
                  <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-emerald-300 transition-colors">
                    {isLoading ? '...' : ztteam_formatNumber((data as any).overview?.totalMediaViews || 0)}
                  </h3>
                </div>
                <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-lg sm:text-2xl">visibility</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
                <span className="truncate">Tiếp cận: <b className="text-emerald-300 font-bold">{ztteam_formatNumber((data as any).overview?.totalUniqueReach || 0)}</b></span>
                <span className="text-emerald-400 font-bold hidden sm:inline">FB Insights</span>
              </div>
            </div>

            {/** Card 2: Reels Đã Đăng */}
            <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-blue-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
              <div className="flex justify-between items-start mb-2 sm:mb-3">
                <div>
                  <p className="text-[10px] sm:text-xs font-black text-blue-400 uppercase tracking-wider">Reels Đã Đăng</p>
                  <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-blue-300 transition-colors">
                    {isLoading ? '...' : ztteam_formatNumber(totalPublished)}
                  </h3>
                </div>
                <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-fb-blue text-white rounded-xl shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-lg sm:text-2xl">post_add</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
                <span className="truncate">Xuất bản: <b className="text-blue-300 font-bold">{ztteam_formatNumber(totalPublished)}</b></span>
                <span className="text-blue-400 font-bold hidden sm:inline">Auto Posted</span>
              </div>
            </div>

            {/** Card 3: AI Reels Đã Tạo */}
            <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-cyan-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
              <div className="flex justify-between items-start mb-2 sm:mb-3">
                <div>
                  <p className="text-[10px] sm:text-xs font-black text-cyan-400 uppercase tracking-wider">AI Reels Đã Tạo</p>
                  <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-cyan-300 transition-colors">
                    {isLoading ? '...' : ztteam_formatNumber(totalCreated)}
                  </h3>
                </div>
                <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-600 text-white rounded-xl shadow-lg shadow-cyan-500/30 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-lg sm:text-2xl">auto_awesome</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
                <span className="truncate">Crawl bài: <b className="text-cyan-300 font-bold">{ztteam_formatNumber(totalCrawled)}</b></span>
                <span className="text-cyan-400 font-bold hidden sm:inline">AI Factory</span>
              </div>
            </div>

            {/** Card 4: Tổng Người Theo Dõi & Tăng Trưởng */}
            <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-amber-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
              <div className="flex justify-between items-start mb-2 sm:mb-3">
                <div>
                  <p className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-wider">Tổng Người Theo Dõi</p>
                  <h3 className="text-xl sm:text-3xl font-black text-fb-text mt-0.5 sm:mt-1 group-hover:text-amber-300 transition-colors">
                    {isLoading ? '...' : ztteam_formatNumber((data as any).overview?.totalFollowers || (data as any).overview?.newFollowers || 0)}
                  </h3>
                </div>
                <div className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-lg sm:text-2xl">groups</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-xs text-fb-text-muted pt-1">
                <span className="truncate">Tăng mới ({days}d): <b className="text-amber-300 font-bold">+{ztteam_formatNumber((data as any).overview?.newFollowers || 0)}</b></span>
                <span className="text-amber-400 font-bold hidden sm:inline">Followers</span>
              </div>
            </div>
          </div>

          {/** Biểu đồ Tổng hợp - 3 Columns */}
          {isLoading ? (
            <div className="bg-fb-surface py-20 w-full rounded-2xl shadow-lg flex flex-col items-center justify-center text-fb-text-muted">
              <span className="material-symbols-outlined animate-spin text-4xl mb-2 text-fb-blue">refresh</span>
              <span className="text-sm font-medium">Đang tải dữ liệu biểu đồ...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/** Crawled Card */}
              <div className="bg-fb-surface p-5 sm:p-6 rounded-2xl shadow-lg flex flex-col">
                <div className="mb-4 flex justify-between items-start">
                  <div>
                    <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Bài Cào Về</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-fb-text">
                      {totalCrawled.toLocaleString()}
                    </h3>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">language</span>
                  </div>
                </div>
                <div className="h-48 w-full mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="crawlGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
                      {crawlKeys.map((k, i) => (
                        <Area 
                          key={k} 
                          type="monotone" 
                          dataKey={k} 
                          name={k.replace('crawl_', '')}
                          stroke={ztteam_chartColors[i % ztteam_chartColors.length]} 
                          fillOpacity={1} 
                          fill="url(#crawlGrad)" 
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/** Created Card */}
              <div className="bg-fb-surface p-5 sm:p-6 rounded-2xl shadow-lg flex flex-col">
                <div className="mb-4 flex justify-between items-start">
                  <div>
                    <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Reels Đã Tạo (AI)</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-fb-text">
                      {totalCreated.toLocaleString()}
                    </h3>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">smart_toy</span>
                  </div>
                </div>
                <div className="h-48 w-full mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="createGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
                      {createKeys.map((k, i) => (
                        <Area 
                          key={k} 
                          type="monotone" 
                          dataKey={k} 
                          name={k.replace('create_', '')}
                          stroke={ztteam_chartColors[(i + 2) % ztteam_chartColors.length]} 
                          fillOpacity={1} 
                          fill="url(#createGrad)" 
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/** Published Card */}
              <div className="bg-fb-surface p-5 sm:p-6 rounded-2xl shadow-lg flex flex-col">
                <div className="mb-4 flex justify-between items-start">
                  <div>
                    <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-1">Reels Xuất Bản</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-fb-text">
                      {totalPublished.toLocaleString()}
                    </h3>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">share</span>
                  </div>
                </div>
                <div className="h-48 w-full mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pubGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
                      {pubKeys.map((k, i) => (
                        <Area 
                          key={k} 
                          type="monotone" 
                          dataKey={k} 
                          name={k.replace('pub_', '')}
                          stroke={ztteam_pubColors[i % ztteam_pubColors.length]} 
                          fillOpacity={1} 
                          fill="url(#pubGrad)" 
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/** 2 Columns Detail Section */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/** Leaderboard: Top Fanpages */}
            <div className="bg-fb-surface p-5 rounded-2xl shadow-lg flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h3 className="text-base font-bold text-fb-text tracking-tight">Bảng Xếp Hạng Fanpage</h3>
                  <p className="text-xs text-fb-text-muted mt-0.5">Xếp hạng theo sản lượng xuất bản</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">leaderboard</span>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                {isLoading ? (
                  <div className="py-12 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-fb-blue">refresh</span>
                    <span className="text-xs font-medium">Đang tải bảng xếp hạng...</span>
                  </div>
                ) : data.leaderboard.length === 0 ? (
                  <div className="py-12 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl mb-2 text-fb-text-muted/50">hourglass_empty</span>
                    <span className="text-xs font-medium">Chưa có dữ liệu Fanpage</span>
                  </div>
                ) : (
                  data.leaderboard.map((page, index) => (
                    <div 
                      key={page.pageId}
                      className="flex items-center justify-between p-3 rounded-xl bg-fb-surface-hover/50 hover:bg-fb-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-5 text-center font-black text-xs shrink-0 ${
                          index === 0 ? 'text-amber-400' : 
                          index === 1 ? 'text-slate-300' : 
                          index === 2 ? 'text-orange-400' : 
                          'text-fb-text-muted'
                        }`}>
                          #{index + 1}
                        </span>

                        <div className="relative shrink-0">
                          {page.avatar ? (
                            <img 
                              src={page.avatar} 
                              alt={page.pageName} 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.fallback) {
                                  target.dataset.fallback = 'true';
                                  target.src = `https://graph.facebook.com/${page.fbPageId || page.pageId}/picture?type=large`;
                                }
                              }}
                              className="w-9 h-9 rounded-xl shadow-md object-cover" 
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-fb-blue text-white flex items-center justify-center font-bold text-xs shadow-md">
                              FB
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 ml-3">
                          <p className="text-xs sm:text-sm font-bold text-fb-text truncate leading-snug">{page.pageName}</p>
                          <p className="text-[11px] text-fb-text-muted font-medium truncate mt-0.5">Đã đăng {page.published} bài</p>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <div className="flex items-center gap-1 bg-blue-500/15 text-blue-400 px-2 py-1 rounded-lg text-xs font-bold" title="Tổng lượt xem Video (Video Views)">
                            <span className="material-symbols-outlined text-xs">visibility</span>
                            <span>{ztteam_formatNumber(page.views || 0)}</span>
                          </div>
                          <div className="flex items-center gap-1 bg-cyan-500/15 text-cyan-400 px-2 py-1 rounded-lg text-xs font-bold" title="Tổng số người theo dõi (Followers)">
                            <span className="material-symbols-outlined text-xs">groups</span>
                            <span>{ztteam_formatNumber((page as any).followers || page.newFollowers || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/** Detailed Grid: Highlighted Posts */}
            <div className="bg-fb-surface p-5 rounded-2xl shadow-lg xl:col-span-2 flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h3 className="text-base font-bold text-fb-text tracking-tight">Video Nổi Bật Tương Tác Cao</h3>
                  <p className="text-xs text-fb-text-muted mt-0.5">Top 15 video xu hướng trên hệ thống</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">local_fire_department</span>
                </div>
              </div>
              
              <div className="max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                {isLoading ? (
                  <div className="py-12 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-fb-blue">refresh</span>
                    <span className="text-xs font-medium">Đang tải video nổi bật...</span>
                  </div>
                ) : data.details.length === 0 ? (
                  <div className="py-12 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl mb-2 text-fb-text-muted/50">videocam_off</span>
                    <span className="text-xs font-medium">Không có dữ liệu video nổi bật</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                    {data.details.map((post, index) => (
                      <div key={post.id} className="group relative flex items-start gap-3 p-3 rounded-xl bg-fb-surface-hover/50 hover:bg-fb-surface-hover transition-colors">
                        <div className="absolute -left-1.5 -top-1.5 w-5 h-5 rounded-full bg-fb-surface shadow-md flex items-center justify-center z-10">
                          <span className={`text-[9px] font-black ${
                            index === 0 ? 'text-amber-400' : 
                            index === 1 ? 'text-slate-300' : 
                            index === 2 ? 'text-orange-400' : 
                            'text-fb-text-muted'
                          }`}>
                            #{index + 1}
                          </span>
                        </div>

                        <div className="w-14 h-20 rounded-lg bg-fb-surface-hover shrink-0 relative overflow-hidden shadow-sm">
                          <img 
                            src={post.thumbnail} 
                            alt={post.title} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                          />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-xl opacity-0 group-hover:opacity-100 transition-opacity">play_arrow</span>
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0 flex flex-col h-20 justify-between py-0.5">
                          <div>
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 mb-1">
                              <span className="material-symbols-outlined text-[10px]">verified</span>
                              <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-[120px]">{post.pageName}</span>
                            </div>
                            <p className="text-xs font-bold text-fb-text leading-tight line-clamp-2">
                              {post.title}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-3 mt-auto">
                            <div className="flex items-center gap-1 text-fb-text-muted text-xs font-bold" title="Lượt xem video">
                              <span className="material-symbols-outlined text-xs">visibility</span>
                              <span>{ztteam_formatNumber(post.views || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-rose-400 text-xs font-bold" title="Lượt thích / Cảm xúc (Reactions)">
                              <span className="material-symbols-outlined text-xs">favorite</span>
                              <span>{ztteam_formatNumber(post.reactions || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-blue-400 text-xs font-bold" title="Lượt bình luận (Comments)">
                              <span className="material-symbols-outlined text-xs">chat_bubble</span>
                              <span>{ztteam_formatNumber(post.comments || 0)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
    </div>
  );
}
