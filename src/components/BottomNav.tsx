import { Home, Clapperboard, UsersRound, Bell, User as UserIcon } from 'lucide-react';
import type { TabKey } from '@/types';

const tabs: { key: TabKey; label: string; icon: typeof Home; color: string }[] = [
  { key: 'squads', label: 'SQUADS', icon: UsersRound, color: 'green' },
  { key: 'messages', label: 'NOTIFICATIONS', icon: Bell, color: 'cyan' },
  { key: 'feed', label: 'FEED', icon: Home, color: 'purple' },
  { key: 'reels', label: 'REELS', icon: Clapperboard, color: 'green' },
  { key: 'profile', label: 'PROFILE', icon: UserIcon, color: 'cyan' },
];

const colorClasses: Record<string, { text: string; dot: string; glow: string }> = {
  purple: {
    text: 'text-purple-400',
    dot: 'bg-purple-400',
    glow: 'drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]',
  },
  green: {
    text: 'text-green-400',
    dot: 'bg-green-400',
    glow: 'drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]',
  },
  cyan: {
    text: 'text-cyan-400',
    dot: 'bg-cyan-400',
    glow: 'drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]',
  },
};

export default function BottomNav({
  active,
  onChange,
  unreadMessageCount = 0,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
  unreadMessageCount?: number;
}) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="flex items-center justify-around px-2 pb-5 pt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          const c = colorClasses[tab.color];
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              aria-label={tab.key === 'messages' && unreadMessageCount > 0
                ? `Notifications, ${unreadMessageCount} unread`
                : tab.label}
              className="relative flex flex-1 flex-col items-center gap-1 px-1 py-1.5 transition-transform active:scale-90"
            >
              <span className="relative">
                <Icon
                  size={22}
                  className={`transition-all duration-300 ${
                    isActive ? `${c.text} ${c.glow}` : 'text-white/40'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {tab.key === 'messages' && unreadMessageCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </span>
                )}
              </span>
              <span
                className={`${tab.key === 'messages' ? 'text-[8px] tracking-wide' : 'text-[10px] tracking-wider'} font-bold transition-colors duration-300 ${
                  isActive ? 'text-white' : 'text-white/30'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span
                  className={`absolute -top-0.5 h-1 w-8 rounded-full ${c.dot} drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]`}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
