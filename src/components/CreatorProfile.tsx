import { useState } from 'react';
import { ArrowLeft, BadgeCheck, Target, Zap, Heart, Grid3x3, Send, Video } from 'lucide-react';
import { getCreatorByHandle, formatCount } from '@/data/mockData';
import { getReelVideoSource } from '@/data/media';
import { useToast } from '@/components/ToastContext';
import type { Creator, ProfileMediaContent } from '@/types';

export function CreatorProfile({
  handle,
  onBack,
  onSendMessage,
  following,
  onToggleFollow,
  likedContentIds,
  onContentFeedback,
  onOpenMedia,
  readOnly = false,
}: {
  handle: string;
  onBack: () => void;
  onSendMessage: (handle: string) => void;
  following: boolean;
  onToggleFollow: (handle: string) => boolean;
  likedContentIds: Set<string>;
  onContentFeedback: (contentId: string, action: 'like' | 'in_feed', active: boolean) => void;
  onOpenMedia: (content: ProfileMediaContent) => void;
  readOnly?: boolean;
}) {
  const { showToast } = useToast();
  const creator: Creator = getCreatorByHandle(handle);
  const [ripple, setRipple] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());

  const toggleFollow = () => {
    const wasFollowing = following;
    const next = onToggleFollow(creator.handle);
    if (wasFollowing && next) return;
    setRipple(true);
    setTimeout(() => setRipple(false), 600);
    showToast(next ? `Following ${creator.username}` : `Unfollowed ${creator.username}`, next ? 'green' : 'default');
  };

  const toggleLike = (id: number, contentId?: string) => {
    if (contentId) {
      onContentFeedback(contentId, 'like', !likedContentIds.has(contentId));
      return;
    }
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const profileItems = [
    ...creator.posts.map((post) => ({ ...post, mediaType: 'post' as const })),
    ...(creator.reels ?? []).map((reel) => ({ ...reel, mediaType: 'reel' as const })),
  ];

  return (
    <div className="animate-overlay-in h-full overflow-y-auto no-scrollbar bg-black pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors active:scale-90"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <span className="text-sm font-bold text-white">{creator.username}</span>
      </div>

      {/* Banner */}
      <div className="relative h-28">
        <div className={`h-full bg-gradient-to-r ${creator.posts[0]?.gradient ?? 'from-green-500/30 to-cyan-500/30'} opacity-40`} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(168,85,247,0.2),transparent_60%)]" />
      </div>

      {/* Avatar + stats */}
      <div className="px-4">
        <div className="-mt-12 flex items-end justify-between">
          <img
            src={creator.avatar}
            alt={creator.username}
            className="h-24 w-24 rounded-full object-cover ring-4 ring-black"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFollow}
              disabled={readOnly}
              className={`relative overflow-hidden rounded-xl px-5 py-2 text-sm font-bold transition-all active:scale-95 ${
                readOnly
                  ? 'cursor-not-allowed border border-white/10 bg-white/5 text-white/40'
                  : following
                  ? 'border border-white/20 bg-white/5 text-white/70'
                  : 'border border-green-400/50 bg-gradient-to-r from-green-500 to-emerald-600 text-black drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]'
              }`}
            >
              {ripple && (
                <span className="animate-follow-ripple absolute inset-0 rounded-xl bg-green-400/30" />
              )}
              {readOnly ? (
                <span className="relative">Swap preview</span>
              ) : following ? (
                <span className="animate-following-glow relative flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  Following
                </span>
              ) : (
                <span className="relative">Follow</span>
              )}
            </button>
            {following && !readOnly && (
              <button
                onClick={() => onSendMessage(creator.handle)}
                className="animate-fade-in flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300 transition-all active:scale-95 hover:bg-cyan-500/20"
              >
                <Send size={14} />
                Message
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-bold text-white">{creator.username}</h1>
            {creator.verified && <BadgeCheck size={18} className="text-blue-400" />}
          </div>
          <p className="text-sm text-white/40">@{creator.handle}</p>
          <p className="mt-2 text-sm text-white/70">{creator.bio}</p>
        </div>

        {/* Badges */}
        {(creator.hasBlueprintBadge || creator.hasHypeMagnatBadge) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {creator.hasBlueprintBadge && (
              <div className="flex items-center gap-1.5 rounded-full border border-green-400/40 bg-green-500/15 px-3 py-1.5">
                <Target size={14} className="text-green-400" />
                <span className="text-xs font-bold text-green-300">Blueprint Badge</span>
              </div>
            )}
            {creator.hasHypeMagnatBadge && (
              <div className="flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-500/15 px-3 py-1.5">
                <Zap size={14} className="text-purple-400" />
                <span className="text-xs font-bold text-purple-300">Hype Magnat Badge</span>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-white">{formatCount(creator.followers + Number(following))}</p>
            <p className="mt-0.5 text-[10px] text-white/40">Followers</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-white">{formatCount(creator.following)}</p>
            <p className="mt-0.5 text-[10px] text-white/40">Following</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-white">{formatCount(creator.syncPoints)}</p>
            <p className="mt-0.5 text-[10px] text-white/40">Sync Points</p>
          </div>
        </div>

        {/* Posts grid */}
        <div className="mt-4 flex items-center gap-1.5 pb-2">
          <Grid3x3 size={16} className="text-white/60" />
          <span className="text-xs font-bold text-white/60">Posts & reels</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {profileItems.map((post) => {
            const liked = post.contentId
              ? likedContentIds.has(post.contentId)
              : likedPosts.has(post.id);
            return (
              <div
                key={post.contentId ?? post.id}
                className={`relative aspect-square overflow-hidden bg-gradient-to-br ${post.gradient}`}
              >
                <button
                  type="button"
                  onClick={() => onOpenMedia({
                    contentId: post.contentId,
                    localId: post.id,
                    mediaType: post.mediaType,
                    mediaUrl: post.mediaType === 'reel'
                      ? getReelVideoSource(post.id) ?? post.image
                      : post.image,
                    caption: '',
                    tags: [],
                    likes: post.likes,
                    inFeeds: 0,
                    creatorName: creator.username,
                    creatorHandle: creator.handle,
                    creatorAvatar: creator.avatar,
                  })}
                  aria-label={`View ${post.mediaType} by ${creator.username}`}
                  className="absolute inset-0 h-full w-full"
                >
                  <img src={post.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/10" />
                  {post.mediaType === 'reel' && (
                    <span className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white">
                      <Video size={12} />
                    </span>
                  )}
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleLike(post.id, post.contentId);
                  }}
                  disabled={readOnly}
                  className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/40 px-1.5 py-0.5 backdrop-blur-sm transition-transform active:scale-90"
                >
                  <Heart
                    size={11}
                    fill={liked ? '#f43f5e' : 'white'}
                    color={liked ? '#f43f5e' : 'white'}
                  />
                  <span className="text-[8px] font-semibold text-white/80">
                    {formatCount(post.likes + (liked ? 1 : 0))}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
