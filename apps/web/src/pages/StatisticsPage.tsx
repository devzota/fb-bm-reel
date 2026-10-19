import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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

  /** Dữ liệu bảng xếp hạng và bài viết */
  const [data, setData] = useState({
    topByViews: [] as any[],
    topByReach: [] as any[],
    topByFollowers: [] as any[],
    highlightedPosts: [] as any[],
    overview: {
      totalMediaViews: 0,
      totalUniqueReach: 0,
      totalEngagements: 0,
      totalFollowers: 0,
      newFollowers: 0,
      totalSystemPosts: 0
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [activeTab, setActiveTab] = useState<'ALL' | 'VIEWS' | 'REACH' | 'FOLLOWERS' | 'VIDEOS'>('ALL');

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

  /** Lấy dữ liệu thống kê từ backend */
  useEffect(() => {
    const ztteam_fetchData = async () => {
      setIsLoading(true);
      try {
        let url = `dashboard/chart?days=${days}`;
        if (selectedUserId) url += `&targetUserId=${selectedUserId}`;
        if (selectedPageId) url += `&pageId=${selectedPageId}`;
        if (selectedSiteId) url += `&siteId=${selectedSiteId}`;

        const res = await api.get(url);
        if (res.data) {
          setData({
            topByViews: res.data.topByViews || res.data.leaderboard || [],
            topByReach: res.data.topByReach || [],
            topByFollowers: res.data.topByFollowers || [],
            highlightedPosts: res.data.highlightedPosts || res.data.details || [],
            overview: res.data.overview || {
              totalMediaViews: 0,
              totalUniqueReach: 0,
              totalEngagements: 0,
              totalFollowers: 0,
              newFollowers: 0,
              totalSystemPosts: 0
            }
          });
        }
      } catch (e) {
        console.error('Lỗi khi tải dữ liệu thống kê:', e);
      } finally {
        setIsLoading(false);
      }
    };
    ztteam_fetchData();
  }, [days, selectedUserId, selectedPageId, selectedSiteId]);

  /** Custom dropdown options */
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

  /** Giá trị max cho thanh tỷ lệ % trực quan */
  const maxViews = useMemo(() => Math.max(...data.topByViews.map(p => p.views || 0), 1), [data.topByViews]);
  const maxReach = useMemo(() => Math.max(...data.topByReach.map(p => p.reach || 0), 1), [data.topByReach]);
  const maxNewFollowers = useMemo(() => Math.max(...data.topByFollowers.map(p => p.newFollowers || 0), 1), [data.topByFollowers]);

  return (
    <div className="w-full space-y-6">
      {/** Header & Bộ Lọc Chuẩn Mực */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Thống Kê Hiệu Suất Fanpage</h2>
            <Link
              to="/google-analytics"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm shrink-0 hover:bg-emerald-500/25 transition-all cursor-pointer"
              title="Xem báo cáo Google Analytics 4 Realtime"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Google Analytics Realtime &rarr;</span>
            </Link>
          </div>
          <p className="text-sm font-medium text-fb-text-muted mt-1">
            Xếp hạng Fanpage tăng trưởng theo Video View (bài hệ thống đăng), Tiếp cận (Reach) và Lượt Follow mới.
          </p>
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

      {/** Dải Thông Số Tóm Tắt Nhanh */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-fb-surface p-4 rounded-xl border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Tổng Views Bài Hệ Thống</p>
            <h4 className="text-xl sm:text-2xl font-black text-fb-text mt-0.5">
              {isLoading ? '...' : ztteam_formatNumber(data.overview.totalMediaViews)}
            </h4>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xl">play_circle</span>
          </div>
        </div>

        <div className="bg-fb-surface p-4 rounded-xl border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Tổng Lượt Tiếp Cận (Reach)</p>
            <h4 className="text-xl sm:text-2xl font-black text-fb-text mt-0.5">
              {isLoading ? '...' : ztteam_formatNumber(data.overview.totalUniqueReach)}
            </h4>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xl">radar</span>
          </div>
        </div>

        <div className="bg-fb-surface p-4 rounded-xl border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Followers Tăng Mới ({days}d)</p>
            <h4 className="text-xl sm:text-2xl font-black text-fb-text mt-0.5">
              {isLoading ? '...' : `+${ztteam_formatNumber(data.overview.newFollowers)}`}
            </h4>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xl">person_add</span>
          </div>
        </div>

        <div className="bg-fb-surface p-4 rounded-xl border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">Video Hệ Thống Trong Kỳ</p>
            <h4 className="text-xl sm:text-2xl font-black text-fb-text mt-0.5">
              {isLoading ? '...' : ztteam_formatNumber(data.overview.totalSystemPosts || data.highlightedPosts.length)}
            </h4>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xl">smart_toy</span>
          </div>
        </div>
      </div>

      {/** Tab Chuyển Đổi Chế Độ Xem Trực Quan */}
      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'ALL'
              ? 'bg-fb-blue text-white shadow-md shadow-blue-500/25'
              : 'bg-fb-surface text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-base">dashboard</span>
          <span>Tất Cả 3 Bảng Xếp Hạng</span>
        </button>

        <button
          onClick={() => setActiveTab('VIEWS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'VIEWS'
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
              : 'bg-fb-surface text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-base">visibility</span>
          <span>🎬 Video View Cao ({data.topByViews.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('REACH')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'REACH'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'bg-fb-surface text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-base">radar</span>
          <span>📈 Reach Tiếp Cận ({data.topByReach.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('FOLLOWERS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'FOLLOWERS'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
              : 'bg-fb-surface text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          <span>👥 Follower Tăng Trưởng ({data.topByFollowers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('VIDEOS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'VIDEOS'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/25'
              : 'bg-fb-surface text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-base">local_fire_department</span>
          <span>🔥 Top Video Nổi Bật ({data.highlightedPosts.length})</span>
        </button>
      </div>

      {/** 3 Cột Bảng Xếp Hạng Trực Quan */}
      {(activeTab === 'ALL' || activeTab === 'VIEWS' || activeTab === 'REACH' || activeTab === 'FOLLOWERS') && (
        <div className={`grid gap-5 ${
          activeTab === 'ALL' ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'
        }`}>
          {/** Cột 1: Top Video View Cao (Chỉ bài hệ thống đăng) */}
          {(activeTab === 'ALL' || activeTab === 'VIEWS') && (
            <div className="bg-fb-surface p-5 rounded-2xl shadow-lg flex flex-col space-y-4 border border-white/5">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <h3 className="text-base font-black text-fb-text tracking-tight">Top Video View Cao</h3>
                  </div>
                  <p className="text-xs text-fb-text-muted mt-0.5">Chỉ đếm lượt xem các bài do hệ thống đăng</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">visibility</span>
                </div>
              </div>

              <div className="space-y-3 max-h-[580px] overflow-y-auto custom-scrollbar pr-1">
                {isLoading ? (
                  <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-emerald-400">refresh</span>
                    <span className="text-xs font-medium">Đang kiểm tra views từ Facebook...</span>
                  </div>
                ) : data.topByViews.length === 0 ? (
                  <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl mb-2 text-fb-text-muted/40">videocam_off</span>
                    <span className="text-xs font-medium">Chưa có bài đăng nào trong kỳ này</span>
                  </div>
                ) : (
                  data.topByViews.map((page, index) => {
                    const pct = Math.min(100, Math.round(((page.views || 0) / maxViews) * 100));
                    return (
                      <div
                        key={page.pageId}
                        className="p-3 rounded-xl bg-fb-surface-hover/60 hover:bg-fb-surface-hover transition-all flex flex-col gap-2 group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/** Rank Badge */}
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                              index === 1 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30' :
                              index === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                              'bg-white/5 text-fb-text-muted'
                            }`}>
                              {index + 1}
                            </span>

                            {/** Avatar */}
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
                              className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm"
                            />

                            {/** Name & Subtitle */}
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-fb-text truncate group-hover:text-emerald-400 transition-colors">
                                {page.pageName}
                              </p>
                              <p className="text-[11px] text-fb-text-muted truncate">
                                {page.systemPostsCount || page.published || 0} bài hệ thống đã đăng
                              </p>
                            </div>
                          </div>

                          {/** Views Value */}
                          <div className="text-right shrink-0">
                            <span className="text-sm sm:text-base font-black text-emerald-400">
                              {ztteam_formatNumber(page.views || 0)}
                            </span>
                            <span className="text-[10px] text-fb-text-muted block">views</span>
                          </div>
                        </div>

                        {/** Thanh phần trăm trực quan */}
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(5, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/** Cột 2: Top Reach Tiếp Cận Tăng */}
          {(activeTab === 'ALL' || activeTab === 'REACH') && (
            <div className="bg-fb-surface p-5 rounded-2xl shadow-lg flex flex-col space-y-4 border border-white/5">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <h3 className="text-base font-black text-fb-text tracking-tight">Top Tiếp Cận (Reach)</h3>
                  </div>
                  <p className="text-xs text-fb-text-muted mt-0.5">Tài khoản Facebook tiếp cận trong kỳ</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">radar</span>
                </div>
              </div>

              <div className="space-y-3 max-h-[580px] overflow-y-auto custom-scrollbar pr-1">
                {isLoading ? (
                  <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-blue-400">refresh</span>
                    <span className="text-xs font-medium">Đang tổng hợp Insights...</span>
                  </div>
                ) : data.topByReach.length === 0 ? (
                  <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl mb-2 text-fb-text-muted/40">signal_wifi_off</span>
                    <span className="text-xs font-medium">Chưa có dữ liệu tiếp cận</span>
                  </div>
                ) : (
                  data.topByReach.map((page, index) => {
                    const pct = Math.min(100, Math.round(((page.reach || 0) / maxReach) * 100));
                    return (
                      <div
                        key={page.pageId}
                        className="p-3 rounded-xl bg-fb-surface-hover/60 hover:bg-fb-surface-hover transition-all flex flex-col gap-2 group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/** Rank Badge */}
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                              index === 1 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30' :
                              index === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                              'bg-white/5 text-fb-text-muted'
                            }`}>
                              {index + 1}
                            </span>

                            {/** Avatar */}
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
                              className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm"
                            />

                            {/** Name & Subtitle */}
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-fb-text truncate group-hover:text-blue-400 transition-colors">
                                {page.pageName}
                              </p>
                              <p className="text-[11px] text-fb-text-muted truncate">
                                {ztteam_formatNumber(page.views || 0)} lượt xem video
                              </p>
                            </div>
                          </div>

                          {/** Reach Value */}
                          <div className="text-right shrink-0">
                            <span className="text-sm sm:text-base font-black text-blue-400">
                              {ztteam_formatNumber(page.reach || 0)}
                            </span>
                            <span className="text-[10px] text-fb-text-muted block">tiếp cận</span>
                          </div>
                        </div>

                        {/** Thanh phần trăm trực quan */}
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(5, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/** Cột 3: Top Follower Tăng Trưởng */}
          {(activeTab === 'ALL' || activeTab === 'FOLLOWERS') && (
            <div className="bg-fb-surface p-5 rounded-2xl shadow-lg flex flex-col space-y-4 border border-white/5">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                    <h3 className="text-base font-black text-fb-text tracking-tight">Top Follower Tăng</h3>
                  </div>
                  <p className="text-xs text-fb-text-muted mt-0.5">Tăng trưởng người theo dõi trong {days} ngày</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">person_add</span>
                </div>
              </div>

              <div className="space-y-3 max-h-[580px] overflow-y-auto custom-scrollbar pr-1">
                {isLoading ? (
                  <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-amber-400">refresh</span>
                    <span className="text-xs font-medium">Đang tải tăng trưởng follower...</span>
                  </div>
                ) : data.topByFollowers.length === 0 ? (
                  <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl mb-2 text-fb-text-muted/40">groups</span>
                    <span className="text-xs font-medium">Chưa có dữ liệu theo dõi</span>
                  </div>
                ) : (
                  data.topByFollowers.map((page, index) => {
                    const pct = Math.min(100, Math.round(((page.newFollowers || 0) / maxNewFollowers) * 100));
                    return (
                      <div
                        key={page.pageId}
                        className="p-3 rounded-xl bg-fb-surface-hover/60 hover:bg-fb-surface-hover transition-all flex flex-col gap-2 group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/** Rank Badge */}
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                              index === 1 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30' :
                              index === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                              'bg-white/5 text-fb-text-muted'
                            }`}>
                              {index + 1}
                            </span>

                            {/** Avatar */}
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
                              className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm"
                            />

                            {/** Name & Subtitle */}
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-fb-text truncate group-hover:text-amber-400 transition-colors">
                                {page.pageName}
                              </p>
                              <p className="text-[11px] text-fb-text-muted truncate">
                                Tổng: {ztteam_formatNumber(page.followers || 0)} followers
                              </p>
                            </div>
                          </div>

                          {/** Follower Increase Value */}
                          <div className="text-right shrink-0">
                            <span className="text-sm sm:text-base font-black text-amber-400">
                              +{ztteam_formatNumber(page.newFollowers || 0)}
                            </span>
                            <span className="text-[10px] text-fb-text-muted block">mới ({days}d)</span>
                          </div>
                        </div>

                        {/** Thanh phần trăm trực quan */}
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-orange-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(page.newFollowers > 0 ? pct : 5, 5)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/** Khu Vực Video Nổi Bật Do Hệ Thống Đăng */}
      {(activeTab === 'ALL' || activeTab === 'VIDEOS') && (
        <div className="bg-fb-surface p-5 sm:p-6 rounded-2xl shadow-lg border border-white/5 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                <h3 className="text-base sm:text-lg font-black text-fb-text tracking-tight">
                  Video Nổi Bật Của Hệ Thống
                </h3>
              </div>
              <p className="text-xs text-fb-text-muted mt-0.5">
                Các video do hệ thống tạo và đăng tải có lượt xem và tương tác cao nhất
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">local_fire_department</span>
            </div>
          </div>

          <div>
            {isLoading ? (
              <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-cyan-400">refresh</span>
                <span className="text-xs font-medium">Đang tải danh sách video...</span>
              </div>
            ) : data.highlightedPosts.length === 0 ? (
              <div className="py-16 text-center text-fb-text-muted flex flex-col items-center">
                <span className="material-symbols-outlined text-4xl mb-2 text-fb-text-muted/40">videocam_off</span>
                <span className="text-xs font-medium">Chưa có video nào được đăng trong kỳ này</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.highlightedPosts.map((post, index) => (
                  <div
                    key={post.id || index}
                    className="group relative flex items-start gap-3.5 p-3.5 rounded-xl bg-fb-surface-hover/50 hover:bg-fb-surface-hover border border-white/5 hover:border-white/10 transition-all"
                  >
                    {/** Rank Badge góc trái */}
                    <div className="absolute -left-1.5 -top-1.5 w-6 h-6 rounded-full bg-fb-surface shadow-md flex items-center justify-center z-10 border border-white/10">
                      <span className={`text-[10px] font-black ${
                        index === 0 ? 'text-amber-400' :
                        index === 1 ? 'text-slate-300' :
                        index === 2 ? 'text-orange-400' :
                        'text-fb-text-muted'
                      }`}>
                        #{index + 1}
                      </span>
                    </div>

                    {/** Thumbnail 9:16 */}
                    <div className="w-16 h-24 rounded-lg bg-black/40 shrink-0 relative overflow-hidden shadow-md">
                      <img
                        src={post.thumbnail}
                        alt={post.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.includes('placehold.co')) {
                            target.src = 'https://placehold.co/1080x1920/1e293b/94a3b8?text=Reel';
                          }
                        }}
                      />
                      <a
                        href={post.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute inset-0 bg-black/20 group-hover:bg-black/50 transition-colors flex items-center justify-center cursor-pointer"
                        title="Xem trên Facebook"
                      >
                        <span className="material-symbols-outlined text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                          play_circle
                        </span>
                      </a>
                    </div>

                    {/** Thông tin video */}
                    <div className="flex-1 min-w-0 flex flex-col h-24 justify-between py-0.5">
                      <div>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 mb-1 max-w-full">
                          <span className="material-symbols-outlined text-[11px]">verified</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                            {post.pageName}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-fb-text leading-snug line-clamp-2 group-hover:text-cyan-300 transition-colors">
                          {post.title}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1 font-black text-emerald-400" title="Lượt xem video thực tế">
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          <span>{ztteam_formatNumber(post.views || 0)}</span>
                        </div>

                        {post.videoUrl && (
                          <a
                            href={post.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-fb-blue hover:underline"
                          >
                            <span>Facebook</span>
                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
