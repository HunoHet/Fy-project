import { useCallback, useMemo, useRef, useState } from 'react';
import { useEffect } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { ToastProvider } from '@/components/ToastContext';
import AuthScreen from '@/components/AuthScreen';
import InterestOnboarding from '@/components/InterestOnboarding';
import BottomNav from '@/components/BottomNav';
import ReelsScreen from '@/screens/ReelsScreen';
import FeedScreen from '@/screens/FeedScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import HashtagScreen from '@/screens/HashtagScreen';
import { AccountProfile } from '@/components/AccountProfile';
import { CreatorProfile } from '@/components/CreatorProfile';
import ProfileMediaViewer from '@/components/ProfileMediaViewer';
import { GroupChat, DumpWall } from '@/components/GroupChat';
import SquadsScreen from '@/screens/SquadsScreen';
import {
  currentUser,
  getCreatorByHandle,
  groupChatMessages,
  interestOptions,
  johnPosts,
  MAX_HYPES,
  reels as mockReels,
  squads,
} from '@/data/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toFeedPost, toReel, type FollowedProfile } from '@/lib/socialContent';
import type { PublishedContent } from '@/components/ContentPublisher';
import type { ChatMessage, DumpReel, Interest, ProfileMediaContent, Squad, TabKey, Overlay } from '@/types';

const INTEREST_STORAGE_KEY = 'social-app-interests-v1';
const USER_AVATAR_STORAGE_KEY = 'social-app-user-avatar-v1';
const USER_PROFILE_STORAGE_KEY = 'social-app-user-profile-v1';
const THEME_STORAGE_KEY = 'social-app-theme-v1';
const SQUADS_STORAGE_KEY = 'social-app-squads-v1';
const SQUAD_MESSAGES_STORAGE_KEY = 'social-app-squad-messages-v1';

function interestStorageKey(userId: string | null): string {
  return `${INTEREST_STORAGE_KEY}:${userId ?? 'guest'}`;
}

type UserProfile = {
  name: string;
  handle: string;
  location: string;
  bio: string;
};

function isStoredSquad(value: unknown): value is Squad {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value && typeof value.id === 'number' &&
    'name' in value && typeof value.name === 'string' &&
    'members' in value && typeof value.members === 'number' &&
    'memberProfiles' in value && Array.isArray(value.memberProfiles) &&
    value.memberProfiles.every((member: unknown) =>
      typeof member === 'object' &&
      member !== null &&
      'username' in member &&
      typeof member.username === 'string' &&
      'avatar' in member &&
      typeof member.avatar === 'string',
    ) &&
    'syncPoints' in value && typeof value.syncPoints === 'number' &&
    'streak' in value && typeof value.streak === 'number' &&
    'peakStreak' in value && typeof value.peakStreak === 'number' &&
    'matchingTopics' in value && typeof value.matchingTopics === 'number' &&
    'color' in value && typeof value.color === 'string' &&
    'avatar' in value && typeof value.avatar === 'string'
  );
}

function squadStorageKey(userId: string | null): string {
  return `${SQUADS_STORAGE_KEY}:${userId ?? 'guest'}`;
}

function squadMessagesStorageKey(userId: string | null): string {
  return `${SQUAD_MESSAGES_STORAGE_KEY}:${userId ?? 'guest'}`;
}

function isStoredChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    (typeof value.id === 'number' || typeof value.id === 'string') &&
    'fromMe' in value &&
    typeof value.fromMe === 'boolean' &&
    'username' in value &&
    typeof value.username === 'string' &&
    'avatar' in value &&
    typeof value.avatar === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'time' in value &&
    typeof value.time === 'string'
  );
}

function getStoredSquadMessages(userId: string | null): Record<number, ChatMessage[]> {
  const defaults: Record<number, ChatMessage[]> = {};
  for (const [squadId, messages] of Object.entries(groupChatMessages)) {
    defaults[Number(squadId)] = [...messages];
  }
  try {
    const stored = window.localStorage.getItem(squadMessagesStorageKey(userId));
    if (!stored) return defaults;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('Stored squad messages are invalid; using the default messages.');
      return defaults;
    }

    const restored = { ...defaults };
    for (const [squadId, value] of Object.entries(parsed)) {
      const numericSquadId = Number(squadId);
      if (!Number.isInteger(numericSquadId) || !Array.isArray(value) ||
          !value.every(isStoredChatMessage)) {
        console.warn('Stored squad messages are invalid; using the default messages.');
        return defaults;
      }
      restored[numericSquadId] = value.filter(isStoredChatMessage);
    }
    return restored;
  } catch (error) {
    console.error('Could not read saved squad messages.', error);
    return defaults;
  }
}

function getStoredSquads(userId: string | null): Squad[] {
  try {
    const stored = window.localStorage.getItem(squadStorageKey(userId));
    if (!stored) return squads;
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every(isStoredSquad)) return parsed;
    console.warn('Stored squads are invalid; starting with no squads.');
  } catch (error) {
    console.error('Could not read saved squads.', error);
  }
  return squads;
}

const TEST_CREATOR_PROFILE: FollowedProfile = {
  id: 'test-john',
  username: 'john',
  display_name: 'John',
  avatar_url: getCreatorByHandle('john').avatar,
};

function isInterest(value: unknown): value is Interest {
  return interestOptions.some((option) => option.id === value);
}

