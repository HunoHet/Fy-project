import { useRef, useState, useEffect } from 'react';
import {
  Heart,
  Target,
  Zap,
  Package,
  MessageCircle,
  Share2,
  Play,
  Music2,
  BadgeCheck,
  Sparkles,
} from 'lucide-react';
import type { Reel, Comment, Squad } from '@/types';
import { formatCount, MAX_HYPES } from '@/data/mockData';
import { useToast } from '@/components/ToastContext';
import BottomSheet from '@/components/BottomSheet';
import CommentThread from '@/components/CommentThread';
import type { FollowedProfile } from '@/lib/socialContent';
import {
  addPostComment,
  contentCommentListKey,
  deletePostComment as deletePostCommentRecord,
  isSupabasePostId,
  loadPostComments,
  readCommentLists,
  removeLocalComment,
  saveLocalComment,
  setPostCommentLike,
  toCommentError,
  toggleLocalCommentLike,
} from '@/lib/postComments';

function updateReelScrollEffects(container: HTMLDivElement) {
  const height = container.clientHeight;
  if (!height) return;
  Array.from(container.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    const distance = Math.min(1, Math.abs(child.offsetTop - container.scrollTop) / height);
    child.style.opacity = String(1 - distance * 0.22);
    child.style.transform = `scale(${1 - distance * 0.025})`;
  });
}

