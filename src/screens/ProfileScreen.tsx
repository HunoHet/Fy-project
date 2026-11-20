import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  BadgeCheck,
  Camera,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Target,
  Zap,
  UserPlus,
  Flame,
  Sparkles,
  Gift,
  TrendingUp,
  Lock,
  MapPin,
  LogOut,
  Search,
  X,
  Video,
} from 'lucide-react';
import { currentUser, formatCount, interestOptions } from '@/data/mockData';
import { useToast } from '@/components/ToastContext';
import BottomSheet from '@/components/BottomSheet';
import type { Interest, Squad } from '@/types';
import ContentPublisher from '@/components/ContentPublisher';
import type { FollowedProfile } from '@/lib/socialContent';

interface OwnContent {
  id: number;
  image: string;
  caption: string;
  tags: string[];
  mediaType: 'post' | 'reel';
  createdAt: string;
}

interface EditableProfile {
  name: string;
  handle: string;
  location: string;
  bio: string;
  interests: Interest[];
}

const MAX_INTERESTS = 50;

export default function ProfileScreen({
  openGroupChat,
  userSquads,
  openCreator,
  userInterests,
  onEditInterests,
  syncPoints,
  userAvatar,
  onChangeAvatar,
  inFeedCount,
  userName,
  userHandle,
  userLocation,
  userBio,
  followedHandles,
  followedProfiles,
  followerProfiles,
  mutualFriendCounts,
  mutualFriendError,
  followerCount,
  userId,
  ownContent,
  onContentPublished,
  contentError,
  onSaveProfile,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  openGroupChat: (squadId: number) => void;
  userSquads: Squad[];
  openCreator: (handle: string) => void;
  userInterests: Interest[];
  onEditInterests: () => void;
  syncPoints: number;
  userAvatar: string;
  onChangeAvatar: (avatar: string) => boolean | Promise<boolean>;
  inFeedCount: number;
  userName: string;
  userHandle: string;
  userLocation: string;
  userBio: string;
  followedHandles: Set<string>;
  followedProfiles: FollowedProfile[];
  followerProfiles: FollowedProfile[];
  mutualFriendCounts: Record<string, number>;
  mutualFriendError: string;
  followerCount: number;
  userId: string | null;
  ownContent: OwnContent[];
  onContentPublished: () => void;
  contentError: string;
  onSaveProfile: (profile: EditableProfile) => boolean | Promise<boolean>;
  theme: 'light' | 'dark';
  onToggleTheme: () => boolean;
  onSignOut?: () => void;
}) {
  const { showToast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [inFeedVisible, setInFeedVisible] = useState(currentUser.inFeedVisible);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showSyncFormula, setShowSyncFormula] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [interestSearch, setInterestSearch] = useState('');
  const [socialListOpen, setSocialListOpen] = useState<'followers' | 'following' | null>(null);
  const [socialListSearch, setSocialListSearch] = useState('');
  const [profileDraft, setProfileDraft] = useState<EditableProfile>({
    name: userName,
    handle: userHandle,
    location: userLocation,
    bio: userBio,
    interests: userInterests,
  });
  const bioInputRef = useRef<HTMLTextAreaElement>(null);
  const [squadState, setSquadState] = useState(userSquads);
  useEffect(() => setSquadState(userSquads), [userSquads]);

  const friends = followedProfiles.map((friend) => ({
    handle: friend.username,
    username: friend.display_name || friend.username,
    avatar: friend.avatar_url ?? '',
  }));
  const socialList = (socialListOpen === 'followers' ? followerProfiles : followedProfiles)
    .filter((profile) => {
      const query = socialListSearch.trim().toLocaleLowerCase();
      return !query ||
        profile.display_name.toLocaleLowerCase().includes(query) ||
        profile.username.toLocaleLowerCase().includes(query);
    })
    .sort((a, b) =>
      (a.display_name || a.username).localeCompare(
        b.display_name || b.username,
        undefined,
        { sensitivity: 'base' },
      ),
    );
  const mentionMatch = profileDraft.bio.match(/(?:^|\s)@([\w.]*)$/);
  const mentionQuery = mentionMatch?.[1].toLowerCase() ?? null;
  const mentionSuggestions = mentionQuery === null
    ? []
    : friends.filter((friend) =>
        friend.handle.toLowerCase().includes(mentionQuery) ||
        friend.username.toLowerCase().includes(mentionQuery),
      ).slice(0, 5);
  const filteredInterestOptions = useMemo(() => {
    const query = interestSearch.trim().replace(/^#/, '').toLowerCase();
    return interestOptions.filter(({ id, label }) =>
      id.toLowerCase().includes(query) || label.toLowerCase().includes(query),
    );
  }, [interestSearch]);

  const totalSync = Math.max(
    userId === null ? currentUser.totalSyncPoints : syncPoints,
    squadState.reduce((sum, s) => sum + s.syncPoints, 0),
  );
  const totalStreaks = squadState.reduce((sum, s) => sum + s.streak, 0);

  const handleStreakRecovery = (squadId: number) => {
    setSquadState((prev) =>
      prev.map((s) => {
        if (s.id !== squadId) return s;
        if (s.streak >= s.peakStreak) {
          showToast(`${s.name}'s streak is already at peak!`, 'default');
          return s;
        }
        showToast(`Streak Recovery Token used! ${s.name} revived to ${s.peakStreak} days`, 'success');
        return { ...s, streak: s.peakStreak };
      }),
    );
  };

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'default');
      return;
    }

    let image: ImageBitmap | null = null;
    try {
      image = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the selected image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const avatar = canvas.toDataURL('image/jpeg', 0.85);
      const saved = await onChangeAvatar(avatar);
      showToast(
        saved ? 'Profile picture updated' : 'Picture updated for this session, but could not be saved',
        saved ? 'success' : 'default',
      );
    } catch (error) {
      console.error('Could not update the profile picture.', error);
      showToast('Could not update the profile picture', 'default');
    } finally {
      image?.close();
    }
  };

  return (
    <div className="animate-screen-in h-full overflow-y-auto no-scrollbar bg-black pb-24">
      {/* Profile header */}
      <div className="relative">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-green-500/30 via-purple-500/20 to-cyan-500/30">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(168,85,247,0.2),transparent_60%)]" />
        </div>

        {/* Avatar + stats */}
        <div className="px-4">
          <div className="-mt-10 flex items-end justify-between">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Change profile picture"
              className="group relative h-20 w-20 rounded-full text-left ring-4 ring-black"
            >
              <img
                src={userAvatar}
                alt={userName}
                className="h-full w-full rounded-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={22} />
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
              aria-label="Choose a new profile picture"
            />
            <div className="mb-2 flex items-center gap-2">
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10"
                >
                  <LogOut size={17} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const saved = onToggleTheme();
                  showToast(
                    saved ? `Switched to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Theme changed for this session, but could not be saved',
                    saved ? 'success' : 'default',
                  );
                }}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInterestSearch('');
                  setProfileDraft({
                    name: userName,
                    handle: userHandle,
                    location: userLocation,
                    bio: userBio,
                    interests: userInterests,
                  });
                  setProfileEditorOpen(true);
                }}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Edit Profile
              </button>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-bold text-white">{userName}</h1>
              <BadgeCheck size={18} className="text-blue-400" />
            </div>
            <p className="text-sm text-white/40">@{userHandle}</p>
            {userLocation && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-white/45">
                <MapPin size={12} />
                {userLocation}
              </p>
            )}
            {userBio && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/75">
                {userBio.split(/(@[\w.]+)/g).map((part, index) => {
                  const handle = part.startsWith('@') ? part.slice(1) : '';
                  const friend = friends.find((item) => item.handle.toLowerCase() === handle.toLowerCase());
                  return friend ? (
                    <button
                      key={`${part}-${index}`}
                      type="button"
                      onClick={() => openCreator(friend.handle)}
                      className="font-semibold text-green-300 hover:text-green-200"
                    >
                      {part}
                    </button>
                  ) : (
                    <span key={`${part}-${index}`}>{part}</span>
                  );
                })}
              </p>
            )}
          </div>

          {/* Badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-green-400/40 bg-green-500/15 px-3 py-1.5">
              <Target size={14} className="text-green-400" />
              <span className="text-xs font-bold text-green-300">Blueprint Badge</span>
              <span className="text-[10px] text-green-400/60">High In-Feed adds</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-500/15 px-3 py-1.5">
              <Zap size={14} className="text-purple-400" />
              <span className="text-xs font-bold text-purple-300">Hype Magnat Badge</span>
              <span className="text-[10px] text-purple-400/60">High Hypes received</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatBox
              label="Followers"
              value={formatCount(userId === null ? followerProfiles.length : followerCount)}
              onClick={() => {
                setSocialListSearch('');
                setSocialListOpen('followers');
              }}
            />
            <StatBox
              label="Following"
              value={formatCount(followedHandles.size)}
              onClick={() => {
                setSocialListSearch('');
                setSocialListOpen('following');
              }}
            />
            <StatBox label="Sync Points" value={formatCount(totalSync)} accent="green" />
          </div>

          {/* In-Feed counter with toggle switch */}
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2.5">
              {inFeedVisible ? (
                <Eye size={16} className="text-green-400" />
              ) : (
                <EyeOff size={16} className="text-white/40" />
              )}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white/80">In-Feed Count</span>
                  {!inFeedVisible && <Lock size={10} className="text-white/30" />}
                </div>
                <p className="mt-0.5 text-[10px] text-white/35">
                  {inFeedVisible ? 'Public - visible to everyone' : 'Private - only you can see it'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-2xl font-bold transition-all duration-300 ${
                  inFeedVisible
                    ? 'text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.6)]'
                    : 'text-white/20'
                }`}
              >
                {inFeedVisible ? inFeedCount : '--'}
              </span>
              {/* Toggle switch */}
              <button
                onClick={() => {
                  setInFeedVisible((v) => {
                    showToast(v ? 'In-Feed count set to Private' : 'In-Feed count set to Public', v ? 'default' : 'green');
                    return !v;
                  });
                }}
                className={`relative h-6 w-12 rounded-full border transition-colors duration-300 ${
                  inFeedVisible
                    ? 'border-green-400/50 bg-green-500/30'
                    : 'border-white/15 bg-white/5'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full transition-all duration-300 ${
                    inFeedVisible
                      ? 'left-7 bg-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.8)]'
                      : 'left-0.5 bg-white/40'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4">
      <ContentPublisher
        userId={userId}
        username={userHandle}
        displayName={userName}
        onPublished={onContentPublished}
      />
      {contentError && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {contentError}
        </p>
      )}
      <section className="mt-4">
        <h2 className="mb-3 text-sm font-bold text-white">Your uploads</h2>
        {ownContent.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {ownContent.map((item) => (
              <div key={item.id} className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                {item.mediaType === 'reel' ? (
                  <video src={item.image} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <img src={item.image} alt={item.caption || 'Your post'} loading="lazy" className="h-full w-full object-cover" />
                )}
                {item.mediaType === 'reel' && (
                  <span className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white">
                    <Video size={12} />
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4 text-center text-xs text-white/40">
            Your posts and reels will show up here.
          </p>
        )}
      </section>
      </div>

      {/* Squad section */}
      {userId === null && (
      <div className="mt-6 px-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-lg font-bold text-white">
            <Flame size={18} className="text-orange-400" />
            Private Squads
          </h2>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-green-400/40 bg-green-500/15 px-3 py-1.5 text-xs font-bold text-green-300 transition-all active:scale-95"
          >
            <UserPlus size={14} />
            Invite
          </button>
        </div>

        {/* Squad cards */}
        <div className="mt-3 space-y-3">
          {squadState.map((squad) => {
            const streakDead = squad.streak < squad.peakStreak;
            const colorMap: Record<string, string> = {
              green: 'from-green-500/20 to-emerald-700/10 border-green-400/30',
              purple: 'from-purple-500/20 to-fuchsia-700/10 border-purple-400/30',
              amber: 'from-amber-500/20 to-orange-700/10 border-amber-400/30',
              cyan: 'from-cyan-500/20 to-blue-700/10 border-cyan-400/30',
            };
            const textMap: Record<string, string> = {
              green: 'text-green-400',
              purple: 'text-purple-400',
              amber: 'text-amber-400',
              cyan: 'text-cyan-400',
            };
            return (
              <button
                key={squad.id}
                onClick={() => openGroupChat(squad.id)}
                className={`w-full rounded-2xl border bg-gradient-to-br ${colorMap[squad.color]} p-4 text-left transition-all active:scale-[0.98]`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={squad.avatar}
                      alt={squad.name}
                      className="h-11 w-11 rounded-full object-cover ring-2 ring-white/20"
                    />
                    <div>
                      <p className="font-bold text-white">{squad.name}</p>
                      <p className="text-xs text-white/40">{squad.members} members</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Flame size={16} className="text-orange-400" />
                    <div className="text-right">
                      <p className={`text-lg font-bold ${streakDead ? 'text-white/30 line-through' : 'text-orange-400'}`}>
                        {squad.streak}
                      </p>
                      <p className="text-[9px] text-white/40">days</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center">
                  {squad.memberProfiles.slice(0, 4).map((member, index) => (
                    <img
                      key={`${squad.id}-${member.username}`}
                      src={member.avatar}
                      alt={member.username}
                      title={member.username}
                      className={`h-7 w-7 rounded-full border-2 border-black/40 object-cover ${index > 0 ? '-ml-2' : ''}`}
                    />
                  ))}
                  <span className="ml-2 text-[11px] text-white/45">Squad members</span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-black/30 px-2.5 py-1">
                      <TrendingUp size={12} className={textMap[squad.color]} />
                      <span className={`text-sm font-bold ${textMap[squad.color]}`}>
                        {squad.syncPoints}
                      </span>
                      <span className="text-[10px] text-white/40">Sync</span>
                    </div>
                    {streakDead && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStreakRecovery(squad.id);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-orange-400/40 bg-orange-500/15 px-2.5 py-1 text-[10px] font-bold text-orange-300 transition-all active:scale-95"
                      >
                        <Gift size={12} />
                        Revive to {squad.peakStreak}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-white/40">Tap to open chat</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Sync point formula */}
        <button
          onClick={() => setShowSyncFormula((v) => !v)}
          className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/8"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white/80">
              <Sparkles size={14} className="text-green-400" />
              How Sync Points work
            </span>
            <span className="text-xs text-white/40">{showSyncFormula ? '-' : '+'}</span>
          </div>
          {showSyncFormula && (
            <div className="mt-3 space-y-2 animate-fade-in">
              <div className="rounded-xl bg-black/40 p-3">
                <p className="text-center text-sm font-bold text-white">
                  [Group Members] x [Daily Matching Feed Topics] = Daily Sync Points
                </p>
                <p className="mt-2 text-center text-xs text-white/50">
                  Points are distributed to all squad members equally
                </p>
              </div>
              <div className="rounded-xl border border-green-400/20 bg-green-500/5 p-3">
                <p className="text-center text-xs text-green-300">
                  Example: <b>3 members</b> x <b>3 matching topics</b> ={' '}
                  <b className="text-green-400">9 Sync Points</b> / day
                </p>
              </div>
              <div className="rounded-xl border border-purple-400/20 bg-purple-500/5 p-3">
                <p className="text-center text-xs text-purple-300">
                  Example: <b>6 members</b> x <b>4 matching topics</b> ={' '}
                  <b className="text-purple-400">24 Sync Points</b> / day
                </p>
              </div>
            </div>
          )}
        </button>

        {/* Summary */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{formatCount(totalSync)}</p>
            <p className="mt-1 text-xs text-white/40">Total Sync Points</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{totalStreaks}</p>
            <p className="mt-1 text-xs text-white/40">Total Streak Days</p>
          </div>
        </div>
      </div>
      )}

      <section className="mt-6 px-4 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white/70">Your private interests</h2>
          <button
            type="button"
            onClick={onEditInterests}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/60"
          >
            Edit interests
          </button>
        </div>
        <p className="mt-1 text-[11px] text-white/40">Only you can see these topics.</p>
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
          {userInterests.length ? userInterests.map((interest) => (
            <span
              key={interest}
              className="text-[11px] font-normal leading-tight text-white/50"
            >
              #{interest}
            </span>
          )) : (
            <p className="text-xs text-white/40">Choose interests to personalize your recommendations.</p>
          )}
        </div>
      </section>

      {/* Invite modal */}
      <BottomSheet
        open={profileEditorOpen}
        onClose={() => setProfileEditorOpen(false)}
        title="Edit profile"
      >
        <form
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const name = profileDraft.name.trim();
            if (!name) {
              showToast('Name cannot be empty', 'default');
              return;
            }
            const profile = {
              ...profileDraft,
              name,
              location: profileDraft.location.trim(),
              bio: profileDraft.bio.trim(),
            };
            if (!await onSaveProfile(profile)) {
              showToast('Profile updated for this session, but could not be saved', 'default');
            } else {
              showToast('Profile updated', 'success');
            }
            setProfileEditorOpen(false);
          }}
        >
          <div className="max-h-[70vh] space-y-4 overflow-y-auto overscroll-contain pb-2">
            <div>
              <label htmlFor="profile-name" className="mb-2 block text-sm font-medium text-white/70">
                Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={profileDraft.name}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, name: event.target.value }))}
                maxLength={30}
                required
                autoFocus
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none transition-colors focus:border-green-400/50"
              />
            </div>
            <div>
              <label htmlFor="profile-location" className="mb-2 block text-sm font-medium text-white/70">
                Location
              </label>
              <input
                id="profile-location"
                type="text"
                value={profileDraft.location}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, location: event.target.value }))}
                maxLength={60}
                placeholder="Where do you live?"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-green-400/50"
              />
            </div>
            <div className="relative">
              <label htmlFor="profile-bio" className="mb-2 block text-sm font-medium text-white/70">
                Bio
              </label>
              <textarea
                id="profile-bio"
                ref={bioInputRef}
                value={profileDraft.bio}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, bio: event.target.value }))}
                maxLength={200}
                rows={3}
                placeholder="Tell people a little about yourself. Type @ to tag a friend."
                className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-green-400/50"
              />
              {mentionSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-xl">
                  {mentionSuggestions.map((friend) => (
                    <button
                      key={friend.handle}
                      type="button"
                      onClick={() => {
                        const bio = profileDraft.bio.replace(/@[\w.]*$/, `@${friend.handle} `);
                        setProfileDraft((prev) => ({ ...prev, bio }));
                        bioInputRef.current?.focus();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/10"
                    >
                      <img src={friend.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                      <span className="text-sm font-semibold text-white">{friend.username}</span>
                      <span className="text-xs text-white/40">@{friend.handle}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-right text-[10px] text-white/30">
                {profileDraft.bio.length}/200
              </p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-white/70">Interests</span>
                <span className="text-[10px] text-white/35">
                  {profileDraft.interests.length}/{MAX_INTERESTS}
                </span>
              </div>
              <label className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                <Search size={15} className="text-white/40" />
                <input
                  value={interestSearch}
                  onChange={(event) => setInterestSearch(event.target.value)}
                  placeholder={`Search ${interestOptions.length} topics...`}
                  aria-label="Search profile interests"
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-white/35"
                />
              </label>
              <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto">
                {filteredInterestOptions.map(({ id }) => {
                  const selected = profileDraft.interests.includes(id);
                  const disabled = !selected && profileDraft.interests.length >= MAX_INTERESTS;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() =>
                        setProfileDraft((prev) => ({
                          ...prev,
                          interests: selected
                            ? prev.interests.filter((interest) => interest !== id)
                            : [...prev.interests, id],
                        }))
                      }
                      className={`min-w-0 break-words rounded-xl border px-1.5 py-2 text-center text-[10px] font-medium leading-tight transition-colors ${
                        selected
                          ? 'border-white/20 bg-white/5 text-zinc-300'
                          : 'border-white/10 text-white/60 hover:bg-white/5'
                      } disabled:cursor-not-allowed disabled:opacity-30`}
                    >
                      #{id}
                    </button>
                  );
                })}
                {filteredInterestOptions.length === 0 && (
                  <p className="col-span-4 py-3 text-center text-xs text-white/40">No matching topics.</p>
                )}
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 py-3.5 text-sm font-bold text-black transition-transform active:scale-95"
            >
              Save profile
            </button>
          </div>
        </form>
        <button
          type="button"
          onClick={() => setProfileEditorOpen(false)}
          className="mt-2 w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-white/60 transition-colors hover:bg-white/5"
        >
          Cancel
        </button>
      </BottomSheet>

      <BottomSheet
        open={socialListOpen !== null}
        onClose={() => setSocialListOpen(null)}
        title={socialListOpen === 'followers' ? 'Followers' : 'Following'}
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-green-400/40">
            <Search size={16} className="shrink-0 text-white/40" />
            <input
              type="search"
              value={socialListSearch}
              onChange={(event) => setSocialListSearch(event.target.value)}
              placeholder="Search by name or username..."
              aria-label="Search followers and following"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
            {socialListSearch && (
              <button
                type="button"
                onClick={() => setSocialListSearch('')}
                aria-label="Clear search"
                className="rounded-full p-1 text-white/45 hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </label>
          {mutualFriendError && (
            <p role="alert" className="text-xs text-red-300">{mutualFriendError}</p>
          )}
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {socialList.length > 0 ? socialList.map((profile) => {
              const mutualCount = mutualFriendCounts[profile.username] ?? 0;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setSocialListOpen(null);
                    openCreator(profile.username);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/5"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/70">
                      {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {profile.display_name || profile.username}
                    </span>
                    <span className="block truncate text-xs text-white/40">@{profile.username}</span>
                    <span className="mt-0.5 block text-[10px] text-white/35">
                      {mutualFriendError
                        ? 'Mutual friends unavailable'
                        : `${mutualCount > 9 ? '9+' : mutualCount} mutual friend${mutualCount === 1 ? '' : 's'}`}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <p className="py-6 text-center text-sm text-white/45">
                {socialListSearch.trim()
                  ? 'No matching people found.'
                  : socialListOpen === 'followers'
                    ? 'No followers yet.'
                    : 'You are not following anyone yet.'}
              </p>
            )}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <InviteCard />
        <button
          onClick={() => {
            setInviteOpen(false);
            showToast('Invite sent! +1 Streak Recovery Token earned', 'success');
          }}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 py-3.5 text-sm font-bold text-black transition-transform active:scale-95"
        >
          Send Invite & Earn Recovery Token
        </button>
        <button
          onClick={() => setInviteOpen(false)}
          className="mt-2 w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-white/60 transition-colors hover:bg-white/5"
        >
          Close
        </button>
      </BottomSheet>
    </div>
  );
}

function StatBox({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'orange';
  onClick?: () => void;
}) {
  const content = (
    <>
      <p
        className={`text-xl font-bold ${
          accent === 'green' ? 'text-green-400' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-white/40">{label}</p>
    </>
  );
  const className = `rounded-2xl border border-white/10 bg-white/5 p-3 text-center ${
    onClick ? 'transition-colors hover:bg-white/10 active:scale-[0.98]' : ''
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={`View ${label.toLowerCase()}`} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function InviteCard() {
  return (
    <div className="animate-invite-glow relative overflow-hidden rounded-3xl border border-green-400/30 bg-gradient-to-br from-zinc-900 via-black to-zinc-900 p-6">
      <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-green-500/20 blur-3xl" />
      <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-purple-500/20 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-black tracking-tight text-white">
            f<span className="text-green-400">y</span>
          </span>
          <span className="rounded-full border border-green-400/40 bg-green-500/15 px-2.5 py-0.5 text-[10px] font-bold text-green-300">
            SQUAD INVITE
          </span>
        </div>

        <div className="my-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">You're invited to join</p>
          <p className="mt-2 text-2xl font-black text-white">Gym haverok</p>
          <p className="mt-1 text-sm text-white/50">Private squad - 3 members - 48 day streak</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-400 to-teal-600 ring-2 ring-black" />
          <div className="h-10 w-10 -ml-3 rounded-full bg-gradient-to-br from-purple-400 to-pink-600 ring-2 ring-black" />
          <div className="h-10 w-10 -ml-3 rounded-full bg-gradient-to-br from-orange-400 to-red-600 ring-2 ring-black" />
          <div className="-ml-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-black">
            <UserPlus size={16} className="text-white" />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center">
          <p className="text-xs text-white/50">
            Join to earn <b className="text-green-400">Sync Points</b> and build your{' '}
            <b className="text-orange-400">Drop Streak</b> together.
          </p>
        </div>
      </div>
    </div>
  );
}