function getStoredAvatar(): string {
  try {
    const stored = window.localStorage.getItem(USER_AVATAR_STORAGE_KEY);
    if (stored?.startsWith('data:image/')) return stored;
    if (stored) console.warn('Stored profile picture is invalid; using the default avatar.');
  } catch (error) {
    console.error('Could not read the saved profile picture.', error);
  }
  return currentUser.avatar;
}

function getStoredProfile(): UserProfile {
  try {
    const stored = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        typeof parsed.name === 'string' &&
        'handle' in parsed &&
        typeof parsed.handle === 'string' &&
        'location' in parsed &&
        typeof parsed.location === 'string' &&
        'bio' in parsed &&
        typeof parsed.bio === 'string'
      ) {
        return {
          name: parsed.name,
          handle: parsed.handle,
          location: parsed.location,
          bio: parsed.bio,
        };
      }
      console.warn('Stored profile is invalid; using the default profile.');
    }
  } catch (error) {
    console.error('Could not read the saved profile.', error);
  }
  return { name: currentUser.username, handle: currentUser.handle, location: '', bio: '' };
}

function getStoredTheme(): 'light' | 'dark' {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    if (stored) console.warn('Stored theme is invalid; using dark mode.');
  } catch (error) {
    console.error('Could not read the saved theme.', error);
  }
  return 'dark';
}

function getStoredInterests(userId: string | null): Interest[] | null {
  try {
    const stored = window.localStorage.getItem(interestStorageKey(userId)) ??
      (userId === null ? window.localStorage.getItem(INTEREST_STORAGE_KEY) : null);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every(isInterest)) {
      return [...new Set(parsed)];
    }
    console.warn('Stored interests are invalid; showing onboarding again.');
  } catch (error) {
    console.error('Could not read saved interests.', error);
  }
  return null;
}

