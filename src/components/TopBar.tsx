import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Cloud,
  CloudOff,
  Keyboard,
  Layers,
  Loader2,
  LogOut,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { AppSection } from '../types/vocab';

export type CloudSyncState = 'local' | 'syncing' | 'synced' | 'error';

export interface CloudUserInfo {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  authReady: boolean;
  user: CloudUserInfo | null;
  syncStatus: CloudSyncState;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: AppSection; label: string; icon: LucideIcon }> = [
  { id: 'explore', label: 'Thư viện', icon: BookOpen },
  { id: 'flashcards', label: 'Thẻ ghi nhớ', icon: Layers },
  { id: 'typing', label: 'Nhập nghĩa', icon: Keyboard },
  { id: 'ai-quiz', label: 'Bài tập AI', icon: Wand2 },
  { id: 'progress', label: 'Tiến độ', icon: BarChart3 },
];

export function TopBar({
  activeSection,
  onSelectSection,
  authReady,
  user,
  syncStatus,
  authLoading,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const userInitial = (user?.displayName || user?.email || 'G')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-12 md:h-14 max-w-7xl items-center justify-between gap-2 md:gap-6 px-3.5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => onSelectSection('explore')}
          className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          Hán Ngữ 570
        </button>

        <nav
          aria-label="Điều hướng chính"
          className="hidden md:flex items-center gap-6"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'text-teal-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-teal-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {authReady && !user && (
            <button
              type="button"
              disabled={authLoading}
              onClick={onSignIn}
              aria-label="Đăng nhập Google để đồng bộ cloud"
              className="inline-flex min-h-[36px] md:min-h-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 md:px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-700 hover:text-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {authLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" aria-hidden="true" />
              ) : (
                <Cloud className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              )}
              <span>Đăng nhập</span>
            </button>
          )}

          {authReady && user && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`Tài khoản ${user.displayName || user.email}`}
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex min-h-[36px] md:min-h-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 hover:border-teal-700 whitespace-nowrap"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[11px] font-bold text-white">
                    {userInitial}
                  </span>
                )}
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {user.displayName || 'Tài khoản'}
                </span>
                {syncStatus === 'syncing' ? (
                  <Loader2
                    className="h-3 w-3 animate-spin text-teal-700"
                    aria-label="Đang đồng bộ"
                  />
                ) : syncStatus === 'error' ? (
                  <CloudOff
                    className="h-3 w-3 text-rose-600"
                    aria-label="Lỗi đồng bộ"
                  />
                ) : (
                  <span
                    className="h-2 w-2 rounded-full bg-emerald-500"
                    title="Đã đồng bộ Cloud"
                  />
                )}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg space-y-2.5 z-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-900">
                      {user.displayName || 'Người học'}
                    </div>
                    {user.email && (
                      <div className="truncate text-[11px] text-slate-500">
                        {user.email}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                    {syncStatus === 'syncing' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" aria-hidden="true" />
                        <span>Đang đồng bộ Firestore...</span>
                      </>
                    ) : syncStatus === 'error' ? (
                      <>
                        <CloudOff className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                        <span className="text-rose-700">Đồng bộ tạm gián đoạn</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span>Đã đồng bộ Cloud realtime</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-rose-700"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileSectionBar({
  activeSection,
  onSelectSection,
}: {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
}) {
  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-slate-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activeSection === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectSection(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10.5px] font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-teal-700"
              />
            )}
            <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
            <span className="truncate max-w-full">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
