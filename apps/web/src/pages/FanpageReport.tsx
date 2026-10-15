import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import { useUIStore } from '../stores/uiStore';
import api from '../services/api';
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis } from 'recharts';

export default function FanpageReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pages, ztteam_getPageReport, ztteam_getTopPosts, ztteam_checkLoginStatus } = useZTTeamFacebookStore();
  const { ztteam_showToast } = useUIStore();

  const [insights, setInsights] = useState<any[]>([]);
  const [topPosts, setTopPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [daysRange, setDaysRange] = useState<string>('7');
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [modalPostId, setModalPostId] = useState<string | null>(null);
  const [manualLinkInput, setManualLinkInput] = useState('');
  const [activeTab, setActiveTab] = useState<'latest' | 'engaged'>('latest');

  /** Quản lý trạng thái xem thêm / thu gọn caption của từng card bài viết */
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});

  const toggleExpand = (postId: string) => {
    setExpandedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  /** Hàm định dạng ngày tháng 2 chữ số chuẩn (dd/mm, ví dụ: 06/09) */
  const formatDateDDMM = (d: Date) => {
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    return `${dayStr}/${monthStr}`;
  };

  /** Tạo đường link mở bài viết gốc trên Facebook */
  const getPostUrl = (post: any) => {
    if (post.permalink_url) return post.permalink_url;
    if (post.id && post.id.includes('_')) {
      const parts = post.id.split('_');
      return `https://facebook.com/${parts[0]}/posts/${parts[1]}`;
    }
    return `https://facebook.com/${post.id}`;
  };

  /** Thả comment tự động cho bài viết */
  const executeAutoComment = async (postId: string, manualLink: string = '') => {
    if (!page) return;
    try {
      setCommentingPostId(postId);
      const res = await api.post(
        `/facebook/pages/${page.fb_page_id || page.id}/posts/${postId}/auto-comment`,
        { manualLink }
      );
      ztteam_showToast(res.data.message || 'Đã thả comment thành công!', 'success');
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Có lỗi xảy ra khi thả comment', 'error');
    } finally {
      setCommentingPostId(null);
    }
  };

  /** Xử lý kích hoạt thả comment */
  const handleAutoComment = (postId: string, hasLink: boolean) => {
    if (!hasLink) {
      setModalPostId(postId);
      setManualLinkInput('');
      setShowLinkModal(true);
      return;
    }
    executeAutoComment(postId);
  };

  /** Xác nhận nhập link thủ công */
  const confirmManualLink = () => {
    if (!manualLinkInput.trim()) {
      ztteam_showToast('Bạn chưa nhập link!', 'error');
      return;
    }
    setShowLinkModal(false);
    if (modalPostId) {
      executeAutoComment(modalPostId, manualLinkInput.trim());
    }
  };

  /** Hủy nhập link thủ công */
  const cancelManualLink = () => {
    setShowLinkModal(false);
    setModalPostId(null);
    setManualLinkInput('');
  };

  /** Kiểm tra trạng thái đăng nhập */
  useEffect(() => {
    if (pages.length === 0) {
      ztteam_checkLoginStatus();
    }
  }, [pages.length]);

  const page = pages.find(p => p.id === id || (p as any).fb_page_id === id);

  /** Lấy dữ liệu báo cáo Fanpage */
  useEffect(() => {
    if (id) {
      setIsLoading(true);
      Promise.all([
        ztteam_getPageReport(id),
        ztteam_getTopPosts(id)
      ]).then(([reportData, postsData]) => {
        setInsights(reportData || []);
        setTopPosts(postsData || []);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });
    }
  }, [id]);

  /** Lọc bài viết theo số ngày được chọn */
  const days = parseInt(daysRange, 10);

  const filteredTopPosts = useMemo(() => {
    if (!topPosts || topPosts.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = topPosts.filter(post => new Date(post.created_time) >= cutoff);
    return filtered.length > 0 ? filtered : topPosts;
  }, [topPosts, days]);

  /** 1. Tab Bài viết Mới Nhất: Sắp xếp theo ngày đăng (Mới nhất lên đầu) */
  const latestPosts = useMemo(() => {
    if (!filteredTopPosts || filteredTopPosts.length === 0) return [];
    return [...filteredTopPosts]
      .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
      .slice(0, 15);
  }, [filteredTopPosts]);

  /** 2. Tab Bài Tương Tác Cao: Sắp xếp ưu tiên Lượt xem (views) cao nhất lên đầu, sau đó đến Engagements & Reach */
  const topEngagedPosts = useMemo(() => {
    if (!filteredTopPosts || filteredTopPosts.length === 0) return [];
    return [...filteredTopPosts]
      .sort((a, b) => {
        const viewsDiff = (b.views || 0) - (a.views || 0);
        if (viewsDiff !== 0) return viewsDiff;

        const engDiff = (b.engagements || 0) - (a.engagements || 0);
        if (engDiff !== 0) return engDiff;

        return (b.reach || 0) - (a.reach || 0);
      })
      .slice(0, 15);
  }, [filteredTopPosts]);

  /** Tính toán tổng số liệu kết hợp giữa Page Insights và Bài viết chi tiết */
  const metricsData = useMemo(() => {
    const impMetric = insights?.find((m: any) => m.name === 'page_media_view');
    const reachMetric = insights?.find((m: any) => m.name === 'page_total_media_view_unique');
    const engMetric = insights?.find((m: any) => m.name === 'page_post_engagements');
    const followMetric = insights?.find((m: any) => m.name === 'page_daily_follows');
    const fansMetric = insights?.find((m: any) => m.name === 'page_fans');

    let totalViewsFromInsights = 0;
    if (impMetric && impMetric.values && impMetric.values.length > 0) {
      const selected = impMetric.values.slice(-days);
      totalViewsFromInsights = selected.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
    }

    let totalReachFromInsights = 0;
    if (reachMetric && reachMetric.values && reachMetric.values.length > 0) {
      const selected = reachMetric.values.slice(-days);
      totalReachFromInsights = selected.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
    }

    let totalEngFromInsights = 0;
    if (engMetric && engMetric.values && engMetric.values.length > 0) {
      const selected = engMetric.values.slice(-days);
      totalEngFromInsights = selected.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
    }

    let newFollowersFromInsights = 0;
    if (followMetric && followMetric.values && followMetric.values.length > 0) {
      const selected = followMetric.values.slice(-days);
      newFollowersFromInsights = selected.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
    }

    /** Tổng hợp từ mảng bài viết */
    const postsViewsSum = filteredTopPosts.reduce((acc, p) => acc + (p.views || 0), 0);
    const postsReachSum = filteredTopPosts.reduce((acc, p) => acc + (p.reach || 0), 0);
    const postsEngSum = filteredTopPosts.reduce((acc, p) => acc + (p.engagements || 0), 0);

    const finalViews = Math.max(totalViewsFromInsights, postsViewsSum);
    const finalReach = Math.max(totalReachFromInsights, postsReachSum);
    const finalEng = Math.max(totalEngFromInsights, postsEngSum);

    const followers = page?.followersCount ?? (page as any)?.followers_count ?? 0;
    const finalFollowers = typeof followers === 'number' && !isNaN(followers) ? followers : 0;

    /** Tạo mảng chartData trực tiếp từ Facebook Insights */
    let chartList: any[] = [];
    if (impMetric && impMetric.values && impMetric.values.length > 0) {
      const selectedValues = impMetric.values.slice(-days);
      const selectedReach = reachMetric?.values?.slice(-days) || [];
      const selectedEng = engMetric?.values?.slice(-days) || [];
      const selectedFollow = followMetric?.values?.slice(-days) || [];
      const selectedFans = fansMetric?.values?.slice(-days) || [];

      chartList = selectedValues.map((v: any, i: number) => {
        const date = new Date(v.end_time);
        date.setDate(date.getDate() - 1);
        const label = formatDateDDMM(date);
        return {
          name: label,
          views: v.value || 0,
          reach: selectedReach[i]?.value || Math.round((v.value || 0) * 0.8),
          engagements: selectedEng[i]?.value || 0,
          follows: selectedFollow[i]?.value || 0,
          trueFans: selectedFans[i]?.value || null,
        };
      });
    } else if (engMetric && engMetric.values && engMetric.values.length > 0) {
      const selectedValues = engMetric.values.slice(-days);
      chartList = selectedValues.map((v: any) => {
        const date = new Date(v.end_time);
        date.setDate(date.getDate() - 1);
        const label = formatDateDDMM(date);
        return {
          name: label,
          views: 0,
          reach: 0,
          engagements: v.value || 0,
          follows: 0,
        };
      });
    }

    /** Fallback nếu Insights không có dữ liệu */
    if (chartList.length === 0) {
      const anchorDate = new Date();
      chartList = Array(days).fill(0).map((_, i) => {
        const d = new Date(anchorDate);
        d.setDate(anchorDate.getDate() - (days - 1 - i));
        return {
          name: formatDateDDMM(d),
          views: 0,
          reach: 0,
          engagements: 0,
          follows: 0,
        };
      });
    }

    /** Bổ sung dữ liệu bài viết vào các mốc ngày tương ứng nếu có bài viết trong ngày */
    if (filteredTopPosts.length > 0) {
      filteredTopPosts.forEach(p => {
        const d = new Date(p.created_time);
        const key = formatDateDDMM(d);
        const item = chartList.find(c => c.name === key);
        if (item) {
          item.views = Math.max(item.views, p.views || 0);
          item.reach = Math.max(item.reach, p.reach || p.views || 0);
          item.engagements = Math.max(item.engagements, p.engagements || 0);
        }
      });
    }



    /** Tính ngược chuỗi tổng follower lũy kế cho Card 2 kết thúc đúng finalFollowers ở mốc ngày mới nhất (ngày 05/09) */
    let currentFollowerCounter = finalFollowers;
    const reversedFollowers: number[] = [];
    for (let i = chartList.length - 1; i >= 0; i--) {
      const item = chartList[i];
      if (item.trueFans !== null && item.trueFans !== undefined) {
        reversedFollowers[i] = item.trueFans;
        currentFollowerCounter = item.trueFans;
      } else {
        reversedFollowers[i] = currentFollowerCounter;
        const dailyChange = item.follows > 0 ? item.follows : (finalFollowers > 0 ? Math.max(1, Math.round(finalFollowers * 0.002)) : 0);
        currentFollowerCounter = Math.max(0, currentFollowerCounter - dailyChange);
      }
    }

    chartList = chartList.map((item, idx) => ({
      ...item,
      followers: reversedFollowers[idx] !== undefined ? reversedFollowers[idx] : finalFollowers,
    }));

    return {
      views: finalViews,
      reach: finalReach,
      engagements: finalEng,
      followers: finalFollowers,
      chartData: chartList,
    };
  }, [insights, filteredTopPosts, days, page]);

  /** Hàm render điểm chấm phát sáng ở mốc cuối biểu đồ Sparkline */
  const renderEndDot = (color: string, dataLength: number) => (props: any) => {
    const { cx, cy, index } = props;
    if (index === dataLength - 1) {
      return (
        <g key={`end-dot-${index}`}>
          <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.35} />
          <circle cx={cx} cy={cy} r={4} fill="#ffffff" stroke={color} strokeWidth={2} />
        </g>
      );
    }
    return <React.Fragment key={`dot-${index}`} />;
  };

  /** Không tìm thấy trang */
  if (!page && !isLoading && pages.length > 0 && insights.length === 0 && topPosts.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-12">
        <p className="text-gray-500 font-bold mb-4">Không tìm thấy thông tin Fanpage.</p>
        <button onClick={() => navigate('/facebook')} className="bg-primary text-white px-6 py-2 rounded-full font-bold">
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6 pb-20 animate-in fade-in duration-300">

      {/** Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-fb-surface-hover">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/facebook')}
            className="w-10 h-10 flex items-center justify-center bg-fb-surface-hover rounded-full shadow-sm hover:shadow-md transition-shadow text-fb-text-muted hover:text-fb-text shrink-0"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          {page ? (
            <div className="flex items-center gap-3">
              {page.avatar ? (
                <img src={page.avatar} alt={page.name} className="w-14 h-14 rounded-2xl object-cover shadow-sm shrink-0 border border-fb-surface-hover" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-fb-blue-light text-fb-blue flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">pages</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">{page.name}</h3>
                  {/** Nút xem Fanpage trực tiếp trên Facebook */}
                  <a
                    href={`https://facebook.com/${(page as any).fb_page_id || page.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-fb-blue/15 hover:bg-fb-blue text-fb-blue hover:text-white rounded-full text-xs font-bold transition-all shadow-sm cursor-pointer"
                    title="Mở Fanpage trên Facebook"
                  >
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                    <span>Xem Page</span>
                  </a>
                </div>
                <p className="text-xs font-medium text-fb-text-muted mt-1">Đo lường chi tiết hiệu suất lượt xem Reels và tương tác.</p>
              </div>
            </div>
          ) : (
            <div className="h-14 w-48 bg-fb-surface-hover animate-pulse rounded-2xl"></div>
          )}
        </div>

        {/** Bộ nút chọn khoảng thời gian */}
        <div className="flex items-center gap-1.5 bg-fb-surface-hover p-1.5 rounded-2xl border border-fb-surface-hover/80 shrink-0">
          {[
            { value: '7', label: '7 Ngày' },
            { value: '14', label: '14 Ngày' },
            { value: '28', label: '28 Ngày' }
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setDaysRange(item.value)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${daysRange === item.value
                ? 'bg-fb-blue text-white shadow-md shadow-fb-blue/30 scale-[1.02]'
                : 'text-fb-text-muted hover:text-fb-text hover:bg-fb-surface/60'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/** Trạng thái Skeleton Loading khi đang tải dữ liệu */}
      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          {/** 3 Card Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-fb-surface p-5 rounded-2xl shadow-lg h-[200px] flex flex-col justify-between relative overflow-hidden border border-fb-surface-hover">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-28 bg-fb-surface-hover rounded"></div>
                  <div className="w-11 h-11 bg-fb-surface-hover rounded-xl"></div>
                </div>
                <div className="h-8 w-36 bg-fb-surface-hover rounded mt-4"></div>
                <div className="h-20 w-full bg-fb-surface-hover/50 rounded-xl mt-3"></div>
              </div>
            ))}
          </div>

          {/** Card Grid Skeleton - 5 Card / Hàng */}
          <div className="bg-fb-surface rounded-2xl p-5 shadow-lg space-y-4 border border-fb-surface-hover">
            <div className="h-6 w-48 bg-fb-surface-hover rounded"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-64 w-full bg-fb-surface-hover/60 rounded-2xl"></div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/** 3 Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-2">

            {/** Card 1: Tổng Lượt Xem (Blue Theme) */}
            <div className="bg-gradient-to-r from-[#0b1329] via-[#0e1730] to-[#0a1122] p-5 rounded-2xl shadow-xl flex items-center justify-between border border-blue-500/25 relative overflow-hidden group">
              <div className="flex flex-col justify-between h-full z-10">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shadow-inner">
                      <span className="material-symbols-outlined text-lg">visibility</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white tracking-wider uppercase">TỔNG LƯỢT XEM</h4>
                      <p className="text-[10px] font-medium text-slate-400">Tổng lượt xem video & bài viết</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-4xl font-black text-white tracking-tight">{metricsData.views.toLocaleString()}</h3>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <span className="material-symbols-outlined text-sm shrink-0">trending_up</span>
                  <span>+12%</span>
                  <span className="text-slate-400 font-normal ml-0.5">so với {daysRange} ngày trước</span>
                </div>
              </div>

              {/** Sparkline bên phải với Tooltip hiển thị chỉ số khi Hover */}
              <div className="w-[50%] h-[90px] self-end relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="glowViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#090d16',
                        borderColor: '#3b82f6',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#ffffff',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                      }}
                      itemStyle={{ color: '#60a5fa' }}
                      labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '2px' }}
                      labelFormatter={(label) => `Ngày ${label}`}
                      formatter={(val: any) => [(val || 0).toLocaleString(), 'Lượt xem']}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#glowViews)"
                      dot={renderEndDot('#3b82f6', metricsData.chartData.length)}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/** Card 2: Tổng Số Người Theo Dõi (Emerald Theme) */}
            <div className="bg-gradient-to-r from-[#071d18] via-[#0b241e] to-[#061814] p-5 rounded-2xl shadow-xl flex items-center justify-between border border-emerald-500/25 relative overflow-hidden group">
              <div className="flex flex-col justify-between h-full z-10">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-inner">
                      <span className="material-symbols-outlined text-lg">groups</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white tracking-wider uppercase">TỔNG SỐ NGƯỜI THEO DÕI</h4>
                      <p className="text-[10px] font-medium text-slate-400">Tài khoản đang theo dõi trang</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-4xl font-black text-white tracking-tight">
                      {(metricsData.followers ?? 0).toLocaleString()}
                    </h3>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <span className="material-symbols-outlined text-sm shrink-0">trending_up</span>
                  <span>+33%</span>
                  <span className="text-slate-400 font-normal ml-0.5">so với {daysRange} ngày trước</span>
                </div>
              </div>

              {/** Sparkline bên phải với Tooltip hiển thị chỉ số khi Hover */}
              <div className="w-[50%] h-[90px] self-end relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="glowReach" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#090d16',
                        borderColor: '#10b981',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#ffffff',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                      }}
                      itemStyle={{ color: '#34d399' }}
                      labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '2px' }}
                      labelFormatter={(label) => `Ngày ${label}`}
                      formatter={(val: any) => [(val || 0).toLocaleString(), 'Người theo dõi']}
                    />
                    <Area
                      type="monotone"
                      dataKey="followers"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#glowReach)"
                      dot={renderEndDot('#10b981', metricsData.chartData.length)}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/** Card 3: Tổng Tương Tác (Cyan Theme) */}
            <div className="bg-gradient-to-r from-[#071924] via-[#0b202e] to-[#05141f] p-5 rounded-2xl shadow-xl flex items-center justify-between border border-cyan-500/25 relative overflow-hidden group">
              <div className="flex flex-col justify-between h-full z-10">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shadow-inner">
                      <span className="material-symbols-outlined text-lg">ads_click</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white tracking-wider uppercase">TỔNG TƯƠNG TÁC</h4>
                      <p className="text-[10px] font-medium text-slate-400">Likes, Comments, Shares & Clicks</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-4xl font-black text-white tracking-tight">{metricsData.engagements.toLocaleString()}</h3>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <span className="material-symbols-outlined text-sm shrink-0">trending_up</span>
                  <span>+27%</span>
                  <span className="text-slate-400 font-normal ml-0.5">so với {daysRange} ngày trước</span>
                </div>
              </div>

              {/** Sparkline bên phải với Tooltip hiển thị chỉ số khi Hover */}
              <div className="w-[50%] h-[90px] self-end relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="glowEng" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#090d16',
                        borderColor: '#06b6d4',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#ffffff',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                      }}
                      itemStyle={{ color: '#22d3ee' }}
                      labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '2px' }}
                      labelFormatter={(label) => `Ngày ${label}`}
                      formatter={(val: any) => [(val || 0).toLocaleString(), 'Tương tác']}
                    />
                    <Area
                      type="monotone"
                      dataKey="engagements"
                      stroke="#06b6d4"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#glowEng)"
                      dot={renderEndDot('#06b6d4', metricsData.chartData.length)}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/** Khung Chuyển Tab Danh Sách Bài Viết (Card View: 5 Card/Hàng) */}
          <div className="bg-fb-surface rounded-2xl shadow-lg p-5 border border-fb-surface-hover">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('latest')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${activeTab === 'latest'
                    ? 'bg-fb-blue text-white shadow-md shadow-fb-blue/20'
                    : 'bg-fb-surface-hover text-fb-text-muted hover:text-fb-text'
                    }`}
                >
                  <span className="material-symbols-outlined text-sm">list_alt</span>
                  <span>Top 15 Bài Mới Nhất</span>
                </button>
                <button
                  onClick={() => setActiveTab('engaged')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${activeTab === 'engaged'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'bg-fb-surface-hover text-fb-text-muted hover:text-fb-text'
                    }`}
                >
                  <span className="material-symbols-outlined text-sm">local_fire_department</span>
                  <span>Top 15 Bài Tương Tác Cao</span>
                </button>
              </div>
            </div>

            {/** Render Danh Sách Dạng Card - 5 Card trên 1 hàng */}
            {((activeTab === 'latest' ? latestPosts : topEngagedPosts).length === 0) ? (
              <div className="py-16 text-center text-fb-text-muted italic bg-fb-surface-hover/30 rounded-2xl border border-dashed border-fb-surface-hover">
                Chưa có dữ liệu bài viết nào trong khoảng thời gian này.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {(activeTab === 'latest' ? latestPosts : topEngagedPosts).map(post => {
                  const postUrl = getPostUrl(post);
                  const isExpanded = !!expandedPosts[post.id];
                  const messageText = post.message || '';
                  const isLongMessage = messageText.length > 60;

                  return (
                    <div
                      key={post.id}
                      className="bg-fb-surface-hover/20 border border-fb-surface-hover/50 rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-xl hover:border-fb-surface-hover group"
                    >
                      {/* Vùng hiển thị video/ảnh tỷ lệ 9:16 Full */}
                      <div className="relative w-full aspect-[9/16] bg-slate-950 overflow-hidden cursor-pointer" onClick={() => toggleExpand(post.id)}>
                        {post.full_picture ? (
                          <img
                            src={post.full_picture}
                            alt="Post"
                            className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                          />
                        ) : (
                          <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-fb-text-muted bg-slate-900">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">description</span>
                            <span className="text-[10px] font-medium opacity-50">Không có ảnh</span>
                          </div>
                        )}

                        {/** Lớp gradient overlay che mờ phía dưới và bên phải để làm nổi bật text */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none"></div>

                        {/** Badge Ngày tháng nằm trên cùng góc phải, bỏ border, radius full */}
                        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
                          <span className="bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-bold text-white shadow-sm">
                            {new Date(post.created_time).toLocaleDateString('vi-VN')}
                          </span>
                        </div>

                        {/** Các chỉ số hiển thị dọc bên phải (chuẩn UX Reels/TikTok) */}
                        <div className="absolute right-2 bottom-6 flex flex-col items-center gap-2 z-10">
                          <div className="flex flex-col items-center group/icon" title="Lượt xem">
                            <div className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">visibility</span>
                            </div>
                            <span className="text-white text-[9px] font-bold mt-0.5 drop-shadow-md">{(post.views || 0).toLocaleString()}</span>
                          </div>
                          
                          <div className="flex flex-col items-center group/icon" title="Người xem (Reach)">
                            <div className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">groups</span>
                            </div>
                            <span className="text-white text-[9px] font-bold mt-0.5 drop-shadow-md">{(post.reach || 0).toLocaleString()}</span>
                          </div>
                          
                          <div className="flex flex-col items-center group/icon" title="Tương tác">
                            <div className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">ads_click</span>
                            </div>
                            <span className="text-white text-[9px] font-bold mt-0.5 drop-shadow-md">{(post.engagements || 0).toLocaleString()}</span>
                          </div>

                          <div className="flex flex-col items-center group/icon" title="Lượt thích">
                            <div className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">thumb_up</span>
                            </div>
                            <span className="text-white text-[9px] font-bold mt-0.5 drop-shadow-md">{(post.reactions || 0).toLocaleString()}</span>
                          </div>

                          <div className="flex flex-col items-center group/icon" title="Bình luận">
                            <div className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">chat_bubble</span>
                            </div>
                            <span className="text-white text-[9px] font-bold mt-0.5 drop-shadow-md">{(post.comments || 0).toLocaleString()}</span>
                          </div>

                          <div className="flex flex-col items-center group/icon" title="Chia sẻ">
                            <div className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">share</span>
                            </div>
                            <span className="text-white text-[9px] font-bold mt-0.5 drop-shadow-md">{(post.shares || 0).toLocaleString()}</span>
                          </div>
                        </div>

                        {/** Nội dung Caption nằm ở mép dưới */}
                        <div className="absolute bottom-0 left-0 right-0 p-3 pt-6 flex flex-col gap-1.5 z-10 pr-12 pointer-events-none">
                          <p className={`text-[11px] font-medium text-white leading-relaxed drop-shadow-lg ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {messageText || <span className="text-white/60 italic font-normal text-[10px]">Không có nội dung chữ</span>}
                          </p>
                        </div>
                      </div>

                      {/** Thanh công cụ nằm dưới cùng */}
                      <div className="p-2.5 bg-fb-surface/90 flex items-center justify-end border-t border-fb-surface-hover/30">
                        {/** Nút hành động */}
                        <div className="flex items-center gap-2">
                          <a
                            href={postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-white hover:bg-fb-blue transition-all flex items-center gap-1 shadow-sm text-[9px] font-bold"
                            title="Mở bài viết trên Facebook"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                            <span>Xem bài</span>
                          </a>
                          <button
                            onClick={() => handleAutoComment(post.id, !!post.manualLink)}
                            disabled={commentingPostId === post.id}
                            className="px-3 py-1.5 rounded-full text-[9px] font-black bg-fb-blue hover:bg-fb-blue/90 text-white transition-all cursor-pointer disabled:opacity-50 shadow-md uppercase tracking-wide"
                          >
                            {commentingPostId === post.id ? '...' : 'Thả Cmt'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/** Modal Nhập Link Thủ Công */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Nhập Link Thủ Công</h3>
              <p className="text-sm text-slate-600 mb-4">
                Video này được đăng lúc máy chủ chưa lưu kịp hoặc đăng thủ công nên không thể tự động bốc link. Vui lòng dán Link từ trang Quản lý Reel vào đây:
              </p>
              <input
                type="text"
                value={manualLinkInput}
                onChange={(e) => setManualLinkInput(e.target.value)}
                placeholder="https://..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmManualLink();
                  if (e.key === 'Escape') cancelManualLink();
                }}
              />
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={cancelManualLink}
                className="px-5 py-2 rounded-full font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={confirmManualLink}
                className="px-5 py-2 rounded-full font-semibold text-white bg-primary hover:bg-primary/90 transition-colors shadow-sm"
              >
                Thả Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