function SocialApp({
  authUser,
  onSignOut,
}: {
  authUser: SupabaseUser | null;
  onSignOut: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('reels');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const [hypedReels, setHypedReels] = useState<Set<number>>(new Set());
  const [followedHandles, setFollowedHandles] = useState<Set<string>>(
    () => new Set(),
  );
  const [followedProfiles, setFollowedProfiles] = useState<FollowedProfile[]>([]);
  const [followerProfiles, setFollowerProfiles] = useState<FollowedProfile[]>([]);
  const [userSquads, setUserSquads] = useState<Squad[]>(() => getStoredSquads(authUser?.id ?? null));
  const [squadMessagesById, setSquadMessagesById] = useState<Record<number, ChatMessage[]>>(
    () => getStoredSquadMessages(authUser?.id ?? null),
  );
  const [socialContent, setSocialContent] = useState<PublishedContent[]>([]);
  const [likedContentIds, setLikedContentIds] = useState<Set<string>>(new Set());
  const [likedMockContentIds, setLikedMockContentIds] = useState<Set<string>>(new Set());
  const [inFeededMockContentIds, setInFeededMockContentIds] = useState<Set<string>>(new Set());
  const [mutualFriendCounts, setMutualFriendCounts] = useState<Record<string, number>>({});
  const [mutualFriendError, setMutualFriendError] = useState('');
  const [inFeededContentIds, setInFeededContentIds] = useState<Set<string>>(new Set());
  const [contentError, setContentError] = useState('');
  const [userDropsBySquad, setUserDropsBySquad] = useState<Record<number, DumpReel[]>>({});
  const [viewedDumpReelIds, setViewedDumpReelIds] = useState<Record<number, Set<number>>>({});
  const [userAvatar, setUserAvatar] = useState(() => authUser ? '' : getStoredAvatar());
  const [userProfile, setUserProfile] = useState(() => {
    if (!authUser) return getStoredProfile();
    const metadata = authUser.user_metadata;
    return {
      name: typeof metadata.display_name === 'string'
        ? metadata.display_name
        : typeof metadata.full_name === 'string'
          ? metadata.full_name
          : authUser.email?.split('@')[0] ?? '',
      handle: typeof metadata.username === 'string'
        ? metadata.username
        : authUser.email?.split('@')[0] ?? '',
      location: '',
      bio: '',
    };
  });
  const [followerCount, setFollowerCount] = useState(authUser ? 0 : currentUser.followers);
  const [inFeedCount, setInFeedCount] = useState(0);
  const [userSyncPoints, setUserSyncPoints] = useState(
    authUser ? 0 : currentUser.totalSyncPoints,
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme);
  const [swapOn, setSwapOn] = useState(false);
  const [swapHandle, setSwapHandle] = useState(currentUser.squadPartner?.handle ?? '');
  const [userInterests, setUserInterests] = useState<Interest[] | null>(() =>
    getStoredInterests(authUser?.id ?? null),
  );
  const [interestsLoading, setInterestsLoading] = useState(Boolean(authUser));
  const [editingInterests, setEditingInterests] = useState(false);
  const [messageConversationOpen, setMessageConversationOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [pendingUnfollow, setPendingUnfollow] = useState<string | null>(null);
  const hypedReelIds = useRef(new Set<number>());
  const followedHandleIds = useRef(new Set<string>());
  const testCreatorFollowed = useRef(false);
  const discoveryNoise = useRef(new Map<string, number>());
  const allLikedContentIds = useMemo(
    () => new Set([...likedContentIds, ...likedMockContentIds]),
    [likedContentIds, likedMockContentIds],
  );
  const allInFeededContentIds = useMemo(
    () => new Set([...inFeededContentIds, ...inFeededMockContentIds]),
    [inFeededContentIds, inFeededMockContentIds],
  );

  useEffect(() => {
    setUserSquads(getStoredSquads(authUser?.id ?? null));
    setSquadMessagesById(getStoredSquadMessages(authUser?.id ?? null));
  }, [authUser?.id]);

  const profileUserId = authUser?.id;
  useEffect(() => {
    if (!profileUserId || !supabase) return;
    const syncPoints = Math.max(
      userSyncPoints,
      userSquads.reduce((sum, squad) => sum + squad.syncPoints, 0),
    );
    if (syncPoints === 0) return;
    setUserSyncPoints(syncPoints);
    void supabase.from('profiles').update({ sync_points: syncPoints }).eq('id', profileUserId)
      .then(({ error }) => {
        if (error) console.error('Could not publish sync points.', error);
      });
  }, [profileUserId, userSquads, userSyncPoints]);

  const recommendedReels = useMemo(() => {
    const tagWeights = new Map<string, number>();
    for (const item of socialContent) {
      const likeWeight = likedContentIds.has(item.id) ? 2 : 0;
      const inFeedWeight = inFeededContentIds.has(item.id) ? 3 : 0;
      const weight = likeWeight + inFeedWeight;
      if (!weight) continue;
      for (const tag of item.tags) {
        const normalizedTag = tag.replace(/^#/, '').toLowerCase();
        tagWeights.set(normalizedTag, (tagWeights.get(normalizedTag) ?? 0) + weight);
      }
    }

    const publishedReels = socialContent
      .filter((item) => item.media_type === 'reel')
      .map((item) => {
        let noise = discoveryNoise.current.get(item.id);
        if (noise === undefined) {
          noise = Math.random() * 1.5;
          discoveryNoise.current.set(item.id, noise);
        }
        const tagScore = item.tags.reduce((score, tag) => {
          const normalizedTag = tag.replace(/^#/, '').toLowerCase();
          return score + Math.log1p(tagWeights.get(normalizedTag) ?? 0) * 1.5;
        }, 0);
        const interestMatchCount = item.tags.filter((tag) =>
          (userInterests ?? []).includes(tag.replace(/^#/, '').toLowerCase() as Interest),
        ).length;
        const interestScore = interestMatchCount * 5;
        return { reel: toReel(item), score: tagScore + interestScore + noise };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ reel }) => reel);
    return [
      ...publishedReels.filter((reel) => reel.handle !== TEST_CREATOR_PROFILE.username),
      ...mockReels.filter((reel) => reel.handle === TEST_CREATOR_PROFILE.username),
    ];
  }, [inFeededContentIds, likedContentIds, socialContent, userInterests]);

  useEffect(() => {
    if (!authUser || !supabase) {
      setInterestsLoading(false);
      return;
    }
    setFollowedProfiles([]);
    setFollowerProfiles([]);
    setInFeedCount(0);
    setInterestsLoading(true);
    setUserInterests(getStoredInterests(authUser.id));
    const client = supabase;
    let active = true;
    const loadContentFeedback = async () => {
      const { data, error } = await client
        .from('content_feedback')
        .select('post_id, action')
        .eq('user_id', authUser.id);
      if (error) {
        console.error('Could not load content feedback.', error);
        return;
      }
      if (!active) return;
      setLikedContentIds(new Set((data ?? [])
        .filter((item) => item.action === 'like')
        .map((item) => item.post_id)));
      setInFeededContentIds(new Set((data ?? [])
        .filter((item) => item.action === 'in_feed')
        .map((item) => item.post_id)));
    };
    const loadProfile = async () => {
      const { data, error } = await client
        .from('profiles')
        .select('username, display_name, location, bio, avatar_url, sync_points, in_feed_count')
        .eq('id', authUser.id)
        .maybeSingle();
      if (error) {
        console.error('Could not load the account profile.', error);
        return;
      }
      if (!active) return;
      if (data) {
        setUserProfile({
          name: data.display_name || data.username,
          handle: data.username,
          location: data.location ?? '',
          bio: data.bio ?? '',
        });
        setUserSyncPoints(data.sync_points ?? 0);
        setInFeedCount(data.in_feed_count ?? 0);
        if (data.avatar_url) setUserAvatar(data.avatar_url);
      } else {
        setUserSyncPoints(0);
        setInFeedCount(0);
        const metadata = authUser.user_metadata;
        const name = typeof metadata.display_name === 'string'
          ? metadata.display_name
          : typeof metadata.full_name === 'string'
            ? metadata.full_name
            : authUser.email?.split('@')[0] ?? '';
        const handle = typeof metadata.username === 'string'
          ? metadata.username
          : authUser.email?.split('@')[0] ?? '';
        setUserProfile({ name, handle, location: '', bio: '' });
      }
    };
    const loadPrivateInterests = async () => {
      try {
        const { data, error } = await client
          .from('user_interests')
          .select('interests')
          .eq('user_id', authUser.id)
          .maybeSingle();
        if (error) {
          console.error('Could not load private profile interests.', error);
          return;
        }
        if (active && Array.isArray(data?.interests) &&
            data.interests.every((item: unknown) => typeof item === 'string')) {
          const validInterests = data.interests.filter(isInterest);
          setUserInterests(validInterests);
          try {
            window.localStorage.setItem(interestStorageKey(authUser.id), JSON.stringify(validInterests));
          } catch (storageError) {
            console.error('Could not cache profile interests.', storageError);
          }
        }
      } catch (error) {
        console.error('Could not load private profile interests.', error);
      } finally {
        if (active) setInterestsLoading(false);
      }
    };
    const loadFollowing = async () => {
      const { data, error } = await client
        .from('follows')
        .select('followee_id')
        .eq('follower_id', authUser.id);
      if (error) {
        console.error('Could not load followed accounts.', error);
        return;
      }
      const ids = (data ?? []).map((follow) => follow.followee_id);
      if (!active) return;
      if (ids.length === 0) {
        const testFollows = testCreatorFollowed.current;
        const handles = new Set(testFollows ? [TEST_CREATOR_PROFILE.username] : []);
        followedHandleIds.current = handles;
        setFollowedHandles(handles);
        setFollowedProfiles(testFollows ? [TEST_CREATOR_PROFILE] : []);
        return;
      }
      const { data: profiles, error: profilesError } = await client
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      if (profilesError) {
        console.error('Could not load followed account names.', profilesError);
        return;
      }
      if (!active) return;
      const profileRows = (profiles ?? [])
        .filter((profile) => profile.username !== TEST_CREATOR_PROFILE.username) as FollowedProfile[];
      if (testCreatorFollowed.current) profileRows.push(TEST_CREATOR_PROFILE);
      const handles = new Set(profileRows.map((profile) => profile.username));
      followedHandleIds.current = handles;
      setFollowedHandles(handles);
      setFollowedProfiles(profileRows);
    };
    const loadFollowers = async () => {
      const { data, error } = await client
        .from('follows')
        .select('follower_id')
        .eq('followee_id', authUser.id);
      if (error) {
        console.error('Could not load followers.', error);
        return;
      }
      const ids = (data ?? []).map((follow) => follow.follower_id);
      if (!active) return;
      if (ids.length === 0) {
        setFollowerProfiles([]);
        return;
      }
      const { data: profiles, error: profilesError } = await client
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      if (profilesError) {
        console.error('Could not load follower profiles.', profilesError);
        return;
      }
      if (active) setFollowerProfiles((profiles ?? []) as FollowedProfile[]);
    };
    const loadFollowerCount = async () => {
      const { count, error } = await client
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('followee_id', authUser.id);
      if (error) {
        console.error('Could not load follower count.', error);
        return;
      }
      if (active && count !== null) setFollowerCount(count);
    };
    void loadProfile();
    void loadPrivateInterests();
    void loadContentFeedback();
    void loadFollowing();
    void loadFollowers();
    void loadFollowerCount();
    const loadContent = async () => {
      const { data, error } = await client
        .from('posts')
        .select('id, owner_id, media_type, media_url, caption, tags, created_at, profiles!posts_owner_id_fkey(id, username, display_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        console.error('Could not load posts and reels.', error);
        if (active) setContentError('Could not load posts. Check that the Supabase schema and access policies have been installed.');
        return;
      }
      if (active) {
        setSocialContent((data ?? []) as unknown as PublishedContent[]);
        setContentError('');
      }
    };
    void loadContent();
    const contentChannel = client
      .channel(`social-content:${authUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        void loadContent();
      })
      .subscribe((status, error) => {
        if (error) console.error('Could not subscribe to new posts.', error);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime post subscription failed:', status);
        }
      });
    const profileChannel = client
      .channel(`own-profile:${authUser.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${authUser.id}`,
      }, (payload) => {
        const row = payload.new as { in_feed_count?: number };
        if (typeof row.in_feed_count === 'number') setInFeedCount(row.in_feed_count);
      })
      .subscribe((status, error) => {
        if (error) console.error('Could not subscribe to profile updates.', error);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime profile subscription failed:', status);
        }
      });
    const followsChannel = client
      .channel(`profile-followers:${authUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, (payload) => {
        const row = (payload.new ?? payload.old) as { followee_id?: string };
        if (row.followee_id !== authUser.id) return;
        if (payload.eventType === 'INSERT') setFollowerCount((count) => count + 1);
        if (payload.eventType === 'DELETE') setFollowerCount((count) => Math.max(0, count - 1));
        if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
          void loadFollowers();
        }
      })
      .subscribe((status, error) => {
        if (error) console.error('Could not subscribe to follower count updates.', error);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Follower count realtime subscription failed:', status);
        }
      });
    return () => {
      active = false;
      void client.removeChannel(followsChannel);
      void client.removeChannel(contentChannel);
      void client.removeChannel(profileChannel);
    };
  }, [authUser]);

  useEffect(() => {
    let active = true;
    const profiles = [...new Map(
      [...followedProfiles, ...followerProfiles]
        .filter((profile) => profile.id !== TEST_CREATOR_PROFILE.id)
        .map((profile) => [profile.id, profile]),
    ).values()];
    const emptyCounts = Object.fromEntries(profiles.map((profile) => [profile.username, 0]));
    setMutualFriendCounts(emptyCounts);
    setMutualFriendError('');

    if (!authUser || !supabase) return () => { active = false; };
    const followingIds = followedProfiles
      .filter((profile) => profile.id !== TEST_CREATOR_PROFILE.id)
      .map((profile) => profile.id);
    if (profiles.length === 0 || followingIds.length === 0) {
      return () => { active = false; };
    }

    void supabase
      .from('follows')
      .select('follower_id')
      .in('follower_id', profiles.map((profile) => profile.id))
      .in('followee_id', followingIds)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Could not load mutual friend counts.', error);
          setMutualFriendError('Could not load mutual friends.');
          return;
        }
        const countsById = new Map<string, number>();
        for (const follow of data ?? []) {
          countsById.set(follow.follower_id, (countsById.get(follow.follower_id) ?? 0) + 1);
        }
        setMutualFriendCounts(Object.fromEntries(
          profiles.map((profile) => [profile.username, countsById.get(profile.id) ?? 0]),
        ));
      });

    return () => { active = false; };
  }, [authUser, followerProfiles, followedProfiles]);

  const updateContentFeedback = (
    postId: string,
    action: 'like' | 'in_feed',
    active: boolean,
  ) => {
    if (postId.startsWith('john-')) {
      const setFeedback = action === 'like' ? setLikedMockContentIds : setInFeededMockContentIds;
      setFeedback((previous) => {
        const next = new Set(previous);
        if (active) next.add(postId);
        else next.delete(postId);
        return next;
      });
      return;
    }
    if (!supabase || !authUser) return;
    const setFeedback = action === 'like' ? setLikedContentIds : setInFeededContentIds;
    setFeedback((previous) => {
      const next = new Set(previous);
      if (active) next.add(postId);
      else next.delete(postId);
      return next;
    });

    void (async () => {
      const result = active
        ? await supabase
          .from('content_feedback')
          .upsert(
            { user_id: authUser.id, post_id: postId, action },
            { onConflict: 'user_id,post_id,action' },
          )
        : await supabase
          .from('content_feedback')
          .delete()
          .eq('user_id', authUser.id)
          .eq('post_id', postId)
          .eq('action', action);
      if (!result.error) return;
      console.error('Could not save content feedback.', result.error);
      setFeedback((previous) => {
        if (previous.has(postId) !== active) return previous;
        const restored = new Set(previous);
        if (active) restored.delete(postId);
        else restored.add(postId);
        return restored;
      });
    })();
  };

  const refreshSocialContent = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('posts')
      .select('id, owner_id, media_type, media_url, caption, tags, created_at, profiles!posts_owner_id_fkey(id, username, display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) {
      console.error('Could not refresh posts and reels.', error);
      setContentError('Your upload was saved, but the feed could not be refreshed.');
      return;
    }
    setSocialContent((data ?? []) as unknown as PublishedContent[]);
    setContentError('');
  };

  const saveUserInterests = async (interests: Interest[]) => {
    if (authUser && supabase) {
      const { error } = await supabase
        .from('user_interests')
        .upsert({ user_id: authUser.id, interests }, { onConflict: 'user_id' });
      if (error) {
        console.error('Could not save private profile interests.', error);
        if (error.code === 'PGRST205' || error.code === '42P01') {
          throw new Error('The private interests table is missing. Run supabase/schema.sql in the Supabase SQL Editor, then try again.');
        }
        if (error.code === '42501') {
          throw new Error('Supabase denied access to private interests. Re-run supabase/schema.sql to install the table permissions, then try again.');
        }
        throw new Error(error.message);
      }
    }
    try {
      window.localStorage.setItem(interestStorageKey(authUser?.id ?? null), JSON.stringify(interests));
    } catch (error) {
      console.error('Could not save interests.', error);
      throw error;
    }
    setUserInterests(interests);
  };

  const updateOwnSquadProfile = (name: string, handle: string, avatar: string) => {
    const normalizedHandle = handle.trim().replace(/^@/, '').toLowerCase();
    const updatedSquads = userSquads.map((squad) => ({
      ...squad,
      memberProfiles: squad.memberProfiles.map((member) => {
        const matchesOwnProfile = member.handle
          ? member.handle.replace(/^@/, '').toLowerCase() === userProfile.handle.replace(/^@/, '').toLowerCase()
          : member.username === userProfile.name || member.username === currentUser.username;
        return matchesOwnProfile
          ? { ...member, username: name, handle: normalizedHandle, avatar }
          : member;
      }),
    }));
    setUserSquads(updatedSquads);
    try {
      window.localStorage.setItem(
        squadStorageKey(authUser?.id ?? null),
        JSON.stringify(updatedSquads),
      );
    } catch (error) {
      console.error('Could not save your profile changes to squads.', error);
    }
  };

  const saveUserAvatar = async (avatar: string) => {
    setUserAvatar(avatar);
    updateOwnSquadProfile(userProfile.name, userProfile.handle, avatar);
    try {
      window.localStorage.setItem(USER_AVATAR_STORAGE_KEY, avatar);
    } catch (error) {
      console.error('Could not save the profile picture.', error);
      return false;
    }
    if (authUser && supabase) {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatar })
        .eq('id', authUser.id);
      if (error) {
        console.error('Could not save the profile picture to Supabase.', error);
        return false;
      }
    }
    return true;
  };

  const saveUserProfile = async (profile: UserProfile & { interests: Interest[] }) => {
    const { interests, ...profileDetails } = profile;
    try {
      await saveUserInterests(interests);
    } catch {
      return false;
    }
    setUserProfile(profileDetails);
    updateOwnSquadProfile(profileDetails.name, profileDetails.handle, userAvatar || currentUser.avatar);
    const syncPoints = Math.max(
      userSyncPoints,
      userSquads.reduce((sum, squad) => sum + squad.syncPoints, 0),
    );
    setUserSyncPoints(syncPoints);
    if (authUser && supabase) {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: profileDetails.handle.toLowerCase().replace(/^@/, ''),
          display_name: profileDetails.name,
          location: profileDetails.location,
          bio: profileDetails.bio,
          sync_points: syncPoints,
        })
        .eq('id', authUser.id);
      if (error) {
        console.error('Could not save the profile to Supabase.', error);
        return false;
      }
    }
    try {
      window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profileDetails));
      return true;
    } catch (error) {
      console.error('Could not save the profile.', error);
      return false;
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      return true;
    } catch (error) {
      console.error('Could not save the theme.', error);
      return false;
    }
  };

  const hypeReel = (reelId: number) => {
    if (hypedReelIds.current.has(reelId) || hypedReelIds.current.size >= MAX_HYPES) {
      return null;
    }
    hypedReelIds.current.add(reelId);
    setHypedReels(new Set(hypedReelIds.current));
    return MAX_HYPES - hypedReelIds.current.size;
  };

  const applyFollowChange = (handle: string, wasFollowing: boolean) => {
    const next = new Set(followedHandleIds.current);
    if (wasFollowing) next.delete(handle);
    else next.add(handle);
    followedHandleIds.current = next;
    setFollowedHandles(next);
    if (handle === TEST_CREATOR_PROFILE.username) {
      testCreatorFollowed.current = !wasFollowing;
      setFollowedProfiles((previous) => [
        ...previous.filter((profile) => profile.username !== handle),
        ...(!wasFollowing ? [TEST_CREATOR_PROFILE] : []),
      ]);
    }
    if (authUser && supabase && handle !== TEST_CREATOR_PROFILE.username) {
      const client = supabase;
      void (async () => {
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('username', handle)
          .maybeSingle();
        if (profileError || !profile) {
          console.error('Could not find account to follow.', profileError ?? handle);
          const restored = new Set(followedHandleIds.current);
          if (wasFollowing) restored.add(handle);
          else restored.delete(handle);
          followedHandleIds.current = restored;
          setFollowedHandles(restored);
          return;
        }
        const result = wasFollowing
          ? await client.from('follows').delete().eq('follower_id', authUser.id).eq('followee_id', profile.id)
          : await client.from('follows').insert({ follower_id: authUser.id, followee_id: profile.id });
        if (result.error) {
          console.error('Could not update followed account.', result.error);
          const restored = new Set(followedHandleIds.current);
          if (wasFollowing) restored.add(handle);
          else restored.delete(handle);
          followedHandleIds.current = restored;
          setFollowedHandles(restored);
          return;
        }
        setFollowedProfiles((previous) => wasFollowing
          ? previous.filter((item) => item.username !== handle)
          : [
              ...previous.filter((item) => item.username !== handle),
              {
                id: profile.id,
                username: profile.username,
                display_name: profile.display_name || profile.username,
                avatar_url: profile.avatar_url,

              },
            ]);
      })();
    }
    return next.has(handle);
  };
  const toggleFollow = (handle: string) => {
    const wasFollowing = followedHandleIds.current.has(handle);
    if (wasFollowing) {
      setPendingUnfollow(handle);
      return true;
    }
    return applyFollowChange(handle, false);
  };

  const markDumpReelViewed = useCallback((squadId: number, reelId: number) => {
    setViewedDumpReelIds((previous) => {
      if (previous[squadId]?.has(reelId)) return previous;
      return {
        ...previous,
        [squadId]: new Set([...(previous[squadId] ?? []), reelId]),
      };
    });
    setUserDropsBySquad((prev) => {
      const squadDrops = prev[squadId] ?? [];
      if (!squadDrops.some((reel) => reel.id === reelId && !reel.viewed)) return prev;
      return {
        ...prev,
        [squadId]: squadDrops.map((reel) =>
          reel.id === reelId ? { ...reel, viewed: true } : reel,
        ),
      };
    });
  }, []);

  const goTab = (t: TabKey) => {
    setOverlay(null);
    setActiveTab(t);
  };

  const openCreator = (handle: string) => setOverlay({ type: 'creator-profile', handle });
  const openProfileMedia = (content: ProfileMediaContent) => setOverlay({ type: 'profile-media', content });
  const openHashtag = (tag: string) => setOverlay({ type: 'hashtag', tag });
  const openGroupChat = (squadId: number) => setOverlay({ type: 'group-chat', squadId });
  const openDM = (handle: string) => {
    setOverlay(null);
    setDmTarget(handle);
    setActiveTab('messages');
  };
  const createSquad = (squad: Squad) => {
    const next = [squad, ...userSquads];
    setUserSquads(next);
    try {
      window.localStorage.setItem(squadStorageKey(authUser?.id ?? null), JSON.stringify(next));
      return true;
    } catch (error) {
      console.error('Could not save the created squad.', error);
      return false;
    }
  };
  const updateSquad = (squad: Squad) => {
    const next = userSquads.map((item) => item.id === squad.id ? squad : item);
    setUserSquads(next);
    try {
      window.localStorage.setItem(squadStorageKey(authUser?.id ?? null), JSON.stringify(next));
      return true;
    } catch (error) {
      console.error('Could not save the updated squad.', error);
      return false;
    }
  };
  const leaveSquad = (squadId: number) => {
    const next = userSquads.filter((squad) => squad.id !== squadId);
    setUserSquads(next);
    setOverlay(null);
    try {
      window.localStorage.setItem(squadStorageKey(authUser?.id ?? null), JSON.stringify(next));
      return true;
    } catch (error) {
      console.error('Could not save the squad departure.', error);
      return false;
    }
  };
  const saveSquadMessages = (squadId: number, messages: ChatMessage[]) => {
    const next = { ...squadMessagesById, [squadId]: messages };
    setSquadMessagesById(next);
    try {
      window.localStorage.setItem(
        squadMessagesStorageKey(authUser?.id ?? null),
        JSON.stringify(next),
      );
      return true;
    } catch (error) {
      console.error('Could not save squad messages.', error);
      return false;
    }
  };
  const dropReelToSquad = (squadId: number, reelId: number) => {
    const reel = recommendedReels.find((item) => item.id === reelId);
    if (!reel || !userSquads.some((squad) => squad.id === squadId)) {
      console.error('Could not drop the reel into the selected squad.', { squadId, reelId });
      return;
    }
    const drop: DumpReel = {
      id: Date.now(),
      reelId: reel.id,
      username: userProfile.name || currentUser.username,
      handle: userProfile.handle || currentUser.handle,
      avatar: userAvatar || currentUser.avatar,
      caption: reel.caption,
      gradient: reel.gradient,
      emoji: reel.emoji,
      time: 'now',
      viewed: false,
    };
    setUserDropsBySquad((previous) => ({
      ...previous,
      [squadId]: [...(previous[squadId] ?? []), drop],
    }));
  };

  const renderOverlay = () => {
    if (!overlay) return null;
    switch (overlay.type) {
      case 'hashtag':
        return (
          <HashtagScreen
            tag={overlay.tag}
            onBack={() => setOverlay(null)}
            openCreator={openCreator}
            content={socialContent}
          />
        );
      case 'creator-profile':
        if (overlay.handle === TEST_CREATOR_PROFILE.username) {
          return (
            <CreatorProfile
              handle={overlay.handle}
              onBack={() => setOverlay(null)}
              onSendMessage={openDM}
              following={followedHandles.has(overlay.handle)}
              onToggleFollow={toggleFollow}
              likedContentIds={allLikedContentIds}
              onContentFeedback={updateContentFeedback}
              onOpenMedia={openProfileMedia}
              readOnly={swapOn}
            />
          );
        }
        return (
          <AccountProfile
            handle={overlay.handle}
            onBack={() => setOverlay(null)}
            onSendMessage={openDM}
            following={followedHandles.has(overlay.handle)}
            onToggleFollow={toggleFollow}
            onOpenMedia={openProfileMedia}
            readOnly={swapOn}
          />
        );
      case 'profile-media': {
        const reelId = overlay.content.mediaType === 'reel'
          ? recommendedReels.find((reel) =>
              (overlay.content.contentId && reel.contentId === overlay.content.contentId) ||
              reel.id === Number(overlay.content.localId),
            )?.id ?? null
          : null;
        return (
          <ProfileMediaViewer
            content={overlay.content}
            currentUserId={authUser?.id ?? null}
            currentUserName={userProfile.name}
            currentUserHandle={userProfile.handle}
            currentUserAvatar={userAvatar}
            likedContentIds={allLikedContentIds}
            inFeededContentIds={allInFeededContentIds}
            onContentFeedback={updateContentFeedback}
            reelId={reelId}
            hypedReels={hypedReels}
            onHype={hypeReel}
            squads={userSquads}
            onDropToSquad={dropReelToSquad}
            onBack={() => setOverlay({
              type: 'creator-profile',
              handle: overlay.content.creatorHandle,
            })}
          />
        );
      }
      case 'group-chat': {
        const squad = userSquads.find((s) => s.id === overlay.squadId);
        if (!squad) return null;
        return (
          <GroupChat
            squad={squad}
            messages={squadMessagesById[squad.id] ?? groupChatMessages[squad.id] ?? []}
            onMessagesChange={saveSquadMessages}
            userDrops={userDropsBySquad[squad.id] ?? []}
            viewedReelIds={viewedDumpReelIds[squad.id] ?? new Set()}
            userAvatar={userAvatar}
            userName={userProfile.name}
            followedProfiles={followedProfiles}
            onBack={() => setOverlay(null)}
            setOverlay={setOverlay}
            onUpdateSquad={updateSquad}
            onLeaveSquad={leaveSquad}
          />
        );
      }
      case 'dump-wall': {
        const squad = userSquads.find((s) => s.id === overlay.squadId);
        if (!squad) return null;
        return (
          <DumpWall
            squad={squad}
            userDrops={userDropsBySquad[squad.id] ?? []}
            viewedReelIds={[...(viewedDumpReelIds[squad.id] ?? [])]}
            initialReelId={overlay.reelId}
            onMarkViewed={markDumpReelViewed}
            onBack={() => setOverlay({ type: 'group-chat', squadId: squad.id })}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <ToastProvider>
      <div data-theme={theme} className="flex h-screen w-screen items-center justify-center bg-black">
        {/* Phone frame */}
        <div className="relative h-full w-full max-w-[430px] overflow-hidden bg-black sm:h-[92vh] sm:rounded-[2.5rem] sm:border sm:border-white/10 sm:shadow-2xl">
          {activeTab === 'reels' && (
            <ReelsScreen
              openCreator={openCreator}
              openHashtag={openHashtag}
              userAvatar={userAvatar}
              userName={userProfile.name}
              userHandle={userProfile.handle}
              userId={authUser?.id ?? null}
              hypedReels={hypedReels}
              onHype={hypeReel}
              followedHandles={followedHandles}
              followedProfiles={followedProfiles}
              squads={userSquads}
              reels={recommendedReels}
              likedContentIds={allLikedContentIds}
              inFeededContentIds={allInFeededContentIds}
              onContentFeedback={updateContentFeedback}
              onToggleFollow={toggleFollow}
              onDropToSquad={dropReelToSquad}
              swapOn={swapOn}
              swapHandle={swapHandle}
            />
          )}
          {activeTab === 'squads' && (
            <SquadsScreen
              squads={userSquads}
              followedProfiles={followedProfiles}
              userName={userProfile.name}
              userHandle={userProfile.handle}
              userAvatar={userAvatar || currentUser.avatar}
              openGroupChat={openGroupChat}
              onCreateSquad={createSquad}
            />
          )}
          {activeTab === 'feed' && (
            <FeedScreen
              goTab={goTab}
              openCreator={openCreator}
              openDM={openDM}
              openHashtag={openHashtag}
              followedHandles={followedHandles}
              swapOn={swapOn}
              swapHandle={swapHandle}
              setSwapOn={setSwapOn}
              setSwapHandle={setSwapHandle}
              userAvatar={userAvatar}
              userName={userProfile.name}
              userHandle={userProfile.handle}
              onToggleFollow={toggleFollow}
              currentUserId={authUser?.id ?? null}
              followedProfiles={followedProfiles}
              posts={[
                ...socialContent.filter((item) => item.media_type === 'post').map(toFeedPost),
                ...johnPosts,
              ]}
              interestTags={userInterests ?? []}
              likedContentIds={allLikedContentIds}
              inFeededContentIds={allInFeededContentIds}
              onContentFeedback={updateContentFeedback}
            />
          )}
          <div className={activeTab === 'messages' ? 'absolute inset-0 z-10' : 'hidden'}>
            <MessagesScreen
              dmTarget={dmTarget}
              clearDmTarget={() => setDmTarget(null)}
              openCreator={openCreator}
              onConversationOpenChange={setMessageConversationOpen}
              userAvatar={userAvatar}
              userName={userProfile.name}
              currentUserId={authUser?.id ?? null}
              isActive={activeTab === 'messages'}
              followedProfiles={followedProfiles}
              onUnreadCountChange={setUnreadMessageCount}
              onUnreadNotificationCountChange={setUnreadNotificationCount}
            />
          </div>
          {activeTab === 'profile' && (
            <ProfileScreen
              openGroupChat={openGroupChat}
              userSquads={userSquads}
              openCreator={openCreator}
              userInterests={userInterests ?? []}
              onEditInterests={() => setEditingInterests(true)}
              syncPoints={userSyncPoints}
              userAvatar={userAvatar}
              onChangeAvatar={saveUserAvatar}
              inFeedCount={inFeedCount}
              userName={userProfile.name}
              userHandle={userProfile.handle}
              userLocation={userProfile.location}
              userBio={userProfile.bio}
              followedHandles={followedHandles}
              followedProfiles={followedProfiles}
              followerProfiles={followerProfiles}
              mutualFriendCounts={mutualFriendCounts}
              mutualFriendError={mutualFriendError}
              followerCount={followerCount}
              userId={authUser?.id ?? null}
              ownContent={socialContent
                .filter((item) => item.owner_id === authUser?.id)
                .map((item) => ({ ...toFeedPost(item), mediaType: item.media_type, createdAt: item.created_at }))}
              onContentPublished={refreshSocialContent}
              contentError={contentError}
              onSaveProfile={saveUserProfile}
              theme={theme}
              onToggleTheme={toggleTheme}
              onSignOut={isSupabaseConfigured ? onSignOut : undefined}
            />
          )}

          {/* Overlay layer (creator profile, group chat, dump wall) */}
          {overlay && (
            <div className="absolute inset-0 z-[60] bg-black">{renderOverlay()}</div>
          )}

          {pendingUnfollow && (
            <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="unfollow-title"
                className="w-full max-w-[320px] rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl"
              >
                <h2 id="unfollow-title" className="text-center text-base font-bold text-white">
                  Unfollow @{pendingUnfollow}?
                </h2>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const handle = pendingUnfollow;
                      setPendingUnfollow(null);
                      applyFollowChange(handle, true);
                    }}
                    className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600"
                  >
                    Unfollow
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingUnfollow(null)}
                    className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-zinc-900 transition-colors hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {!(activeTab === 'messages' && messageConversationOpen) && (
            <BottomNav
              active={activeTab}
              onChange={goTab}
              unreadMessageCount={unreadMessageCount + unreadNotificationCount}
            />
          )}
          {!interestsLoading && (userInterests === null || editingInterests) && (
            <InterestOnboarding
              initialInterests={userInterests ?? []}
              onCancel={userInterests === null ? undefined : () => setEditingInterests(false)}
              onComplete={async (interests) => {
                await saveUserInterests(interests);
                setEditingInterests(false);
              }}
            />
          )}
        </div>
      </div>
    </ToastProvider>
  );
}

function App() {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Could not restore the authentication session.', error);
      if (!active) return;
      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <ToastProvider>
        <AuthScreen />
      </ToastProvider>
    );
  }
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-sm font-medium text-white/60">
        Loading your account…
      </div>
    );
  }
  if (!authUser) {
    return (
      <ToastProvider>
        <AuthScreen />
      </ToastProvider>
    );
  }

  const signOut = () => {
    if (!supabase) return;
    void supabase.auth.signOut().then(({ error }) => {
      if (error) console.error('Could not sign out.', error);
    });
  };
  return <SocialApp authUser={authUser} onSignOut={signOut} />;
}

export default App;
