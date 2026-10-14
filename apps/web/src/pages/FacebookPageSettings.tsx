import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useWordpressStore } from '../stores/wordpressStore';
import { useUIStore } from '../stores/uiStore';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import CustomDropdown from '../components/CustomDropdown';
import ZTTeamAIPostCard from '../components/AIPostCard';

export default function FacebookPageSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const { sites, ztteam_fetchSites, ztteam_fetchCategories, ztteam_fetchTags } = useWordpressStore();
  const { pages, ztteam_fetchPagesFromDB } = useZTTeamFacebookStore();

  /** Main 2-Tab Navigation State */
  const [activeTab, setActiveTab] = useState<number>(() => {
    const hashMatch = window.location.hash.match(/tab=(\d+)/);
    return hashMatch ? parseInt(hashMatch[1], 10) : 1;
  });

  useEffect(() => {
    window.history.replaceState(null, '', `#tab=${activeTab}`);
  }, [activeTab]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /** Fanpage Info State */
  const [pageName, setPageName] = useState('');
  const [fbPageId, setFbPageId] = useState('');
  const [pageAvatar, setPageAvatar] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  /** Publishing & Schedule Config State */
  const [postFormat, setPostFormat] = useState('image');
  const [videoEngine, setVideoEngine] = useState('hook_image');
  const [defaultBgm, setDefaultBgm] = useState<string>('');
  const [bgmList, setBgmList] = useState<any[]>([]);
  const [currentPlayingBgm, setCurrentPlayingBgm] = useState<string | null>(null);
  const [bgmAudio, setBgmAudio] = useState<HTMLAudioElement | null>(null);
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(true);
  const [addLinkToCaption, setAddLinkToCaption] = useState(false);
  const [addLinkToComment, setAddLinkToComment] = useState(false);
  const [scheduleMode, setScheduleMode] = useState('fixed');
  const [scheduleFixedTimes, setScheduleFixedTimes] = useState<string[]>([]);
  const [timeInput, setTimeInput] = useState('');
  const [scheduleImmediateGap, setScheduleImmediateGap] = useState(60);

  /** Auto Crawl & AI Generation Config State */
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(2);
  const [autoScanBatchSize, setAutoScanBatchSize] = useState(1);
  const [autoQueueLimit, setAutoQueueLimit] = useState(3);
  const [autoMaxPostAgeDays, setAutoMaxPostAgeDays] = useState(1);

  /** Sources State */
  const [sources, setSources] = useState<any[]>([]);
  const [sourceCategoriesCache, setSourceCategoriesCache] = useState<Record<string, any[]>>({});
  const [sourceTagsCache, setSourceTagsCache] = useState<Record<string, any[]>>({});

  /** Scheduler Timers */
  const [lastRenderTime, setLastRenderTime] = useState<string | null>(null);
  const [nextRenderTime, setNextRenderTime] = useState<string | null>(null);
  const [lastPublishTime, setLastPublishTime] = useState<string | null>(null);
  const [nextPublishTime, setNextPublishTime] = useState<string | null>(null);

  /** Queue & History State */
  const [imagesQueue, setImagesQueue] = useState<any[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isPosting, setIsPosting] = useState<Record<string, boolean>>({});

  /** Filter items for Queue and History tabs */
  const queueItems = useMemo(() => {
    return imagesQueue.filter(item => !item.is_posted && item.status !== 'POSTED');
  }, [imagesQueue]);

  const historyItems = useMemo(() => {
    return imagesQueue.filter(item => item.is_posted || item.status === 'POSTED');
  }, [imagesQueue]);

  /** Initial Fetch */
  useEffect(() => {
    ztteam_fetchSites();
    ztteam_fetchSettings();
    api.get('facebook/pages').then(res => {
      const allTags = new Set<string>();
      if (res.data && Array.isArray(res.data)) {
        res.data.forEach((p: any) => {
          if (p.tags && Array.isArray(p.tags)) {
            p.tags.forEach((t: string) => allTags.add(t));
          }
        });
      }
      setAvailableTags(Array.from(allTags));
    }).catch(console.error);

    if (pages.length === 0) {
      ztteam_fetchPagesFromDB();
    }
    ztteam_loadBgmList();
  }, [id]);

  /** Tải danh sách file nhạc BGM */
  const ztteam_loadBgmList = async () => {
    try {
      const res = await api.get('media/bgm');
      if (res.data?.success && Array.isArray(res.data?.data)) {
        setBgmList(res.data.data);
      }
    } catch (e) {
      /** Bỏ qua nếu lỗi */
    }
  };

  /** Nghe thử / Dừng phát bài hát */
  const ztteam_togglePlayBgm = (url: string, filename: string) => {
    if (currentPlayingBgm === filename && bgmAudio) {
      bgmAudio.pause();
      setCurrentPlayingBgm(null);
      setBgmAudio(null);
      return;
    }

    if (bgmAudio) {
      bgmAudio.pause();
    }

    const audio = new Audio(url);
    audio.play();
    audio.onended = () => {
      setCurrentPlayingBgm(null);
      setBgmAudio(null);
    };
    setBgmAudio(audio);
    setCurrentPlayingBgm(filename);
  };

  /** Tải file âm thanh mới nhanh */
  const ztteam_uploadQuickBgm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingBgm(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('media/bgm/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        ztteam_showToast('Tải bài nhạc mới lên thành công!', 'success');
        await ztteam_loadBgmList();
        if (res.data.data?.filename) {
          setDefaultBgm(res.data.data.filename);
        }
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || 'Lỗi tải file âm thanh', 'error');
    } finally {
      setIsUploadingBgm(false);
      e.target.value = '';
    }
  };

  /** Load Queue on Tab 2 (Hàng Đợi) or Tab 3 (Lịch Sử) */
  useEffect(() => {
    if (activeTab === 2 || activeTab === 3) {
      ztteam_loadQueue();
    }
  }, [activeTab, id]);

  /** SSE Live Updates for Tab 2 & Tab 3 */
  useEffect(() => {
    if (activeTab !== 2 && activeTab !== 3) return;

    const sseImage = new EventSource('/api/image/events');
    sseImage.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setImagesQueue(prev => {
          const exists = prev.find(r => r.id === payload.id);
          if (exists) {
            return prev.map(r => r.id === payload.id ? { ...r, ...payload } : r);
          }
          return [payload, ...prev];
        });
      } catch (err) { }
    };

    const sseReel = new EventSource('/api/render/events');
    sseReel.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setReels(prev => {
          const exists = prev.find(r => r.id === payload.id);
          if (exists) {
            return prev.map(r => r.id === payload.id ? { ...r, ...payload } : r);
          }
          return [payload, ...prev];
        });
      } catch (err) { }
    };

    const pollInterval = setInterval(() => {
      if (activeTab === 2) {
        ztteam_loadQueue(true);
      }
    }, 4000);

    return () => {
      sseImage.close();
      sseReel.close();
      clearInterval(pollInterval);
    };
  }, [activeTab]);

  /** Fetch Page Settings */
  const ztteam_fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await api.get(`facebook/pages/${id}/settings?_t=${Date.now()}`);
      const data = res.data;
      setPageName(data.name || 'Fanpage Settings');
      setFbPageId(data.fb_page_id || '');
      setPageAvatar(data.avatar || null);
      setTags(data.tags || []);
      setPostFormat(data.post_format || 'image');
      setVideoEngine(data.video_engine || 'hook_image');
      setDefaultBgm(data.default_bgm || '');
      setAutoPublishEnabled(data.auto_publish_enabled !== undefined ? data.auto_publish_enabled : true);
      setAddLinkToCaption(data.add_link_to_caption || false);
      setAddLinkToComment(data.add_link_to_comment || false);
      setScheduleMode(data.schedule_mode || 'fixed');
      setScheduleFixedTimes(data.schedule_fixed_times || []);
      setScheduleImmediateGap(data.schedule_immediate_gap_minutes || 60);

      setAutoCreateEnabled(data.auto_create_enabled || false);
      setAutoScanInterval(data.auto_scan_interval_hours || 2);
      setAutoScanBatchSize(data.auto_scan_batch_size || 1);
      setAutoQueueLimit(data.auto_queue_limit || 3);
      setAutoMaxPostAgeDays(data.auto_max_post_age_days || 1);

      setLastRenderTime(data.last_render_time || null);
      setNextRenderTime(data.next_render_time || null);
      setLastPublishTime(data.last_publish_time || null);
      setNextPublishTime(data.next_publish_time || null);

      setSources(data.sources || []);

      if (data.sources) {
        data.sources.forEach((s: any) => {
          if (s.target_site_id && !sourceCategoriesCache[s.target_site_id]) {
            ztteam_loadCategories(s.target_site_id);
          }
          if (s.target_site_id && !sourceTagsCache[s.target_site_id]) {
            ztteam_loadTags(s.target_site_id);
          }
        });
      }
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi tải cấu hình', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const ztteam_loadCategories = async (siteId: string) => {
    try {
      const cats = await ztteam_fetchCategories(siteId);
      setSourceCategoriesCache(prev => ({ ...prev, [siteId]: cats }));
    } catch (e) {
      console.error(e);
    }
  };

  const ztteam_loadTags = async (siteId: string) => {
    try {
      const tagsData = await ztteam_fetchTags(siteId);
      setSourceTagsCache(prev => ({ ...prev, [siteId]: tagsData }));
    } catch (e) {
      console.error(e);
    }
  };

  /** Fetch Queue Data */
  const ztteam_loadQueue = async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoadingQueue(true);
      const imgRes = await api.get(`image/list?fbPageId=${id}&limit=50&_t=${Date.now()}`);
      setImagesQueue(imgRes.data?.data || []);
    } catch (error: any) {
      if (!isSilent) ztteam_showToast('Lỗi tải danh sách bài viết', 'error');
    } finally {
      if (!isSilent) setIsLoadingQueue(false);
    }
  };

  /** Save Settings */
  const ztteam_handleSave = async () => {
    try {
      setIsSaving(true);
      await api.put(`facebook/pages/${id}/settings`, {
        tags,
        post_format: postFormat,
        video_engine: videoEngine,
        default_bgm: defaultBgm || null,
        auto_publish_enabled: autoPublishEnabled,
        add_link_to_caption: false,
        add_link_to_comment: false,
        schedule_mode: scheduleMode,
        schedule_fixed_times: scheduleFixedTimes,
        schedule_immediate_gap_minutes: scheduleImmediateGap,
        auto_create_enabled: false,
        sources
      });
      ztteam_showToast('Đã lưu cấu hình thành công', 'success');
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi lưu cấu hình', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /** Tag & Time Handlers */
  const ztteam_addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const ztteam_addTime = () => {
    if (timeInput.trim() && !scheduleFixedTimes.includes(timeInput.trim())) {
      setScheduleFixedTimes([...scheduleFixedTimes, timeInput.trim()]);
      setTimeInput('');
    }
  };

  /** Cross-page fixed time duplicate detection */
  const usedTimes = new Set<string>();
  pages.forEach(p => {
    if (p.id !== id && p.scheduleFixedTimes) {
      p.scheduleFixedTimes.forEach((t: string) => usedTimes.add(t));
    }
  });

  const predefinedSchedules = [
    { label: 'Khung 1 (08h, 16h, 00h)', times: ['08:00', '16:00', '00:00'] },
    { label: 'Khung 2 (09h, 17h, 01h)', times: ['09:00', '17:00', '01:00'] },
    { label: 'Khung 3 (10h, 18h, 02h)', times: ['10:00', '18:00', '02:00'] },
    { label: 'Khung 4 (11h, 19h, 03h)', times: ['11:00', '19:00', '03:00'] },
    { label: 'Khung 5 (06h, 14h, 22h)', times: ['06:00', '14:00', '22:00'] },
    { label: 'Khung 6 (07h, 15h, 23h)', times: ['07:00', '15:00', '23:00'] },
  ];

  const predefined5PostsSchedules = [
    { label: 'Gói Vàng 5 Bài (07h30, 11h30, 15h30, 19h30, 22h30)', times: ['07:30', '11:30', '15:30', '19:30', '22:30'] },
    { label: 'Gói Trải Đều (08h, 12h, 16h, 20h, 23h30)', times: ['08:00', '12:00', '16:00', '20:00', '23:30'] },
    { label: 'Gói Cao Điểm (07h, 11h, 15h, 19h, 23h)', times: ['07:00', '11:00', '15:00', '19:00', '23:00'] },
  ];

  /** Publish Item Immediately */
  const ztteam_publishNow = async (item: any) => {
    const confirmed = await ztteam_showConfirm('Xác nhận đăng bài', `Đăng ngay nội dung "${item.wp_post_title || 'bài viết'}" lên Fanpage?`);
    if (!confirmed) return;
    try {
      setIsPosting(prev => ({ ...prev, [item.id]: true }));
      await api.post(`image/${item.id}/post-to-fb`);
      ztteam_showToast('Đã đăng bài lên Fanpage thành công!', 'success');
      ztteam_loadQueue(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || error.message || 'Lỗi đăng bài lên Fanpage', 'error');
    } finally {
      setIsPosting(prev => ({ ...prev, [item.id]: false }));
    }
  };

  /** Retry Item / Làm mới khung giờ xuất bản */
  const ztteam_retryQueueItem = async (item: any) => {
    try {
      const res = await api.post(`image/retry/${item.id}`);
      ztteam_showToast(res.data?.message || 'Đã làm mới lại khung giờ xuất bản (giữ nguyên ảnh)', 'success');
      ztteam_loadQueue();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi thử lại', 'error');
    }
  };

  /** Delete Item */
  const ztteam_deleteQueueItem = async (item: any) => {
    const confirmed = await ztteam_showConfirm('Xác nhận xóa', 'Xóa mục này khỏi hàng đợi? Hành động không thể hoàn tác.');
    if (!confirmed) return;
    try {
      await api.delete(`image/${item.id}`);
      ztteam_showToast('Đã xóa thành công', 'success');
      ztteam_loadQueue();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi xóa', 'error');
    }
  };

  /** Lấy ảnh gốc từ website làm chuẩn để tạo Video Reel */
  const ztteam_useOriginalImage = async (item: any) => {
    try {
      const res = await api.post(`image/${item.id}/use-original-image`);
      ztteam_showToast(res.data?.message || 'Đã lấy ảnh gốc thành công và đưa vào hàng đợi tạo Video Reel', 'success');
      ztteam_loadQueue(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi lấy ảnh gốc', 'error');
    }
  };

  /** Đưa bài viết vào hàng đợi tạo Video Reel qua Muse Worker */
  const ztteam_queueVideoReel = async (item: any) => {
    try {
      const res = await api.post(`image/${item.id}/queue-video`);
      ztteam_showToast(res.data?.message || 'Đã đưa vào hàng đợi tạo Video Reel cho Worker', 'success');
      ztteam_loadQueue(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi đưa vào hàng đợi tạo Reel', 'error');
    }
  };

  /** Status Badge Helper */
  const ztteam_getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; border: string; label: string; pulse?: boolean }> = {
      QUEUED: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Đang chờ' },
      RENDERING: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20', label: 'Đang xử lý AI', pulse: true },
      PROCESSING: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20', label: 'Đang tạo ảnh', pulse: true },
      COMPLETED: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Sẵn sàng đăng' },
      FAILED: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/20', label: 'Thất bại' },
      POSTED: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Đã xuất bản' },
    };
    const s = map[status] || { bg: 'bg-fb-surface-hover', text: 'text-fb-text-muted', border: 'border-white/5', label: status };
    return (
      <span className={`${s.bg} ${s.text} ${s.border} border text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-xs`}>
        {s.pulse && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>}
        {s.label}
      </span>
    );
  };

  const ztteam_formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">sync</span>
        <span className="text-sm font-bold text-fb-text-muted">Đang tải cấu hình Fanpage...</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/** Top Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-fb-surface-hover/50">
        <div className="flex items-center gap-4">
          {pageAvatar ? (
            <img src={pageAvatar} alt={pageName} className="w-14 h-14 rounded-full object-cover shadow-lg shadow-blue-500/20 shrink-0 border-2 border-fb-blue" />
          ) : (
            <div className="w-14 h-14 bg-gradient-to-br from-fb-blue to-cyan-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-black text-2xl shrink-0">
              {pageName ? pageName.charAt(0) : 'F'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate('/facebook')} className="text-fb-text-muted hover:text-fb-blue flex items-center gap-1 text-xs font-bold transition-colors">
                <span className="material-symbols-outlined text-[14px]">arrow_back</span> Quay lại danh sách
              </button>
            </div>
            <h3 className="text-2xl font-black text-fb-text tracking-tight flex items-center gap-3">
              {pageName}
              {fbPageId && (
                <a href={`https://facebook.com/${fbPageId}`} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1 bg-fb-blue/10 text-fb-blue border border-fb-blue/20 rounded-full hover:bg-fb-blue/20 flex items-center gap-1 font-semibold transition-colors">
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span> Xem Fanpage
                </a>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-fb-text-muted">ID: {fbPageId}</span>
              {pages.find(p => p.id === id || p.internalId === id)?.businessName && (
                <span 
                  onClick={() => navigate('/facebook/business-hub')}
                  className="cursor-pointer px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1 hover:bg-blue-500/25 transition-colors"
                  title="Bấm để xem chi tiết Doanh Nghiệp trong Hub"
                >
                  <span className="material-symbols-outlined text-xs">domain</span>
                  <span>Thuộc BM: {pages.find(p => p.id === id || p.internalId === id)?.businessName}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 self-start md:self-auto w-full md:w-auto">
          {/** Tags */}
          <div className="flex items-center gap-2 bg-fb-surface-hover/30 px-3 py-1.5 rounded-xl border border-fb-surface-hover/50 w-full sm:w-auto">
            <span className="material-symbols-outlined text-[16px] text-fb-text-muted">label</span>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ztteam_addTag()}
              placeholder="Thêm tag..."
              list="available-tags"
              className="w-24 bg-transparent border-none focus:ring-0 text-xs outline-none text-fb-text"
            />
            <datalist id="available-tags">{availableTags.map(t => <option key={t} value={t} />)}</datalist>
            <div className="flex flex-wrap gap-1 ml-2">
              {tags.map(t => (
                <span key={t} className="px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold flex items-center gap-1">
                  {t}
                  <span onClick={() => setTags(tags.filter(x => x !== t))} className="material-symbols-outlined text-[12px] cursor-pointer hover:text-rose-400">close</span>
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={ztteam_handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-90 text-white font-bold rounded-full shadow-lg shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap w-full sm:w-auto"
          >
            {isSaving ? <span className="material-symbols-outlined animate-spin text-[20px]">sync</span> : <span className="material-symbols-outlined text-[20px]">save</span>}
            Lưu Thay Đổi
          </button>
        </div>
      </div>

      {/** Clean 2-Tab Navigation Bar */}
      <div className="flex border-b border-fb-surface-hover/60 bg-fb-surface px-4 pt-2 rounded-2xl shadow-sm gap-2">
        <button
          onClick={() => setActiveTab(1)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all ${
            activeTab === 1
              ? 'border-fb-blue text-fb-blue bg-fb-blue/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          1. Cấu Hình Lịch & Đăng Bài
        </button>

        <button
          onClick={() => setActiveTab(2)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all cursor-pointer ${
            activeTab === 2
              ? 'border-amber-400 text-amber-400 bg-amber-400/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">pending_actions</span>
          2. Hàng Đợi Xuất Bản
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            activeTab === 2 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-fb-surface-hover text-fb-text border-white/5'
          }`}>
            {queueItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab(3)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all cursor-pointer ${
            activeTab === 3
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">history</span>
          3. Lịch Sử Đã Đăng
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            activeTab === 3 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-fb-surface-hover text-fb-text border-white/5'
          }`}>
            {historyItems.length}
          </span>
        </button>
      </div>

      {/** TAB 1: CẤU HÌNH LỊCH & ĐĂNG BÀI */}
      {activeTab === 1 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/** Card 1: Kiểu bài & Tùy chọn */}
            <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-fb-blue text-[22px]">category</span>
                  <div>
                    <h4 className="text-base font-black text-fb-text">Định Dạng & Tùy Chọn Xuất Bản</h4>
                    <p className="text-[11px] text-fb-text-muted mt-0.5">Thiết lập cách bài viết được hiển thị và xuất bản lên Fanpage</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-fb-surface-hover/40 px-3 py-1.5 rounded-xl border border-fb-surface-hover/50 shrink-0">
                  <span className="text-xs font-bold text-fb-text">Tự động đăng:</span>
                  <button
                    onClick={() => setAutoPublishEnabled(!autoPublishEnabled)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                      autoPublishEnabled ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoPublishEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="bg-fb-surface-hover/20 p-3 rounded-xl border border-fb-surface-hover/40 text-[11px] text-fb-text-muted">
                <strong className="text-fb-text font-bold">Chế độ tự động đăng: </strong>
                {autoPublishEnabled 
                  ? 'BẬT — Các bài viết trong hàng đợi sẽ được tự động xuất bản lên Facebook đúng theo lịch trình ở cột bên phải.'
                  : 'TẮT — Bài viết hoàn thành sẽ ở trạng thái Sẵn sàng trong hàng đợi để bạn kiểm tra và duyệt đăng thủ công.'
                }
              </div>

              <div>
                <label className="block text-xs font-bold text-fb-text-muted uppercase mb-2">Kiểu bài đăng chính trên Fanpage</label>
                <CustomDropdown
                  value={postFormat}
                  onChange={setPostFormat}
                  options={[
                    { value: 'image', label: 'Đăng Ảnh 2K (Bài viết Facebook kèm ảnh AI 2K)' },
                    { value: 'reel', label: 'Đăng Video (Reels Facebook)' },
                    { value: 'mixed', label: 'Xen kẽ (Tự động luân phiên Ảnh 2K & Reel)' }
                  ]}
                />
                <p className="text-[11px] text-fb-text-muted mt-2">
                  {postFormat === 'image' && 'Chuẩn định dạng: Tiêu đề VIẾT HOA + Hook Part 1 kịch tính + Ảnh AI 2K tỉ lệ 4:5 chân thực, sắc nét.'}
                  {postFormat === 'reel' && 'Tạo video ngắn Reel 9:16 sắc nét kèm âm nhạc và đăng lên Reels tab.'}
                  {postFormat === 'mixed' && 'Tự động luân phiên giữa bài viết ảnh 2K và video Reel theo lịch đăng.'}
                </p>
              </div>

              {/** Tùy chọn Công nghệ Video Reel & Nhạc nền BGM (Hiển thị khi đăng Reel hoặc Xen kẽ) */}
              {(postFormat === 'reel' || postFormat === 'mixed') && (
                <div className="bg-fb-surface-hover/30 p-4 rounded-2xl border border-amber-500/20 space-y-4 animate-in fade-in duration-200">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">movie_filter</span>
                        Công nghệ tạo Video Reel
                      </label>
                      <span className="text-[10px] text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        Chuẩn Sắc Nét 2K
                      </span>
                    </div>
                    <CustomDropdown
                      value={videoEngine}
                      onChange={setVideoEngine}
                      options={[
                        { value: 'hook_image', label: 'Tạo từ Ảnh Hook & Âm Nhạc (Sắc nét 1080x1920 10s - Mặc định)' },
                        { value: 'muse', label: 'Tạo bằng Motion AI (Muse Motion Reel)' }
                      ]}
                    />
                    <p className="text-[11px] text-fb-text-muted mt-1.5 leading-relaxed">
                      {videoEngine === 'hook_image' 
                        ? 'Tự động sử dụng ảnh 2K kết hợp kịch bản Hook 3 đoạn kịch tính do AI tạo bám sát bài viết gốc, font Montserrat và hòa âm nhạc nền 10s cực nét.'
                        : 'Đưa bài viết vào hàng đợi để Worker ngoài xử lý chuyển động bằng Muse Motion AI.'
                      }
                    </p>
                  </div>

                  {/** Nhạc nền Reel (BGM) */}
                  <div className="pt-2 border-t border-fb-surface-hover/50">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-fb-text uppercase tracking-wide flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-cyan-400">library_music</span>
                        Nhạc Nền Video Reel (BGM)
                      </label>
                      <label className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">{isUploadingBgm ? 'sync' : 'upload_file'}</span>
                        <span>{isUploadingBgm ? 'Đang tải...' : '+ Tải nhạc mới'}</span>
                        <input
                          type="file"
                          accept="audio/mp3,audio/wav,audio/m4a,audio/aac"
                          className="hidden"
                          onChange={ztteam_uploadQuickBgm}
                          disabled={isUploadingBgm}
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomDropdown
                          value={defaultBgm}
                          onChange={setDefaultBgm}
                          options={[
                            { value: '', label: '🎵 Ngẫu nhiên từ Thư Viện Âm Thanh (Khuyên dùng)' },
                            ...bgmList.map(b => ({
                              value: b.filename,
                              label: `🎵 ${b.name} (${b.size_formatted})`
                            }))
                          ]}
                        />
                      </div>

                      {defaultBgm && (
                        <button
                          type="button"
                          onClick={() => {
                            const found = bgmList.find(b => b.filename === defaultBgm);
                            if (found) ztteam_togglePlayBgm(found.url, found.filename);
                          }}
                          className={`p-2.5 rounded-xl border transition-all shrink-0 flex items-center justify-center ${
                            currentPlayingBgm === defaultBgm
                              ? 'bg-amber-400 text-black border-amber-400 shadow-md shadow-amber-400/20'
                              : 'bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text border-white/5'
                          }`}
                          title={currentPlayingBgm === defaultBgm ? 'Dừng nghe thử' : 'Nghe thử bản nhạc này'}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {currentPlayingBgm === defaultBgm ? 'pause' : 'play_arrow'}
                          </span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-fb-text-muted mt-1.5">
                      Bản nhạc được chọn sẽ tự động phối âm vào Video Hook 10s với hiệu ứng fade-in mở đầu và fade-out kết thúc chuẩn điện ảnh.
                    </p>
                  </div>
                </div>
              )}

              {/** Cơ chế điều hướng Link & Tương tác thông minh 2 bước */}
              <div className="pt-2">
                <div className="bg-fb-surface-hover/30 p-4 rounded-2xl border border-fb-blue/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-cyan-400 text-[18px]">verified</span>
                      <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Cơ chế điều hướng Link & Tương tác 2 bước</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Tự động 100%
                    </span>
                  </div>

                  <div className="space-y-2 text-[11px] text-fb-text-muted leading-relaxed">
                    <div className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5">
                      <span className="material-symbols-outlined text-cyan-400 text-[16px] mt-0.5 shrink-0">check_circle</span>
                      <div>
                        <strong className="text-fb-text block">Caption sạch — Tránh bị Facebook bóp tương tác:</strong>
                        <span>Không chèn link trực tiếp vào Caption. Hệ thống tự động gắn câu kết chuẩn: <code>...FULL STORY IN THE COMMENT 👇👇👇</code></span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5">
                      <span className="material-symbols-outlined text-emerald-400 text-[16px] mt-0.5 shrink-0">mark_chat_read</span>
                      <div>
                        <strong className="text-fb-text block">Quy trình Bình luận 2 bước tối ưu Reach:</strong>
                        <span><strong>Sau 60 phút:</strong> Tự động thả bình luận mồi câu "YES" kích hoạt thuật toán; <strong>Sau 15 phút tiếp theo:</strong> Tự động reply vào bình luận mồi kèm Part 2 và link website WordPress.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/** Card 2: Nguồn Website WordPress Liên Kết */}
            <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[22px]">language</span>
                  <div>
                    <h4 className="text-base font-black text-fb-text">Nguồn Website WordPress & Chuyên Mục</h4>
                    <p className="text-[11px] text-fb-text-muted mt-0.5">Liên kết Fanpage với Website WP và Chuyên mục bài viết tương ứng</p>
                  </div>
                </div>
                <button
                  onClick={() => setSources([...sources, { target_site_id: '', target_category_id: '', target_tags: '', is_active: true }])}
                  className="px-3 py-1.5 bg-fb-blue/15 text-fb-blue hover:bg-fb-blue/25 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span> Thêm nguồn
                </button>
              </div>

              <div className="bg-fb-surface-hover/20 p-3 rounded-xl border border-fb-surface-hover/40 text-[11px] text-fb-text-muted leading-relaxed">
                <span className="material-symbols-outlined text-[14px] text-amber-400 align-middle mr-1">info</span>
                Khi bot cào bài viết mới từ menu <strong>Website (/crawl-sources)</strong> vào Website và Chuyên mục này, bài viết kèm ảnh AI 2K sẽ tự động đưa vào hàng đợi của Fanpage này để xuất bản. Một Website có thể dùng cho nhiều Fanpage khác nhau theo từng chuyên mục riêng.
              </div>

              <div className="space-y-3">
                {sources.map((src, index) => (
                  <div key={index} className="bg-fb-surface-hover/40 p-4 rounded-xl border border-fb-surface-hover/50 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <div className="flex-1 w-full sm:max-w-xs">
                        <CustomDropdown
                          value={src.target_site_id}
                          onChange={v => {
                            const newSites = [...sources];
                            newSites[index].target_site_id = v;
                            newSites[index].target_category_id = '';
                            newSites[index].target_tags = '';
                            setSources(newSites);
                            if (v && !sourceCategoriesCache[v]) ztteam_loadCategories(v);
                            if (v && !sourceTagsCache[v]) ztteam_loadTags(v);
                          }}
                          options={[{ value: '', label: '-- Chọn Website WP --' }, ...sites.map(s => ({ value: s.id, label: s.wp_url }))]}
                        />
                      </div>
                      <div className="flex items-center gap-3 ml-auto shrink-0">
                        <button
                          onClick={() => {
                            const newSites = [...sources];
                            newSites[index].is_active = !newSites[index].is_active;
                            setSources(newSites);
                          }}
                          className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                            src.is_active ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${src.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                        <button
                          onClick={() => setSources(sources.filter((_, i) => i !== index))}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">Chuyên mục WordPress liên kết</label>
                        <CustomDropdown
                          value={src.target_category_id ? String(src.target_category_id) : ''}
                          onChange={v => {
                            const newSites = [...sources];
                            newSites[index].target_category_id = v ? String(v) : '';
                            setSources(newSites);
                          }}
                          options={[{ value: '', label: 'Tất cả chuyên mục (Nhận toàn bộ bài)' }, ...(sourceCategoriesCache[src.target_site_id] || []).map(c => ({ value: String(c.id), label: c.name }))]}
                          disabled={!src.target_site_id}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">Thẻ (Tag) lọc bài viết (tùy chọn)</label>
                        <CustomDropdown
                          value={src.target_tags ? String(src.target_tags) : ''}
                          onChange={v => {
                            const newSites = [...sources];
                            newSites[index].target_tags = v ? String(v) : '';
                            setSources(newSites);
                          }}
                          options={[{ value: '', label: 'Tất cả Thẻ (Tag)' }, ...(sourceTagsCache[src.target_site_id] || []).map(t => ({ value: String(t.id), label: t.name }))]}
                          disabled={!src.target_site_id}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {sources.length === 0 && (
                  <p className="text-xs text-fb-text-muted italic text-center py-4 bg-fb-surface-hover/20 rounded-xl border border-dashed border-fb-surface-hover/50">
                    Chưa cấu hình nguồn Website WordPress. Vui lòng bấm "Thêm nguồn" ở trên để chọn Website và Chuyên mục cho Fanpage.
                  </p>
                )}
              </div>
            </div>

            {/** Card 3: Lịch Trình Xuất Bản */}
            <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-[22px]">schedule</span>
                  <h4 className="text-base font-black text-fb-text">Lịch Trình Xuất Bản Bài Đăng</h4>
                </div>
                <span className="text-xs text-fb-text-muted font-bold">Lên lịch tự động</span>
              </div>

              {/** Schedule Mode Tabs */}
              <div className="flex gap-2 bg-fb-surface-hover/30 rounded-xl p-1 border border-fb-surface-hover/50">
                <button
                  onClick={() => setScheduleMode('fixed')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    scheduleMode === 'fixed'
                      ? 'bg-fb-surface text-fb-text shadow-sm border border-fb-surface-hover'
                      : 'text-fb-text-muted hover:text-fb-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  Giờ cố định trong ngày
                </button>
                <button
                  onClick={() => setScheduleMode('immediate')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    scheduleMode === 'immediate'
                      ? 'bg-fb-surface text-fb-text shadow-sm border border-fb-surface-hover'
                      : 'text-fb-text-muted hover:text-fb-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                  Đăng nối tiếp (giãn cách)
                </button>
              </div>

              {scheduleMode === 'fixed' ? (
                <div className="space-y-4">
                  {/** Quick Predefined Schedules: 5 bài/ngày (Khuyên dùng) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                        <span>Khuyên dùng: Gói 5 bài / ngày (Tối ưu tương tác & Tiết kiệm API AI)</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Cách nhau ~4h</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {predefined5PostsSchedules.map((ps, idx) => (
                        <button
                          key={`5p-${idx}`}
                          type="button"
                          onClick={() => {
                            const hasConflict = ps.times.some(t => usedTimes.has(t));
                            if (hasConflict) {
                              ztteam_showToast('Có khung giờ trong gói này trùng với Fanpage khác!', 'error');
                            }
                            setScheduleFixedTimes(ps.times);
                            ztteam_showToast(`Đã áp dụng ${ps.label}`, 'success');
                          }}
                          className="px-3 py-2.5 bg-gradient-to-r from-fb-blue/15 to-cyan-500/15 hover:from-fb-blue/25 hover:to-cyan-500/25 text-fb-text rounded-xl border border-cyan-500/30 text-[11px] font-bold transition-all text-left shadow-sm cursor-pointer"
                        >
                          <span className="block text-[10px] text-cyan-300 font-bold">{ps.label}</span>
                          <span className="text-white font-black block mt-0.5">{ps.times.join(' - ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/** Quick Predefined Schedules: 3 bài/ngày */}
                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-2">Hoặc chọn gói 3 bài / ngày:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {predefinedSchedules.map((ps, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const hasConflict = ps.times.some(t => usedTimes.has(t));
                            if (hasConflict) {
                              ztteam_showToast('Có khung giờ trong gói này trùng với Fanpage khác!', 'error');
                            }
                            setScheduleFixedTimes(ps.times);
                          }}
                          className="px-2.5 py-2 bg-fb-surface-hover/40 hover:bg-fb-blue/15 hover:text-fb-blue text-fb-text rounded-xl border border-fb-surface-hover/60 text-[11px] font-bold transition-colors text-left"
                        >
                          <span className="block text-[10px] text-fb-text-muted">{ps.label}</span>
                          <span className="text-fb-text font-black">{ps.times.join(' - ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/** Custom Time Input */}
                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1.5">Hoặc thêm giờ thủ công:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={timeInput}
                        onChange={e => setTimeInput(e.target.value)}
                        className="w-32 bg-fb-surface border border-fb-surface-hover/60 focus:ring-1 focus:ring-fb-blue rounded-xl px-3 py-2 text-xs outline-none text-fb-text font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (timeInput.trim() && usedTimes.has(timeInput.trim())) {
                            ztteam_showToast(`Giờ ${timeInput} đã được dùng ở Fanpage khác!`, 'error');
                            return;
                          }
                          ztteam_addTime();
                        }}
                        className="px-4 py-2 bg-fb-blue/15 text-fb-blue font-bold rounded-xl text-xs hover:bg-fb-blue/25 transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">add_circle</span> Thêm Giờ
                      </button>
                    </div>
                  </div>

                  {/** Active Times Badges */}
                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-2">Các khung giờ đang thiết lập ({scheduleFixedTimes.length}):</label>
                    <div className="flex flex-wrap gap-2">
                      {scheduleFixedTimes.map(t => (
                        <span
                          key={t}
                          className={`px-3 py-1.5 text-xs font-black flex items-center gap-2 rounded-xl border ${
                            usedTimes.has(t)
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-fb-blue/10 text-fb-blue border-fb-blue/25 shadow-xs'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">alarm</span>
                          {t} {usedTimes.has(t) && '(Trùng FP khác)'}
                          <span
                            onClick={() => setScheduleFixedTimes(scheduleFixedTimes.filter(x => x !== t))}
                            className="material-symbols-outlined text-[14px] cursor-pointer hover:text-rose-400"
                          >
                            close
                          </span>
                        </span>
                      ))}
                    </div>

                    {scheduleFixedTimes.length === 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl flex items-center gap-2.5 text-amber-400 text-xs mt-2">
                        <span className="material-symbols-outlined text-[20px] shrink-0">warning</span>
                        <span>Chưa thiết lập khung giờ nào! Bài viết hoàn thành sẽ ở hàng đợi và không tự xuất bản lên Facebook. Hãy chọn khung giờ nhanh ở trên.</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-fb-text-muted uppercase mb-2">Khoảng cách giữa 2 bài xuất bản (Phút)</label>
                    <input
                      type="number"
                      min="10"
                      value={scheduleImmediateGap}
                      onChange={e => setScheduleImmediateGap(parseInt(e.target.value) || 60)}
                      className="w-full max-w-[240px] bg-fb-surface border border-fb-surface-hover/60 focus:ring-1 focus:ring-fb-blue rounded-xl px-4 py-2.5 text-sm outline-none text-fb-text font-bold"
                    />
                    <p className="text-[11px] text-fb-text-muted mt-2">Ví dụ đặt 60 phút: Sau khi bài trước được đăng, bài tiếp theo trong hàng đợi sẽ tự động đăng sau 60 phút.</p>
                  </div>
                </div>
              )}

              {/** Publishing Timers Status */}
              <div className="pt-4 border-t border-fb-surface-hover/50 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-fb-text-muted">Lần xuất bản gần nhất:</span>
                  <strong className="text-fb-text font-bold">{lastPublishTime ? ztteam_formatDate(lastPublishTime) : 'Chưa có bài đăng'}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-fb-text-muted">Dự kiến xuất bản tiếp theo:</span>
                  <strong className="text-emerald-400 font-bold">{nextPublishTime ? ztteam_formatDate(nextPublishTime) : 'Đang chờ khung giờ...'}</strong>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/** TAB 2: HÀNG ĐỢI XUẤT BẢN */}
      {activeTab === 2 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 overflow-hidden flex flex-col">

            {/** Header */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fb-surface-hover/50 bg-fb-surface-hover/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-400 text-[26px]">pending_actions</span>
                <div>
                  <h3 className="text-base font-black text-fb-text">Hàng Đợi Xuất Bản Bài Viết Ảnh 2K</h3>
                  <p className="text-[11px] text-fb-text-muted mt-0.5">
                    Các bài viết đã tạo ảnh AI 2K thành công và đang chờ đến khung giờ xuất bản tự động ({queueItems.length} bài)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  onClick={() => ztteam_loadQueue()}
                  disabled={isLoadingQueue}
                  className="px-4 py-2 bg-fb-surface-hover text-fb-text-muted hover:text-fb-text rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 border border-fb-surface-hover/50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isLoadingQueue ? 'animate-spin' : ''}`}>refresh</span>
                  Làm mới
                </button>
              </div>
            </div>

            {/** Queue List */}
            <div className="p-6">
              {isLoadingQueue ? (
                <div className="py-20 text-center text-fb-text-muted flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">refresh</span>
                  <span className="text-sm font-bold">Đang tải danh sách bài viết trong hàng đợi...</span>
                </div>
              ) : queueItems.length === 0 ? (
                <div className="py-16 text-center text-fb-text-muted flex flex-col items-center justify-center bg-fb-surface-hover/20 rounded-2xl border border-dashed border-fb-surface-hover/50">
                  <span className="material-symbols-outlined text-5xl mb-3 text-fb-text-muted/40">schedule</span>
                  <p className="text-base font-bold text-fb-text">Hàng đợi xuất bản hiện đang trống</p>
                  <p className="text-xs text-fb-text-muted mt-1 max-w-md">
                    Khi hệ thống tự động cào bài từ nguồn Website WordPress, các bài viết kèm ảnh AI 2K sẽ xuất hiện ở đây và tự động đăng lên Fanpage theo lịch đã thiết lập.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {queueItems.map((item) => (
                    <ZTTeamAIPostCard
                      key={item.id}
                      item={item}
                      pageName={pageName}
                      pageAvatar={pageAvatar}
                      fbPageId={fbPageId}
                      isPosting={isPosting[item.id] || false}
                      onPostNow={(it) => ztteam_publishNow(it)}
                      onRetry={(it) => ztteam_retryQueueItem(it)}
                      onDelete={(it) => ztteam_deleteQueueItem(it)}
                      onQueueVideo={(it) => ztteam_queueVideoReel(it)}
                      onUseOriginalImage={(it) => ztteam_useOriginalImage(it)}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/** TAB 3: LỊCH SỬ ĐÃ ĐĂNG BÀI */}
      {activeTab === 3 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 overflow-hidden flex flex-col">

            {/** Header */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fb-surface-hover/50 bg-fb-surface-hover/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-400 text-[26px]">history</span>
                <div>
                  <h3 className="text-base font-black text-fb-text">Lịch Sử Bài Viết Đã Đăng Fanpage</h3>
                  <p className="text-[11px] text-fb-text-muted mt-0.5">
                    Tổng số {historyItems.length} bài viết đã xuất bản thành công lên Facebook kèm tiến trình bình luận 2 bước
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  onClick={() => ztteam_loadQueue()}
                  disabled={isLoadingQueue}
                  className="px-4 py-2 bg-fb-surface-hover text-fb-text-muted hover:text-fb-text rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 border border-fb-surface-hover/50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isLoadingQueue ? 'animate-spin' : ''}`}>refresh</span>
                  Làm mới
                </button>
              </div>
            </div>

            {/** History List */}
            <div className="p-6">
              {isLoadingQueue ? (
                <div className="py-20 text-center text-fb-text-muted flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">refresh</span>
                  <span className="text-sm font-bold">Đang tải lịch sử đăng bài...</span>
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-16 text-center text-fb-text-muted flex flex-col items-center justify-center bg-fb-surface-hover/20 rounded-2xl border border-dashed border-fb-surface-hover/50">
                  <span className="material-symbols-outlined text-5xl mb-3 text-fb-text-muted/40">history_toggle_off</span>
                  <p className="text-base font-bold text-fb-text">Chưa có bài viết nào được đăng</p>
                  <p className="text-xs text-fb-text-muted mt-1 max-w-md">
                    Các bài viết sau khi được xuất bản tự động theo lịch hoặc khi bạn bấm "Đăng ngay" sẽ được lưu trữ tại đây.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {historyItems.map((item) => (
                    <ZTTeamAIPostCard
                      key={item.id}
                      item={item}
                      pageName={pageName}
                      pageAvatar={pageAvatar}
                      fbPageId={fbPageId}
                      isPosting={isPosting[item.id] || false}
                      onPostNow={(it) => ztteam_publishNow(it)}
                      onRetry={(it) => ztteam_retryQueueItem(it)}
                      onDelete={(it) => ztteam_deleteQueueItem(it)}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