export default function ReelsScreen({
  openCreator,
  openHashtag,
  hypedReels,
  onHype,
  followedHandles,
  onToggleFollow,
  onDropToSquad,
  squads,
  swapOn,
  swapHandle,
  userAvatar,
  userName,
  userHandle,
  userId,
  reels,
  followedProfiles,
  likedContentIds,
  inFeededContentIds,
  onContentFeedback,
}: {
  openCreator: (handle: string) => void;
  openHashtag: (tag: string) => void;
  hypedReels: Set<number>;
  onHype: (reelId: number) => number | null;
  followedHandles: Set<string>;
  onToggleFollow: (handle: string) => boolean;
  onDropToSquad: (squadId: number, reelId: number) => void;
  squads: Squad[];
  swapOn: boolean;
  swapHandle: string;
  userAvatar: string;
  userName: string;
  userHandle: string;
  userId: string | null;
  reels: Reel[];
  followedProfiles: FollowedProfile[];
  likedContentIds: Set<string>;
  inFeededContentIds: Set<string>;
  onContentFeedback: (contentId: string, action: 'like' | 'in_feed', active: boolean) => void;
}) {
  const { showToast } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [likedReels, setLikedReels] = useState<Set<number>>(new Set());
  const [inFeededReels, setInFeededReels] = useState<Set<number>>(new Set());
  const [burstReel, setBurstReel] = useState<number | null>(null);
  const hypes = MAX_HYPES - hypedReels.size;
  const [hypePulse, setHypePulse] = useState(false);
  const [hypeFloatText, setHypeFloatText] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [selectedDropReelId, setSelectedDropReelId] = useState<number | null>(null);
  const [droppedReelId, setDroppedReelId] = useState<number | null>(null);
  const [dropFeedbackSquadId, setDropFeedbackSquadId] = useState<number | null>(null);
  const droppedReelRef = useRef<number | null>(null);
  const dropFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [followRipple, setFollowRipple] = useState<number | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentReelId, setCommentReelId] = useState<number | null>(null);
  const [commentLists, setCommentLists] = useState<Record<string, Comment[]>>(
    () => readCommentLists(userId),
  );
  const [commentError, setCommentError] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const swapPartner = followedProfiles.find((partner) => partner.username === swapHandle);
  const candidateSwapReels = reels
    .map((reel, index) => ({
      reel,
      index,
    }))
    .filter(({ reel }) => reel.handle === swapHandle)
    .sort((a, b) => a.index - b.index)
    .map(({ reel }) => reel);
  const visibleReels = swapOn ? candidateSwapReels : reels;

  useEffect(() => {
    setCommentLists(readCommentLists(userId));
  }, [userId]);

  useEffect(() => () => {
    if (dropFeedbackTimerRef.current) clearTimeout(dropFeedbackTimerRef.current);
  }, []);

  useEffect(() => {
    setCurrentIdx(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      updateReelScrollEffects(scrollRef.current);
    }
  }, [swapOn, swapHandle]);

  // Track which reel is centered
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateReelScrollEffects(el);
    const handler = () => {
      if (scrollFrameRef.current === null) {
        scrollFrameRef.current = requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          if (scrollRef.current) updateReelScrollEffects(scrollRef.current);
        });
      }
      const idx = Math.round(el.scrollTop / el.clientHeight);
      if (idx !== currentIdx && idx >= 0 && idx < visibleReels.length) {
        if (droppedReelRef.current !== null) {
          droppedReelRef.current = null;
          setDroppedReelId(null);
        }
        setCurrentIdx(idx);
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => {
      el.removeEventListener('scroll', handler);
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [currentIdx, visibleReels.length]);

  const currentReel = visibleReels[currentIdx] ?? visibleReels[0];

  const toggleLike = (reel: Reel) => {
    if (swapOn) return;
    if (reel.contentId) {
      onContentFeedback(reel.contentId, 'like', !likedContentIds.has(reel.contentId));
      return;
    }
    const { id } = reel;
    setLikedReels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInFeed = (reel: Reel) => {
    if (swapOn) return;
    if (reel.contentId) {
      const active = !inFeededContentIds.has(reel.contentId);
      onContentFeedback(reel.contentId, 'in_feed', active);
      if (active) {
        setBurstReel(reel.id);
        setTimeout(() => setBurstReel(null), 1100);
      } else {
        showToast('Removed from Feed', 'default');
      }
      return;
    }
    const { id } = reel;
    setInFeededReels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setBurstReel(id);
        setTimeout(() => setBurstReel(null), 1100);
      }
      return next;
    });
    if (inFeededReels.has(id)) showToast('Removed from Feed', 'default');
  };

  const handleHype = (reel: Reel) => {
    if (swapOn) return;
    const remaining = onHype(reel.id);
    if (remaining === null) return;
    setHypePulse(true);
    setTimeout(() => setHypePulse(false), 600);
    setHypeFloatText('You hyped this reel');
    setTimeout(() => setHypeFloatText(null), 1200);
    showToast(`You hyped this reel - ${remaining}/${MAX_HYPES} hypes left`, 'purple');
  };

  const handleDrop = (squadId: number) => {
    if (swapOn) return;
    if (selectedDropReelId === null || droppedReelRef.current === selectedDropReelId) return;
    const reel = visibleReels.find((item) => item.id === selectedDropReelId);
    if (!reel) return;
    droppedReelRef.current = reel.id;
    setDroppedReelId(reel.id);
    onDropToSquad(squadId, reel.id);
    setDropFeedbackSquadId(squadId);
    if (dropFeedbackTimerRef.current) clearTimeout(dropFeedbackTimerRef.current);
    dropFeedbackTimerRef.current = setTimeout(() => {
      setDropFeedbackSquadId(null);
      setDropOpen(false);
      dropFeedbackTimerRef.current = null;
    }, 900);
    showToast('Reel sent', 'success');
  };

  const toggleFollow = (handle: string) => {
    if (swapOn) return;
    onToggleFollow(handle);
    setFollowRipple(currentReel?.id ?? null);
    setTimeout(() => setFollowRipple(null), 600);
  };

  const openComments = (reel: Reel) => {
    setCommentReelId(reel.id);
    setCommentError('');
    setCommentOpen(true);
    if (isSupabasePostId(reel.contentId)) {
      const key = contentCommentListKey('reel', reel.id, reel.contentId);
      setCommentsLoading(true);
      void loadPostComments(reel.contentId, userId)
        .then((comments) => setCommentLists((previous) => ({ ...previous, [key]: comments })))
        .catch((error: unknown) => {
          console.error('Could not load reel comments.', error);
          setCommentError(error instanceof Error ? error.message : 'Could not load comments. Please try again.');
        })
        .finally(() => setCommentsLoading(false));
    } else {
      setCommentsLoading(false);
    }
  };

  const sendComment = async (text: string, parentId?: Comment['id']): Promise<boolean> => {
    if (!text || commentReelId === null) return false;
    const reel = visibleReels.find((item) => item.id === commentReelId);
    if (!reel) return false;
    const key = contentCommentListKey('reel', reel.id, reel.contentId);
    setCommentError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(reel.contentId)) {
        if (!userId) throw new Error('Sign in to comment on this reel.');
        if (parentId !== undefined && typeof parentId !== 'string') {
          throw new Error('Could not reply to this comment.');
        }
        const comment = await addPostComment({
          postId: reel.contentId,
          userId,
          username: userName,
          handle: userHandle,
          avatar: userAvatar,
          content: text,
          parentId,
        });
        setCommentLists((previous) => ({
          ...previous,
          [key]: [...(previous[key] ?? []), comment],
        }));
      } else {
        const comment: Comment = {
          id: Date.now(),
          userId,
          parentId: parentId ?? null,
          username: userName,
          handle: userHandle,
          avatar: userAvatar,
          text,
          time: 'now',
          likes: 0,
          likedByMe: false,
        };
        setCommentLists(saveLocalComment(userId, key, comment));
      }
      return true;
    } catch (error) {
      console.error('Could not save reel comment.', error);
      setCommentError(toCommentError(error).message);
      return false;
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleReelCommentLike = async (comment: Comment) => {
    const reel = visibleReels.find((item) => item.id === commentReelId);
    if (!reel) return;
    const key = contentCommentListKey('reel', reel.id, reel.contentId);
    const liked = !(comment.likedByMe ?? false);
    setCommentError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(reel.contentId)) {
        if (!userId || typeof comment.id !== 'string') throw new Error('Sign in to like comments.');
        await setPostCommentLike(comment.id, userId, liked);
        setCommentLists((previous) => ({
          ...previous,
          [key]: (previous[key] ?? []).map((item) => item.id === comment.id
            ? { ...item, likes: Math.max(0, item.likes + (liked ? 1 : -1)), likedByMe: liked }
            : item),
        }));
      } else {
        setCommentLists(toggleLocalCommentLike(userId, key, comment.id, liked));
      }
    } catch (error) {
      console.error('Could not update reel comment like.', error);
      setCommentError(toCommentError(error).message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const deleteReelComment = async (comment: Comment) => {
    const reel = visibleReels.find((item) => item.id === commentReelId);
    if (!reel || comment.userId !== userId) return;
    const key = contentCommentListKey('reel', reel.id, reel.contentId);
    setCommentError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(reel.contentId)) {
        if (!userId || typeof comment.id !== 'string') throw new Error('Sign in to delete your comment.');
        await deletePostCommentRecord(comment.id, userId);
        setCommentLists((previous) => ({
          ...previous,
          [key]: (previous[key] ?? []).filter((item) =>
            item.id !== comment.id && item.parentId !== comment.id,
          ),
        }));
      } else {
        setCommentLists(removeLocalComment(userId, key, comment.id));
      }
    } catch (error) {
      console.error('Could not delete reel comment.', error);
      setCommentError(toCommentError(error).message);
    } finally {
      setCommentsLoading(false);
    }
  };

  return (
    <div data-theme-content="media" className="relative h-full overflow-hidden bg-black">
      {swapOn && swapPartner && (
        <div className="pointer-events-none absolute left-4 right-16 top-4 z-20 flex items-center gap-2 rounded-full border border-purple-300/25 bg-black/45 px-3 py-2 backdrop-blur-md">
          <Sparkles size={14} className="shrink-0 text-purple-300" />
          <span className="truncate text-xs font-semibold text-white/90">
            {swapPartner.display_name || swapPartner.username}'s reels
          </span>
        </div>
      )}
      {/* Vertical scroll feed */}
      <div
        ref={scrollRef}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth"
      >
        {visibleReels.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
            <Play size={32} className="text-green-300" />
            <h2 className="mt-4 text-lg font-bold">No reels yet</h2>
            <p className="mt-2 text-sm text-white/45">Reels from creators across the community will appear here.</p>
          </div>
        )}
        {visibleReels.map((reel, idx) => {
          const isFollowed = followedHandles.has(reel.handle);
          const comments = commentLists[contentCommentListKey('reel', reel.id, reel.contentId)] ?? [];
          return (
            <ReelCard
              key={reel.id}
              reel={reel}
              videoUrl={reel.mediaUrl ?? ''}
              active={idx === currentIdx}
              liked={reel.contentId ? likedContentIds.has(reel.contentId) : likedReels.has(reel.id)}
              inFeeded={reel.contentId ? inFeededContentIds.has(reel.contentId) : inFeededReels.has(reel.id)}
              bursting={burstReel === reel.id}
              hypePulse={hypePulse && idx === currentIdx}
              hypeFloatText={hypeFloatText && idx === currentIdx ? hypeFloatText : null}
              hypes={hypes}
              hyped={hypedReels.has(reel.id)}
              followed={isFollowed}
              readOnly={swapOn}
              followRipple={followRipple === reel.id}
              commentCount={comments.length}
              dropUsed={droppedReelId === reel.id}
              onLike={() => toggleLike(reel)}
              onInFeed={() => handleInFeed(reel)}
              onHype={() => handleHype(reel)}
              onDrop={() => {
                if (droppedReelId !== reel.id) {
                  setSelectedDropReelId(reel.id);
                  setDropOpen(true);
                }
              }}
              onOpenProfile={() => openCreator(reel.handle)}
              onOpenHashtag={openHashtag}
              onFollow={() => toggleFollow(reel.handle)}
              onOpenComments={() => openComments(reel)}
            />
          );
        })}
      </div>

      {/* Drop modal */}
      <BottomSheet
        open={dropOpen}
        onClose={() => setDropOpen(false)}
        title="Drop to Squad"
      >
        <p className="mb-4 text-center text-sm text-white/50">
          Pick a private group to drop this reel. Their streak grows by +1 day.
        </p>
        <div className="space-y-2.5">
          {squads.length === 0 && (
            <p className="py-4 text-center text-sm text-white/45">Create a real squad before sharing a reel with one.</p>
          )}
          {squads.map((squad) => (
            <button
              key={squad.id}
              onClick={() => handleDrop(squad.id)}
              disabled={dropFeedbackSquadId !== null}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                dropFeedbackSquadId === squad.id
                  ? 'border-green-400/80 bg-green-500/10 ring-2 ring-green-400/35'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              } disabled:cursor-default`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={squad.avatar}
                  alt={squad.name}
                  className="h-11 w-11 rounded-full object-cover ring-1 ring-white/15"
                />
                <div>
                  <p className="font-semibold text-white">{squad.name}</p>
                  <p className="text-xs text-white/40">{squad.members} members</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5">
                <span className="text-sm font-bold text-orange-400">{squad.streak} days</span>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={() => setDropOpen(false)}
          className="mt-4 w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-white/60 transition-colors hover:bg-white/5"
        >
          Cancel
        </button>
      </BottomSheet>

      {/* Comment modal */}
      <BottomSheet
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
      >
        <CommentThread
          comments={commentReelId !== null
            ? (commentLists[contentCommentListKey(
                'reel',
                commentReelId,
                visibleReels.find((reel) => reel.id === commentReelId)?.contentId,
              )] ?? [])
            : []}
          currentUserId={userId}
          error={commentError}
          loading={commentsLoading}
          onSend={sendComment}
          onLike={toggleReelCommentLike}
          onDelete={deleteReelComment}
        />
      </BottomSheet>

    </div>
  );
}

function ReelCard({
  reel,
  videoUrl,
  active,
  liked,
  inFeeded,
  bursting,
  hypePulse,
  hypeFloatText,
  hypes,
  hyped,
  followed,
  readOnly,
  followRipple,
  commentCount,
  dropUsed,
  onLike,
  onInFeed,
  onHype,
  onDrop,
  onOpenProfile,
  onOpenHashtag,
  onFollow,
  onOpenComments,
}: {
  reel: Reel;
  videoUrl: string;
  active: boolean;
  liked: boolean;
  inFeeded: boolean;
  bursting: boolean;
  hypePulse: boolean;
  hypeFloatText: string | null;
  hypes: number;
  hyped: boolean;
  followed: boolean;
  readOnly: boolean;
  followRipple: boolean;
  commentCount: number;
  dropUsed: boolean;
  onLike: () => void;
  onInFeed: () => void;
  onHype: () => void;
  onDrop: () => void;
  onOpenProfile: () => void;
  onOpenHashtag: (tag: string) => void;
  onFollow: () => void;
  onOpenComments: () => void;
}) {
  const [heartPop, setHeartPop] = useState(false);
  const [doubleTapHeartId, setDoubleTapHeartId] = useState(0);
  const [likeFeedback, setLikeFeedback] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hypeDisabled = readOnly || hypes <= 0 || hyped;

  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
    if (likeFeedbackTimer.current) clearTimeout(likeFeedbackTimer.current);
  }, []);

  const handleVideoClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (!readOnly) {
        setDoubleTapHeartId((id) => id + 1);
        if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
        doubleTapTimer.current = setTimeout(() => {
          setDoubleTapHeartId(0);
          doubleTapTimer.current = null;
        }, 900);
        if (!liked) handleLike();
      }
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play().catch(() => setVideoFailed(true));
      } else {
        video.pause();
      }
    }, 250);
  };

  const handleLike = () => {
    if (!liked) {
      setHeartPop(true);
      setTimeout(() => setHeartPop(false), 350);
      setLikeFeedback(true);
      if (likeFeedbackTimer.current) clearTimeout(likeFeedbackTimer.current);
      likeFeedbackTimer.current = setTimeout(() => setLikeFeedback(false), 1200);
    }
    onLike();
  };

  return (
    <div className="reel-scroll-card relative h-full w-full snap-start snap-always overflow-hidden">
      {/* Video placeholder */}
      <div
        onClick={handleVideoClick}
        className={`absolute inset-0 bg-gradient-to-br ${reel.gradient}`}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_50%)]" />
      </div>

      {active && !videoFailed && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={handleVideoClick}
          className="animate-reel-transition absolute inset-0 h-full w-full object-cover"
        />
      )}

      {active && !isPlaying && !videoFailed && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-full bg-black/45 p-4 text-white backdrop-blur-sm">
            <Play size={36} fill="white" />
          </div>
        </div>
      )}

      {active && doubleTapHeartId > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <Heart
            key={doubleTapHeartId}
            size={104}
            fill="white"
            color="white"
            className="animate-reel-heart drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          />
        </div>
      )}

      {active && bursting && (
        <div className="animate-in-feed-pop pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2">
          <Target size={76} color="white" strokeWidth={1.8} />
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
            Added to your Feed
          </span>
        </div>
      )}

      {active && likeFeedback && (
        <div className="animate-float-up pointer-events-none absolute bottom-44 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm">
          You liked this reel
        </div>
      )}

      {/* Top gradient for readability */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />

      {/* Bottom gradient */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Left: caption info */}
      <div className="absolute bottom-24 left-4 right-20 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={onOpenProfile} className="transition-transform active:scale-90">
            <img
              src={reel.avatar}
              alt={reel.username}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20"
            />
          </button>
          <button onClick={onOpenProfile} className="font-bold text-white drop-shadow-lg transition-transform active:scale-95">
            {reel.username}
          </button>
          {reel.verified && <BadgeCheck size={16} className="text-blue-400 drop-shadow-lg" />}
          {/* Follow button */}
          <button
            onClick={onFollow}
            disabled={readOnly}
            className={`relative ml-1 overflow-hidden rounded-lg border px-3 py-0.5 text-xs font-bold transition-all active:scale-90 ${
              followed
                ? 'border-white/20 bg-white/5 text-white/60'
                : 'border-green-400/50 bg-green-500/15 text-green-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.4)]'
            }`}
          >
            {followRipple && <span className="animate-follow-ripple absolute inset-0 rounded-lg bg-green-400/30" />}
            <span className="relative">{followed ? 'Following' : 'Follow'}</span>
          </button>
        </div>
        <p className="text-sm text-white/90 drop-shadow-lg">{reel.caption}</p>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([
            ...reel.tags.map((tag) => tag.replace(/^#/, '')),
            ...reel.audienceTags.map((tag) => tag.replace(/^#/, '')),
          ])].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onOpenHashtag(tag)}
              className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-xs font-medium text-zinc-300 drop-shadow"
            >
              #{tag}
            </button>
          ))}
        </div>
        {/* Badges */}
        {(reel.hasBlueprintBadge || reel.hasHypeMagnatBadge) && (
          <div className="flex gap-1.5 pt-1">
            {reel.hasBlueprintBadge && (
              <span className="flex items-center gap-1 rounded-full border border-green-400/40 bg-green-500/20 px-2.5 py-0.5 text-[10px] font-bold text-green-300 backdrop-blur-sm">
                <Target size={10} /> Blueprint
              </span>
            )}
            {reel.hasHypeMagnatBadge && (
              <span className="flex items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold text-purple-300 backdrop-blur-sm">
                <Zap size={10} /> Hype Magnat
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 pt-1 text-xs text-white/60">
          <Music2 size={12} />
          <span>Original audio - {reel.handle}</span>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5">
        {/* Like */}
        <ActionButton
          onClick={handleLike}
          disabled={readOnly}
          icon={
            <Heart
              size={32}
              className={heartPop ? 'animate-heart-pop' : ''}
              fill={liked ? '#f43f5e' : 'none'}
              color={liked ? '#f43f5e' : 'white'}
            />
          }
          label={formatCount(reel.likes + (liked ? 1 : 0))}
        />

        {/* In-Feed (Target) - TOGGLE */}
        <ActionButton
          onClick={onInFeed}
          disabled={readOnly}
          icon={
            <div className={bursting ? 'animate-neon-burst' : ''}>
              <Target
                size={32}
                fill={inFeeded ? '#4ade80' : 'none'}
                color={inFeeded ? '#4ade80' : 'white'}
                strokeWidth={inFeeded ? 2.5 : 2}
              />
            </div>
          }
          label={inFeeded ? 'In-Feeded' : 'In-Feed'}
          glow={inFeeded ? 'green' : undefined}
        />

        {/* Hype (Lightning) */}
        <div className="relative flex flex-col items-center">
          {hypeFloatText && (
            <div className="animate-float-up absolute -top-2 whitespace-nowrap text-xs font-bold text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]">
              {hypeFloatText}
            </div>
          )}
          <button
            onClick={onHype}
            disabled={hypeDisabled}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-90 ${
              hypeDisabled
                ? 'cursor-not-allowed bg-white/5'
                : hypePulse
                ? 'animate-hype-pulse bg-purple-500/20'
                : 'bg-white/10'
            }`}
          >
            <Zap
              size={30}
              fill={hypeDisabled ? 'none' : '#a855f7'}
              color={hypeDisabled ? '#666' : '#a855f7'}
              strokeWidth={2.5}
              className={hypeDisabled ? '' : 'drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]'}
            />
            <span
              className={`absolute -top-1 -right-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                hypeDisabled
                  ? 'bg-zinc-700 text-zinc-400'
                  : 'bg-purple-500 text-white drop-shadow-[0_0_4px_rgba(168,85,247,0.8)]'
              }`}
            >
              {hypes}/{MAX_HYPES}
            </span>
          </button>
          <span className="mt-1 text-xs font-semibold text-white/80 drop-shadow-lg">{hyped ? 'Hyped' : 'Hype'}</span>
        </div>

        {/* Drop (Package/Box) */}
        <ActionButton
          onClick={onDrop}
          disabled={readOnly || dropUsed}
          icon={<Package size={30} color="white" />}
          label={dropUsed ? 'Dropped' : 'Drop'}
        />

        {/* Comments */}
        <ActionButton
          onClick={onOpenComments}
          disabled={readOnly}
          icon={<MessageCircle size={30} color="white" />}
          label={formatCount(commentCount)}
        />

        {/* Share */}
        <ActionButton
          onClick={() => {}}
          disabled={readOnly}
          icon={<Share2 size={28} color="white" />}
          label={formatCount(reel.shares)}
        />
      </div>

      {/* Side swipe hint */}
      {active && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col gap-1">
          <div className="h-8 w-1 rounded-full bg-white/30" />
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  glow,
  disabled = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  glow?: 'green' | 'purple';
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 transition-transform ${disabled ? 'cursor-not-allowed opacity-50' : 'active:scale-90'}`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm transition-all ${
          glow === 'green'
            ? 'bg-green-500/20 ring-1 ring-green-400/40'
            : glow === 'purple'
            ? 'bg-purple-500/20 ring-1 ring-purple-400/40'
            : 'bg-white/10'
        }`}
      >
        {icon}
      </div>
      <span className="text-xs font-semibold text-white drop-shadow-lg">{label}</span>
    </button>
  );
}
