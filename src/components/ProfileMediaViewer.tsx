import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Package, Play, Target, Zap } from 'lucide-react';
import type { Comment, ProfileMediaContent, Squad } from '@/types';
import CommentThread from '@/components/CommentThread';
import BottomSheet from '@/components/BottomSheet';
import { formatCount, MAX_HYPES } from '@/data/mockData';
import { useToast } from '@/components/ToastContext';
import {
  addPostComment,
  contentCommentListKey,
  deletePostComment,
  isSupabasePostId,
  loadPostComments,
  readCommentLists,
  removeLocalComment,
  saveLocalComment,
  setPostCommentLike,
  toCommentError,
  toggleLocalCommentLike,
} from '@/lib/postComments';

export default function ProfileMediaViewer({
  content,
  currentUserId,
  currentUserName,
  currentUserHandle,
  currentUserAvatar,
  likedContentIds,
  inFeededContentIds,
  onContentFeedback,
  reelId,
  hypedReels,
  onHype,
  squads,
  onDropToSquad,
  onBack,
}: {
  content: ProfileMediaContent;
  currentUserId: string | null;
  currentUserName: string;
  currentUserHandle: string;
  currentUserAvatar: string;
  likedContentIds: Set<string>;
  inFeededContentIds: Set<string>;
  onContentFeedback: (contentId: string, action: 'like' | 'in_feed', active: boolean) => void;
  reelId: number | null;
  hypedReels: Set<number>;
  onHype: (reelId: number) => number | null;
  squads: Squad[];
  onDropToSquad: (squadId: number, reelId: number) => void;
  onBack: () => void;
}) {
  const {
  contentId,
  localId,
  mediaType,
  mediaUrl,
  caption,
  tags,
  creatorName,
  creatorHandle,
  creatorAvatar,
  } = content;
  const commentKey = useMemo(
    () => contentCommentListKey(mediaType, localId, contentId),
    [contentId, localId, mediaType],
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(true);
  const [hypePulse, setHypePulse] = useState(false);
  const [hypeFeedback, setHypeFeedback] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropped, setDropped] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { showToast } = useToast();
  const feedbackId = contentId ?? `john-profile-${localId}`;
  const liked = likedContentIds.has(feedbackId);
  const inFeeded = inFeededContentIds.has(feedbackId);
  const hyped = reelId !== null && hypedReels.has(reelId);
  const hypesRemaining = MAX_HYPES - hypedReels.size;

  const handleHype = () => {
    if (reelId === null) return;
    const remaining = onHype(reelId);
    if (remaining === null) return;
    setHypePulse(true);
    setTimeout(() => setHypePulse(false), 600);
    setHypeFeedback(true);
    setTimeout(() => setHypeFeedback(false), 1200);
    showToast(`You hyped this reel - ${remaining}/${MAX_HYPES} hypes left`, 'purple');
  };

  const handleDrop = (squadId: number) => {
    if (dropped || reelId === null) return;
    onDropToSquad(squadId, reelId);
    setDropped(true);
    setDropOpen(false);
    showToast('Reel sent', 'success');
  };

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch((playError: unknown) => {
        console.error('Could not play profile reel.', playError);
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  };

  useEffect(() => {
    if (!commentsOpen) return;
    let active = true;
    setCommentsLoading(true);
    setError('');
    const load = async () => {
      try {
        const loaded = isSupabasePostId(contentId)
          ? await loadPostComments(contentId, currentUserId)
          : readCommentLists(currentUserId)[commentKey] ?? [];
        if (active) setComments(loaded);
      } catch (loadError) {
        console.error('Could not load profile media comments.', loadError);
        if (active) setError(toCommentError(loadError).message);
      } finally {
        if (active) setCommentsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [commentKey, commentsOpen, contentId, currentUserId]);

  const sendComment = async (text: string, parentId?: Comment['id']): Promise<boolean> => {
    setError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(contentId)) {
        if (!currentUserId) throw new Error('Sign in to comment.');
        if (parentId !== undefined && typeof parentId !== 'string') {
          throw new Error('Could not reply to this comment.');
        }
        const comment = await addPostComment({
          postId: contentId,
          userId: currentUserId,
          username: currentUserName,
          handle: currentUserHandle,
          avatar: currentUserAvatar,
          content: text,
          parentId,
        });
        setComments((previous) => [...previous, comment]);
      } else {
        const comment: Comment = {
          id: Date.now(),
          userId: currentUserId,
          parentId: parentId ?? null,
          username: currentUserName,
          handle: currentUserHandle,
          avatar: currentUserAvatar,
          text,
          time: 'now',
          likes: 0,
          likedByMe: false,
        };
        const updated = saveLocalComment(currentUserId, commentKey, comment);
        setComments(updated[commentKey] ?? []);
      }
      return true;
    } catch (saveError) {
      console.error('Could not save profile media comment.', saveError);
      setError(toCommentError(saveError).message);
      return false;
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleLike = async (comment: Comment) => {
    setError('');
    setCommentsLoading(true);
    try {
      const liked = !(comment.likedByMe ?? false);
      if (isSupabasePostId(contentId)) {
        if (!currentUserId || typeof comment.id !== 'string') throw new Error('Sign in to like comments.');
        await setPostCommentLike(comment.id, currentUserId, liked);
        setComments((previous) => previous.map((item) => item.id === comment.id
          ? { ...item, likes: Math.max(0, item.likes + (liked ? 1 : -1)), likedByMe: liked }
          : item));
      } else {
        const updated = toggleLocalCommentLike(currentUserId, commentKey, comment.id, liked);
        setComments(updated[commentKey] ?? []);
      }
    } catch (likeError) {
      console.error('Could not update comment like.', likeError);
      setError(toCommentError(likeError).message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const deleteComment = async (comment: Comment) => {
    if (comment.userId !== currentUserId) return;
    setError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(contentId)) {
        if (!currentUserId || typeof comment.id !== 'string') throw new Error('Sign in to delete your comment.');
        await deletePostComment(comment.id, currentUserId);
        setComments((previous) => previous.filter((item) =>
          item.id !== comment.id && item.parentId !== comment.id,
        ));
      } else {
        const updated = removeLocalComment(currentUserId, commentKey, comment.id);
        setComments(updated[commentKey] ?? []);
      }
    } catch (deleteError) {
      console.error('Could not delete profile media comment.', deleteError);
      setError(toCommentError(deleteError).message);
    } finally {
      setCommentsLoading(false);
    }
  };

  return (
    <div
      className={`absolute inset-0 z-[60] bg-black text-white ${
        mediaType === 'reel' ? 'overflow-hidden' : 'overflow-y-auto'
      }`}
      role="dialog"
      aria-modal="true"
    >
      {mediaType === 'reel' ? (
        <div className="relative h-full w-full overflow-hidden">
          <video
            ref={videoRef}
            src={mediaUrl}
            autoPlay
            muted
            loop
            playsInline
            onClick={toggleVideo}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {!isPlaying && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rounded-full bg-black/45 p-4 text-white backdrop-blur-sm">
                <Play size={36} fill="white" />
              </span>
            </div>
          )}
          {hypeFeedback && (
            <div className="animate-float-up pointer-events-none absolute bottom-44 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold text-purple-200 shadow-lg backdrop-blur-sm">
              You hyped this reel
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 to-transparent" />
          <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-3 px-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{creatorName}</p>
              <p className="truncate text-[10px] text-white/60">@{creatorHandle}</p>
            </div>
          </header>
          <div className="absolute bottom-8 left-4 right-20 z-20 space-y-2">
            <div className="flex items-center gap-2">
              {creatorAvatar && <img src={creatorAvatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30" />}
              <span className="text-sm font-bold drop-shadow">{creatorName}</span>
            </div>
            {caption && <p className="text-sm text-white/90 drop-shadow">{caption}</p>}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => <span key={tag} className="text-xs font-medium text-zinc-300 drop-shadow">{tag.startsWith('#') ? tag : `#${tag}`}</span>)}
              </div>
            )}
          </div>
          <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={() => onContentFeedback(feedbackId, 'like', !liked)}
              aria-label={liked ? 'Unlike reel' : 'Like reel'}
              aria-pressed={liked}
              className="flex flex-col items-center gap-1 text-xs font-semibold text-white drop-shadow"
            >
              <Heart size={32} fill={liked ? '#f43f5e' : 'none'} color={liked ? '#f43f5e' : 'white'} />
              {formatCount(content.likes + Number(liked))}
            </button>
            <button
              type="button"
              onClick={() => onContentFeedback(feedbackId, 'in_feed', !inFeeded)}
              aria-label={inFeeded ? 'Remove reel from In-Feed' : 'Add reel to In-Feed'}
              aria-pressed={inFeeded}
              className="flex flex-col items-center gap-1 text-xs font-semibold text-white drop-shadow"
            >
              <Target size={32} fill={inFeeded ? '#4ade80' : 'none'} color={inFeeded ? '#4ade80' : 'white'} />
              {inFeeded ? 'In-Feeded' : 'In-Feed'}
            </button>
            <button
              type="button"
              onClick={handleHype}
              disabled={reelId === null || hyped || hypesRemaining <= 0}
              aria-label={hyped ? 'Already hyped' : 'Hype this reel'}
              className="relative flex flex-col items-center gap-1 text-xs font-semibold text-white drop-shadow disabled:opacity-50"
            >
              <Zap
                size={30}
                fill={hyped ? '#a855f7' : 'none'}
                color="#a855f7"
                className={hypePulse ? 'animate-hype-pulse' : ''}
              />
              <span>{hyped ? 'Hyped' : 'Hype'}</span>
              <span className="absolute -right-2 -top-1 rounded-full bg-purple-500 px-1 text-[9px] text-white">
                {hypesRemaining}/{MAX_HYPES}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDropOpen(true)}
              disabled={reelId === null || dropped || squads.length === 0}
              aria-label="Drop reel to a squad"
              className="flex flex-col items-center gap-1 text-xs font-semibold text-white drop-shadow disabled:opacity-50"
            >
              <Package size={28} fill={dropped ? '#4ade80' : 'none'} color={dropped ? '#4ade80' : 'white'} />
              {dropped ? 'Dropped' : 'Drop'}
            </button>
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              aria-label="Open comments"
              className="flex flex-col items-center gap-1 text-xs font-semibold text-white drop-shadow"
            >
              <MessageCircle size={30} />
              {comments.length || 'Comments'}
            </button>
          </div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-black/90 px-4 backdrop-blur">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{creatorName}</p>
              <p className="truncate text-[10px] text-white/40">@{creatorHandle}</p>
            </div>
          </header>
          <div className="mx-auto max-w-[600px] px-4 pb-10">
            <div className="mt-4 flex min-h-56 items-center justify-center overflow-hidden rounded-xl bg-zinc-950">
              <img src={mediaUrl} alt={caption || 'Post'} className="max-h-[65vh] w-full object-contain" />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => onContentFeedback(feedbackId, 'like', !liked)}
                aria-label={liked ? 'Unlike post' : 'Like post'}
                aria-pressed={liked}
                className="flex items-center gap-1.5 text-sm text-white/80"
              >
                <Heart size={22} fill={liked ? '#f43f5e' : 'none'} color={liked ? '#f43f5e' : 'white'} />
                {formatCount(content.likes + Number(liked))}
              </button>
              <button
                type="button"
                onClick={() => onContentFeedback(feedbackId, 'in_feed', !inFeeded)}
                aria-label={inFeeded ? 'Remove post from In-Feed' : 'Add post to In-Feed'}
                aria-pressed={inFeeded}
                className="flex items-center gap-1.5 text-sm text-white/80"
              >
                <Target size={21} fill={inFeeded ? '#4ade80' : 'none'} color={inFeeded ? '#4ade80' : 'white'} />
                {inFeeded ? 'In-Feeded' : 'In-Feed'}
              </button>
              <button type="button" onClick={() => setCommentsOpen(true)} aria-label="Open comments" className="text-white/75">
                <MessageCircle size={21} />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {creatorAvatar ? (
                <img src={creatorAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                  {creatorName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold">{creatorName}</span>
            </div>
            {caption && <p className="mt-3 whitespace-pre-wrap text-sm text-white/80">{caption}</p>}
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                {tags.map((tag) => <span key={tag} className="text-xs text-zinc-300">{tag.startsWith('#') ? tag : `#${tag}`}</span>)}
              </div>
            )}
          </div>
        </div>
      )}
      <BottomSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        title={`${comments.length} Comments`}
        showBackButton
      >
        <CommentThread
          comments={comments}
          currentUserId={currentUserId}
          error={error}
          loading={commentsLoading}
          onSend={sendComment}
          onLike={toggleLike}
          onDelete={deleteComment}
        />
      </BottomSheet>
      <BottomSheet
        open={dropOpen}
        onClose={() => setDropOpen(false)}
        title="Drop to Squad"
      >
        <p className="mb-4 text-center text-sm text-white/50">
          Pick a private group to drop this reel. Their streak grows by +1 day.
        </p>
        <div className="space-y-2.5">
          {squads.map((squad) => (
            <button
              key={squad.id}
              type="button"
              onClick={() => handleDrop(squad.id)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left hover:bg-white/10"
            >
              <span className="flex items-center gap-3">
                <img src={squad.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                <span>
                  <span className="block font-semibold text-white">{squad.name}</span>
                  <span className="text-xs text-white/40">{squad.members} members</span>
                </span>
              </span>
              <span className="text-sm font-bold text-orange-400">{squad.streak} days</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setDropOpen(false)} className="mt-4 w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-white/60">
          Cancel
        </button>
      </BottomSheet>
    </div>
  );
}
