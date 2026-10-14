import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useZTTeamAuthStore } from '../stores/authStore';

/**
 * ZTTeam: Trang Đăng Nhập Hệ Thống (Login Page)
 * Đồng bộ phong cách Dark Theme, màu sắc fb-bg, fb-surface, gradient fb-blue/cyan
 */
export default function ZTTeamLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { ztteam_login, isLoading } = useZTTeamAuthStore();
  const navigate = useNavigate();

  const ztteam_handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await ztteam_login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản.');
    }
  };

  return (
    <div className="min-h-screen bg-fb-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/** Đốm sáng nền trang trí hiện đại */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-600/15 rounded-full blur-[128px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-fb-surface/90 border border-slate-800/80 p-8 sm:p-10 rounded-3xl shadow-2xl z-10 backdrop-blur-xl">
        {/** Logo & Tiêu đề hệ thống */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 via-fb-blue to-cyan-400 mx-auto rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/30 font-black text-2xl tracking-tighter">
            f
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-fb-text tracking-tight mb-1.5">
            CreatorPro AI
          </h1>
          <p className="text-xs sm:text-sm font-medium text-fb-text-muted">
            Hệ thống tự động hóa nội dung &amp; Video Reels
          </p>
        </div>

        {/** Cảnh báo lỗi */}
        {error && (
          <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
              <span className="material-symbols-outlined text-base">warning</span>
            </div>
            <p className="text-red-400 text-xs font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={ztteam_handleSubmit} className="space-y-5">
          {/** Ô Email */}
          <div>
            <label className="block text-xs font-bold text-fb-text uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-blue-400">mail</span>
              Email Quản Trị
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-fb-surface-hover/70 border border-slate-700/60 rounded-2xl text-sm text-fb-text placeholder-slate-500 focus:outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue transition-all"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {/** Ô Mật khẩu */}
          <div>
            <label className="block text-xs font-bold text-fb-text uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-blue-400">lock</span>
              Mật Khẩu
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-4 pr-11 py-3 bg-fb-surface-hover/70 border border-slate-700/60 rounded-2xl text-sm text-fb-text placeholder-slate-500 focus:outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue transition-all font-mono"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fb-text-muted hover:text-fb-text transition-colors flex items-center"
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <span className="material-symbols-outlined text-lg">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/** Nút Đăng nhập */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-95 text-white font-bold rounded-2xl px-5 py-3.5 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-sm tracking-wide"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                <span>Đang xác thực...</span>
              </>
            ) : (
              <>
                <span>Đăng Nhập Hệ Thống</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/** Footer bản quyền */}
        <div className="mt-8 pt-5 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-fb-text-muted font-medium">
            ZTTeam • Nền tảng tự động hóa Facebook Fanpage &amp; Reels
          </p>
        </div>
      </div>
    </div>
  );
}
