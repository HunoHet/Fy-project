import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BadgeCheck,
  Target,
  Heart,
  MessageCircle,
  MessageSquare,
  Search,
  Sparkles,
  Clapperboard,
  X,
} from 'lucide-react';
import {
  formatCount,
  getCreatorByHandle,
} from '@/data/mockData';
import { useToast } from '@/components/ToastContext';
import BottomSheet from '@/components/BottomSheet';
import CommentThread from '@/components/CommentThread';
import StoriesBar from '@/components/StoriesBar';
import type { Comment, FeedPost, TabKey } from '@/types';
import { supabase } from '@/lib/supabase';
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

interface SearchProfile {
  id?: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export default function FeedScreen({
  goTab,
  openCreator,
  openDM,
  openHashtag,
  followedHandles,
  onToggleFollow,
  swapOn,
  swapHandle,
  setSwapOn,
  setSwapHandle,
  userAvatar,
  userName,
  userHandle,
  currentUserId,
  followedProfiles,
  posts,
  interestTags,
  likedContentIds,
  inFeededContentIds,
  onContentFeedback,
}: {
  goTab: (t: TabKey) => void;
  openCreator: (handle: string) => void;
  openDM: (handle: string) => void;
  openHashtag: (tag: string) => void;
  followedHandles: Set<string>;
  onToggleFollow: (handle: string) => boolean;
  swapOn: boolean;
  swapHandle: string;
  setSwapOn: (enabled: boolean) => void;
  setSwapHandle: (handle: string) => void;
  userAvatar: string;
  userName: string;
  userHandle: string;
  currentUserId: string | null;
  followedProfiles: FollowedProfile[];
  posts: FeedPost[];
  interestTags: string[];
  likedContentIds: Set<string>;
  inFeededContentIds: Set<string>;
  onContentFeedback: (contentId: string, action: 'like' | 'in_feed', active: boolean) => void;
}) {
  const { showToast } = useToast();
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [inFeededPosts, setInFeededPosts] = useState<Set<number>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>(
    () => readCommentLists(currentUserId),
  );
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);
  const [commentError, setCommentError] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showTopicPosts, setShowTopicPosts] = useState(false);
  const [likeAnimation, setLikeAnimation] = useState<{ postId: number; key: number } | null>(null);
  const [likeFeedbackPostId, setLikeFeedbackPostId] = useState<number | null>(null);
  const [inFeedAnimation, setInFeedAnimation] = useState<{ postId: number; key: number } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [searchError, setSearchError] = useState('');
  const likeAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFeedAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeAnimationKey = useRef(0);
  const inFeedAnimationKey = useRef(0);

  useEffect(() => () => {
    if (likeAnimationTimer.current) clearTimeout(likeAnimationTimer.current);
    if (inFeedAnimationTimer.current) clearTimeout(inFeedAnimationTimer.current);
  }, []);
  useEffect(() => {
    setCommentsByPost(readCommentLists(currentUserId));
  }, [currentUserId]);
  const followedSwapPartners = useMemo(
    () => followedProfiles
      .filter((partner) => followedHandles.has(partner.username))
      .map((partner) => ({
        username: partner.display_name || partner.username,
        handle: partner.username,
        avatar: partner.avatar_url ?? '',
      })),
    [followedHandles, followedProfiles],
  );
  const swapPartner =
    followedSwapPartners.find((partner) => partner.handle === swapHandle) ?? followedSwapPartners[0];

  useEffect(() => {
    const query = userSearch.trim().replace(/^@/, '').toLowerCase();
    if (query.length < 2) {
      setSearchProfiles([]);
      setSearchError('');
      return;
    }

    const matchingTestCreator: SearchProfile[] = 'john'.includes(query)
      ? [{
          username: 'john',
          display_name: getCreatorByHandle('john').username,
          avatar_url: getCreatorByHandle('john').avatar,
        }]
      : [];

    let active = true;
    const timer = window.setTimeout(() => {
      if (currentUserId && supabase) {
        void supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .ilike('username', `%${query}%`)
          .neq('id', currentUserId)
          .order('username')
          .limit(8)
          .then(({ data, error }) => {
            if (!active) return;
            if (error) {
              console.error('Could not search user profiles.', error);
              setSearchError('Could not search users. Please try again.');
              setSearchProfiles(matchingTestCreator);
              return;
            }
            setSearchError('');
            const profiles = (data ?? []).map((profile) => ({
              id: profile.id,
              username: profile.username,
              display_name: profile.display_name || profile.username,
              avatar_url: profile.avatar_url || '',
            }));
            setSearchProfiles([
              ...matchingTestCreator,
              ...profiles.filter((profile) => profile.username !== 'john'),
            ]);
          });
        return;
      }

      setSearchProfiles(matchingTestCreator);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [currentUserId, userSearch]);

  useEffect(() => {
    if (followedSwapPartners.length === 0) {
      if (swapOn) setSwapOn(false);
      if (swapHandle) setSwapHandle('');
      return;
    }

    if (!followedSwapPartners.some((partner) => partner.handle === swapHandle)) {
      setSwapHandle(followedSwapPartners[0].handle);
      if (swapOn) setSwapOn(false);
    }
  }, [followedHandles, followedSwapPartners, setSwapHandle, setSwapOn, swapHandle, swapOn]);

  const toggleSwap = () => {
    if (swapOn) {
      setSwapOn(false);
      showToast('Restored your original feed', 'default');
      return;
    }
    if (followedSwapPartners.length === 0 || !swapPartner) return;
    if (swapPartner.handle !== swapHandle) setSwapHandle(swapPartner.handle);
    setSwapOn(true);
    showToast(
      `Now peeking into ${swapPartner.username}'s feed algorithm`,
      'purple',
    );
  };

  const displayName = swapOn && swapPartner ? swapPartner.username : userName;
  const displayHandle = swapOn && swapPartner ? swapPartner.handle : userHandle;
  const basePosts = posts.filter((post) =>
    post.handle === userHandle || followedHandles.has(post.handle),
  );
  const topicPosts = posts.filter((post) =>
    post.handle !== userHandle &&
    !followedHandles.has(post.handle) &&
    post.tags.some((tag) => interestTags.includes(tag.replace(/^#/, '').toLowerCase())),
  );
  const allPosts = swapOn
    ? posts.filter((post) => post.handle === swapHandle)
    : showTopicPosts ? [...basePosts, ...topicPosts] : basePosts;

  const isLiked = (post: FeedPost) =>
    post.contentId ? likedContentIds.has(post.contentId) : likedPosts.has(post.id);
  const isInFeeded = (post: FeedPost) =>
    post.contentId ? inFeededContentIds.has(post.contentId) : inFeededPosts.has(post.id);

  const toggleLike = (post: FeedPost) => {
    if (swapOn) return;
    const liked = isLiked(post);
    if (post.contentId) {
      onContentFeedback(post.contentId, 'like', !liked);
      if (!liked) showLikeAnimation(post.id, true);
      return;
    }
    if (liked) {
      setLikedPosts((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
      return;
    }
    likePost(post.id);
  };

  const showLikeAnimation = (id: number, announce: boolean) => {
    likeAnimationKey.current += 1;
    setLikeAnimation({ postId: id, key: likeAnimationKey.current });
    setLikeFeedbackPostId(announce ? id : null);
    if (likeAnimationTimer.current) clearTimeout(likeAnimationTimer.current);
    likeAnimationTimer.current = setTimeout(() => {
      setLikeAnimation(null);
      setLikeFeedbackPostId(null);
      likeAnimationTimer.current = null;
    }, 1200);
  };

  const likePost = (id: number) => {
    if (swapOn) return;
    const post = allPosts.find((item) => item.id === id);
    if (post?.contentId) {
      const alreadyLiked = isLiked(post);
      if (!alreadyLiked) onContentFeedback(post.contentId, 'like', true);
      showLikeAnimation(id, !alreadyLiked);
      return;
    }
    const alreadyLiked = likedPosts.has(id);
    setLikedPosts((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showLikeAnimation(id, !alreadyLiked);
  };

  const showInFeedAnimation = (postId: number) => {
    inFeedAnimationKey.current += 1;
    setInFeedAnimation({ postId, key: inFeedAnimationKey.current });
    if (inFeedAnimationTimer.current) clearTimeout(inFeedAnimationTimer.current);
    inFeedAnimationTimer.current = setTimeout(() => {
      setInFeedAnimation(null);
      inFeedAnimationTimer.current = null;
    }, 1100);
  };

  const openPostComments = (postId: number) => {
    const post = allPosts.find((item) => item.id === postId);
    setActiveCommentPostId(postId);
    setCommentError('');
    if (post && isSupabasePostId(post.contentId)) {
      const key = contentCommentListKey('post', post.id, post.contentId);
      setCommentsLoading(true);
      void loadPostComments(post.contentId, currentUserId)
        .then((comments) => setCommentsByPost((previous) => ({ ...previous, [key]: comments })))
        .catch((error: unknown) => {
          console.error('Could not load post comments.', error);
          setCommentError(error instanceof Error ? error.message : 'Could not load comments. Please try again.');
        })
        .finally(() => setCommentsLoading(false));
    } else {
      setCommentsLoading(false);
    }
  };

  const sendPostComment = async (text: string, parentId?: Comment['id']): Promise<boolean> => {
    if (!text || activeCommentPostId === null) return false;
    const post = allPosts.find((item) => item.id === activeCommentPostId);
    if (!post) return false;
    const key = contentCommentListKey('post', post.id, post.contentId);
    setCommentError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(post.contentId)) {
        if (!currentUserId) throw new Error('Sign in to comment on this post.');
        if (parentId !== undefined && typeof parentId !== 'string') {
          throw new Error('Could not reply to this comment.');
        }
        const comment = await addPostComment({
          postId: post.contentId,
          userId: currentUserId,
          username: userName,
          handle: userHandle,
          avatar: userAvatar,
          content: text,
          parentId,
        });
        setCommentsByPost((previous) => ({
          ...previous,
          [key]: [...(previous[key] ?? []), comment],
        }));
      } else {
        const comment: Comment = {
          id: Date.now(),
          userId: currentUserId,
          parentId: parentId ?? null,
          username: userName,
          handle: userHandle,
          avatar: userAvatar,
          text,
          time: 'now',
          likes: 0,
          likedByMe: false,
        };
        setCommentsByPost(saveLocalComment(currentUserId, key, comment));
      }
      return true;
    } catch (error) {
      console.error('Could not save post comment.', error);
      setCommentError(toCommentError(error).message);
      return false;
    } finally {
      setCommentsLoading(false);
    }
  };

  const togglePostCommentLike = async (comment: Comment) => {
    const post = allPosts.find((item) => item.id === activeCommentPostId);
    if (!post) return;
    const key = contentCommentListKey('post', post.id, post.contentId);
    const liked = !(comment.likedByMe ?? false);
    setCommentError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(post.contentId)) {
        if (!currentUserId || typeof comment.id !== 'string') throw new Error('Sign in to like comments.');
        await setPostCommentLike(comment.id, currentUserId, liked);
        setCommentsByPost((previous) => ({
          ...previous,
          [key]: (previous[key] ?? []).map((item) => item.id === comment.id
            ? { ...item, likes: Math.max(0, item.likes + (liked ? 1 : -1)), likedByMe: liked }
            : item),
        }));
      } else {
        setCommentsByPost(toggleLocalCommentLike(currentUserId, key, comment.id, liked));
      }
    } catch (error) {
      console.error('Could not update comment like.', error);
      setCommentError(toCommentError(error).message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const deletePostComment = async (comment: Comment) => {
    const post = allPosts.find((item) => item.id === activeCommentPostId);
    if (!post || comment.userId !== currentUserId) return;
    const key = contentCommentListKey('post', post.id, post.contentId);
    setCommentError('');
    setCommentsLoading(true);
    try {
      if (isSupabasePostId(post.contentId)) {
        if (!currentUserId || typeof comment.id !== 'string') throw new Error('Sign in to delete your comment.');
        await deletePostCommentRecord(comment.id, currentUserId);
        setCommentsByPost((previous) => ({
          ...previous,
          [key]: (previous[key] ?? []).filter((item) =>
            item.id !== comment.id && item.parentId !== comment.id,
          ),
        }));
      } else {
        setCommentsByPost(removeLocalComment(currentUserId, key, comment.id));
      }
    } catch (error) {
      console.error('Could not delete post comment.', error);
      setCommentError(toCommentError(error).message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleInFeed = (id: number) => {
    if (swapOn) return;
    const post = allPosts.find((item) => item.id === id);
    const wasInFeeded = post ? isInFeeded(post) : inFeededPosts.has(id);
    if (post?.contentId) {
      onContentFeedback(post.contentId, 'in_feed', !wasInFeeded);
      if (wasInFeeded) showToast('Removed from In-Feed', 'default');
      else showInFeedAnimation(id);
      return;
    }
    setInFeededPosts((prev) => {
      const next = new Set(prev);
      if (wasInFeeded) next.delete(id);
      else next.add(id);
      return next;
    });
    if (wasInFeeded) showToast('Removed from In-Feed', 'default');
    else showInFeedAnimation(id);
  };

  const triggerSwap = () => {
    if (swapOn) return;
    if (!swapOn) toggleSwap();
    showToast('Swap Zone activated - peek into a partner feed', 'purple');
  };

  const activeCommentPost = allPosts.find((post) => post.id === activeCommentPostId);
  const activeCommentKey = activeCommentPost
    ? contentCommentListKey('post', activeCommentPost.id, activeCommentPost.contentId)
    : '';

  return (
    <div className="animate-screen-in h-full overflow-y-auto no-scrollbar bg-black pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        {/* Top row: profile name + swap */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTab('profile')}
              aria-label="Open your profile"
              className="shrink-0 rounded-full transition-transform active:scale-90"
            >
              <img
                src={swapOn && swapPartner?.avatar ? swapPartner.avatar : userAvatar}
                alt={displayName}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-white/20"
              />
            </button>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white">{displayName}</span>
                {swapOn && <Sparkles size={12} className="text-purple-400" />}
              </div>
              <span className="text-[11px] text-white/40">@{displayHandle}</span>
            </div>
          </div>

          {/* Swap Zone toggle */}
          <button
            onClick={toggleSwap}
            disabled={!swapOn && followedSwapPartners.length === 0}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
              swapOn
                ? 'border-purple-400/50 bg-purple-500/20 text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                : followedSwapPartners.length > 0
                  ? 'border-white/15 bg-white/5 text-white/60'
                  : 'cursor-not-allowed border-white/10 bg-white/5 text-white/30'
            }`}
          >
            <ArrowLeftRight size={14} className={swapOn ? 'animate-pulse' : ''} />
            <span>{swapOn ? 'End Swap' : 'The Swap Zone'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 pb-2">
          <span className="shrink-0 text-[11px] font-medium text-white/40">Swap with</span>
          <select
            aria-label="Choose who to swap feeds with"
            value={swapPartner?.handle ?? ''}
            disabled={followedSwapPartners.length === 0}
            onChange={(event) => {
              setSwapHandle(event.target.value);
              setSwapOn(false);
            }}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-purple-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {followedSwapPartners.length === 0 && (
              <option value="" className="bg-zinc-900">
                Follow someone to use Swap Zone
              </option>
            )}
            {followedSwapPartners.map((partner) => (
              <option key={partner.handle} value={partner.handle} className="bg-zinc-900">
                {partner.username} · @{partner.handle}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* Swap banner */}
      <section className="relative z-30 px-4 pt-3" aria-label="Find people">
        <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 px-3 py-2.5 focus-within:border-cyan-400/50">
          <Search size={16} className="shrink-0 text-white/40" />
          <input
            type="search"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Find people by username..."
            aria-label="Search users by username"
            className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
          />
          {userSearch && (
            <button type="button" onClick={() => setUserSearch('')} aria-label="Clear user search">
              <X size={15} className="text-white/45" />
            </button>
          )}
        </label>
        {userSearch.trim().replace(/^@/, '').length > 0 && userSearch.trim().replace(/^@/, '').length < 2 && (
          <p className="px-2 pt-2 text-[11px] text-white/35">Enter at least 2 characters.</p>
        )}
        {searchError && <p role="alert" className="px-2 pt-2 text-[11px] text-red-300">{searchError}</p>}
        {searchProfiles.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
            {searchProfiles.map((profile) => {
              const isFollowed = followedHandles.has(profile.username);
              return (
                <div key={profile.id ?? profile.username} className="flex items-center gap-2.5 border-b border-white/5 px-3 py-2.5 last:border-0">
                  {profile.id ? (
                    profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-cyan-500 text-xs font-bold text-black">
                        {profile.display_name.slice(0, 1).toUpperCase()}
                      </span>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCreator(profile.username)}
                      aria-label={`View ${profile.display_name}'s profile`}
                      className="shrink-0"
                    >
                      <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    </button>
                  )}
                  {profile.id ? (
                    <div className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-semibold text-white">{profile.display_name}</span>
                      <span className="block truncate text-[10px] text-white/40">@{profile.username}</span>
                    </div>
                  ) : (
                    <button type="button" onClick={() => openCreator(profile.username)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-semibold text-white">{profile.display_name}</span>
                      <span className="block truncate text-[10px] text-white/40">@{profile.username}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleFollow(profile.username)}
                    aria-label={`${isFollowed ? 'Unfollow' : 'Follow'} ${profile.display_name}`}
                    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${
                      isFollowed
                        ? 'border-white/15 bg-white/5 text-white/60'
                        : 'border-green-400/40 bg-green-500/15 text-green-200'
                    }`}
                  >
                    {isFollowed ? 'Following' : 'Follow'}
                  </button>
                  <button
                    type="button"
                    disabled={!isFollowed}
                    onClick={() => openDM(profile.username)}
                    aria-label={`Message ${profile.display_name}`}
                    title={isFollowed ? 'Send a message' : 'Follow to message'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <MessageSquare size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {userSearch.trim().replace(/^@/, '').length >= 2 && !searchError && searchProfiles.length === 0 && (
          <p className="px-2 pt-2 text-[11px] text-white/35">No matching users yet.</p>
        )}
      </section>

      {swapOn && swapPartner && (
        <div className="animate-fade-in mx-4 mt-3 rounded-2xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5">
          <p className="text-xs text-purple-200/80">
            Peeking into <b>{swapPartner.username}</b>'s feed algorithm.
            Toggling off restores your original feed.
          </p>
        </div>
      )}

      <StoriesBar
        currentUserId={currentUserId}
        userName={userName}
        userHandle={userHandle}
        userAvatar={userAvatar}
        followedProfiles={followedProfiles}
        mockStory={posts.find((post) => post.handle === 'john') ?? null}
      />

      {/* Posts */}
      <div className="space-y-4 px-4 pt-3">
          {allPosts.map((post) => {
            const liked = isLiked(post);
            const inFeeded = isInFeeded(post);
            const isFollowed = followedHandles.has(post.handle);
            const postCommentKey = contentCommentListKey('post', post.id, post.contentId);
            return (
              <div
                key={post.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50"
              >
                {/* Post header */}
                <div className="flex items-center justify-between gap-2 px-4 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openCreator(post.handle)}
                      className="transition-transform active:scale-90"
                    >
                      <img
                        src={post.avatar}
                        alt={post.username}
                        className="h-8 w-8 rounded-full object-cover ring-1 ring-white/15"
                      />
                    </button>
                    <div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openCreator(post.handle)}
                          className="text-sm font-semibold text-white transition-transform active:scale-95"
                        >
                          {post.username}
                        </button>
                        {post.verified && <BadgeCheck size={13} className="text-blue-400" />}
                      </div>
                      <span className="text-[11px] text-white/40">@{post.handle}</span>
                    </div>
                  </div>
                  {!swapOn && (
                    <button
                      type="button"
                      onClick={() => onToggleFollow(post.handle)}
                      aria-label={`${isFollowed ? 'Unfollow' : 'Follow'} ${post.username}`}
                      className={`shrink-0 rounded-lg border px-3 py-1 text-[11px] font-bold transition-all active:scale-90 ${
                        isFollowed
                          ? 'border-white/20 bg-white/5 text-white/60'
                          : 'border-green-400/50 bg-green-500/15 text-green-300'
                      }`}
                    >
                      {isFollowed ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>

                {/* Media */}
                <div
                  onDoubleClick={() => likePost(post.id)}
                  className="relative mt-3 aspect-square overflow-hidden bg-zinc-900"
                >
                  <img
                    src={post.image}
                    alt={post.caption}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/10" />
                  {likeAnimation?.postId === post.id && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <Heart
                        key={likeAnimation.key}
                        size={104}
                        fill="white"
                        color="white"
                        className="animate-reel-heart drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                      />
                    </div>
                  )}
                  {inFeedAnimation?.postId === post.id && (
                    <div
                      key={inFeedAnimation.key}
                      className="animate-in-feed-pop pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2"
                    >
                      <Target size={76} color="white" strokeWidth={1.8} />
                      <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
                        Added to your Feed
                      </span>
                    </div>
                  )}
                  {likeFeedbackPostId === post.id && (
                    <div
                      key={likeAnimation?.key}
                      className="animate-float-up pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm"
                    >
                      You liked this post
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-5 px-4 pt-3">
                  <button
                    onClick={() => toggleLike(post)}
                    disabled={swapOn}
                    className={`flex items-center gap-1.5 transition-transform ${swapOn ? 'cursor-not-allowed opacity-50' : 'active:scale-90'}`}
                  >
                    <Heart
                      size={22}
                      fill={liked ? '#f43f5e' : 'none'}
                      color={liked ? '#f43f5e' : 'white'}
                    />
                    <span className="text-sm text-white/80">
                      {formatCount(post.likes + (liked ? 1 : 0))}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openPostComments(post.id)}
                    disabled={swapOn}
                    aria-label={`View comments on ${post.username}'s post`}
                    className={`flex items-center gap-1.5 transition-transform ${swapOn ? 'cursor-not-allowed opacity-50' : 'active:scale-90'}`}
                  >
                    <MessageCircle size={21} color="white" />
                    <span className="text-sm text-white/80">
                      {formatCount(post.comments + (commentsByPost[postCommentKey]?.length ?? 0))}
                    </span>
                  </button>
                  <button
                    onClick={() => toggleInFeed(post.id)}
                    disabled={swapOn}
                    aria-label={inFeeded ? 'Remove post from In-Feed' : 'Add post to In-Feed'}
                    aria-pressed={inFeeded}
                    className={`flex items-center gap-1.5 transition-transform ${swapOn ? 'cursor-not-allowed opacity-50' : 'active:scale-90'}`}
                  >
                    <Target
                      size={20}
                      fill={inFeeded ? '#4ade80' : 'none'}
                      color={inFeeded ? '#4ade80' : 'white'}
                    />
                    <span className={`text-sm ${inFeeded ? 'text-green-300' : 'text-white/60'}`}>
                      {post.inFeeds + (inFeeded ? 1 : 0)}
                    </span>
                  </button>
                </div>

                {/* Caption */}
                <div className="px-4 pb-3 pt-2">
                  <p className="text-sm text-white/90">
                    <span className="font-semibold">{post.username}</span>{' '}
                    {post.caption}
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    {post.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => openHashtag(t)}
                        className="text-xs text-zinc-400 transition-colors hover:text-zinc-300"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {!swapOn && !showTopicPosts && topicPosts.length > 0 && (
            <div className="px-4 pt-4">
              <button
                type="button"
                onClick={() => setShowTopicPosts(true)}
                className="w-full rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-500/15"
              >
                Load more topics
                <span className="ml-2 text-xs font-medium text-cyan-200/60">
                  {topicPosts.length} posts matching your interests
                </span>
              </button>
            </div>
          )}

          {/* All Caught Up section */}
          <div className="pt-4 pb-6">
            <p className="text-center text-sm font-semibold text-white/50">You're all caught up!</p>
            <div className="mt-4 space-y-2.5">
              <ChoiceButton
                icon={<ArrowLeftRight size={16} className="text-purple-400" />}
                label="Request a Swap"
                onClick={triggerSwap}
                disabled={swapOn}
                accent="purple"
              />
              <ChoiceButton
                icon={<Clapperboard size={16} className="text-cyan-400" />}
                label="Go to Reels"
                onClick={() => goTab('reels')}
                accent="cyan"
              />
            </div>
          </div>
      </div>
      <BottomSheet
        open={activeCommentPostId !== null}
        onClose={() => setActiveCommentPostId(null)}
        showBackButton
        title={`${formatCount(
          (allPosts.find((post) => post.id === activeCommentPostId)?.comments ?? 0) +
            (commentsByPost[activeCommentKey]?.length ?? 0),
        )} Comments`}
      >
        <CommentThread
          comments={commentsByPost[activeCommentKey] ?? []}
          currentUserId={currentUserId}
          error={commentError}
          loading={commentsLoading}
          onSend={sendPostComment}
          onLike={togglePostCommentLike}
          onDelete={deletePostComment}
        />
      </BottomSheet>
    </div>
  );
}

function ChoiceButton({
  icon,
  label,
  onClick,
  disabled = false,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent: 'purple' | 'green' | 'cyan';
}) {
  const accentMap: Record<string, string> = {
    purple: 'border-purple-400/30 bg-purple-500/10 hover:border-purple-400/50 text-purple-200',
    green: 'border-green-400/30 bg-green-500/10 hover:border-green-400/50 text-green-200',
    cyan: 'border-cyan-400/30 bg-cyan-500/10 hover:border-cyan-400/50 text-cyan-200',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm font-bold transition-all ${disabled ? 'cursor-not-allowed opacity-40' : 'active:scale-[0.97]'} ${accentMap[accent]}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
