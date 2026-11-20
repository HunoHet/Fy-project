import { useEffect, useState } from 'react';
import { ArrowLeft, Clapperboard, Grid3x3, Image as ImageIcon, Send, UserPlus } from 'lucide-react';
import { useToast } from '@/components/ToastContext';
import { supabase } from '@/lib/supabase';
import type { ProfileMediaContent } from '@/types';

interface Account {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  sync_points: number;
}

interface AccountPost {
  id: string;
  media_type: 'post' | 'reel';
  media_url: string;
  caption: string;
  tags: string[];
}

export function AccountProfile({
  handle,
  onBack,
  onSendMessage,
  following,
  onToggleFollow,
  onOpenMedia,
  readOnly = false,
}: {
  handle: string;
  onBack: () => void;
  onSendMessage: (handle: string) => void;
  following: boolean;
  onToggleFollow: (handle: string) => boolean;
  onOpenMedia: (content: ProfileMediaContent) => void;
  readOnly?: boolean;
}) {
  const { showToast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [posts, setPosts] = useState<AccountPost[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    const client = supabase;
    let active = true;
    const loadAccount = async () => {
      const { data: row, error: accountError } = await client
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, sync_points')
        .eq('username', handle)
        .maybeSingle();
      if (accountError) {
        console.error('Could not load account profile.', accountError);
        if (active) setError('Could not load this profile.');
        return;
      }
      if (!row) {
        if (active) setError('This account could not be found.');
        return;
      }

      const [followers, followingRows, content] = await Promise.all([
        client.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', row.id),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', row.id),
        client.from('posts').select('id, media_type, media_url, caption, tags').eq('owner_id', row.id).order('created_at', { ascending: false }),
      ]);
      if (followers.error || followingRows.error || content.error) {
        console.error('Could not load profile activity.', followers.error ?? followingRows.error ?? content.error);
        if (active) setError('Could not load this profile’s activity.');
        return;
      }
      if (!active) return;
      setAccount(row);
      setFollowerCount(followers.count ?? 0);
      setFollowingCount(followingRows.count ?? 0);
      setPosts((content.data ?? []) as AccountPost[]);
      setError('');
    };
    void loadAccount();
    return () => {
      active = false;
    };
  }, [handle]);

  const toggleFollow = () => {
    const wasFollowing = following;
    const nowFollowing = onToggleFollow(handle);
    if (wasFollowing && nowFollowing) return;
    showToast(nowFollowing ? `Following @${handle}` : `Unfollowed @${handle}`, nowFollowing ? 'green' : 'default');
  };

  return (
    <div className="animate-overlay-in h-full overflow-y-auto no-scrollbar bg-black pb-24">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <span className="text-sm font-bold text-white">{account?.display_name || `@${handle}`}</span>
      </header>

      {error ? (
        <p role="alert" className="px-6 py-16 text-center text-sm text-white/60">{error}</p>
      ) : !account ? (
        <p role="status" className="px-6 py-16 text-center text-sm text-white/50">Loading profile…</p>
      ) : (
        <section className="px-4 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {account.avatar_url ? (
                <img src={account.avatar_url} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-white/10" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl font-bold text-white/70">
                  {(account.display_name || account.username).slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-white">{account.display_name || account.username}</h1>
                <p className="truncate text-sm text-white/45">@{account.username}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={toggleFollow}
                disabled={readOnly}
                className="flex items-center gap-1.5 rounded-xl border border-green-400/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-200 disabled:opacity-40"
              >
                <UserPlus size={14} /> {following ? 'Following' : 'Follow'}
              </button>
              {following && !readOnly && (
                <button type="button" onClick={() => onSendMessage(account.username)} className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200">
                  <Send size={14} /> Message
                </button>
              )}
            </div>
          </div>
          {account.bio && <p className="mt-4 whitespace-pre-wrap text-sm text-white/70">{account.bio}</p>}

          <div className="mt-5 grid grid-cols-4 gap-1.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
              <p className="font-bold text-white">{posts.length}</p><p className="text-[10px] text-white/40">Posts & reels</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
              <p className="font-bold text-white">{followerCount}</p><p className="text-[10px] text-white/40">Followers</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
              <p className="font-bold text-white">{followingCount}</p><p className="text-[10px] text-white/40">Following</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-center">
              <p className="font-bold text-white">{account.sync_points}</p><p className="text-[10px] text-white/40">Sync Points</p>
            </div>
          </div>

          <h2 className="mb-3 mt-6 flex items-center gap-2 text-sm font-bold text-white/70"><Grid3x3 size={15} /> Posts and reels</h2>
          {posts.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {posts.map((post) => (
                <button
                  type="button"
                  key={post.id}
                  onClick={() => onOpenMedia({
                    contentId: post.id,
                    localId: post.id,
                    mediaType: post.media_type,
                    mediaUrl: post.media_url,
                    caption: post.caption,
                    tags: post.tags ?? [],
                    likes: 0,
                    inFeeds: 0,
                    creatorName: account.display_name || account.username,
                    creatorHandle: account.username,
                    creatorAvatar: account.avatar_url ?? '',
                  })}
                  aria-label={`View ${post.media_type} by ${account.display_name || account.username}`}
                  className="relative aspect-square overflow-hidden rounded-lg bg-zinc-900"
                >
                  {post.media_type === 'reel' ? (
                    <video src={post.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <img src={post.media_url} alt={post.caption || 'Post'} loading="lazy" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white">
                    {post.media_type === 'reel' ? <Clapperboard size={12} /> : <ImageIcon size={12} />}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-5 text-center text-xs text-white/40">No posts yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
