import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, Video, X } from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import { useToast } from '@/components/ToastContext';
import type { FollowedProfile } from '@/lib/socialContent';
import { supabase } from '@/lib/supabase';
import type { FeedPost } from '@/types';

const MAX_STORY_ITEMS = 10;
const MAX_STORY_FILE_SIZE = 100 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOCK_JOHN_STORY_ID = 'mock-john-story';

interface StoryProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
}

interface StoryRow {
  id: string;
  owner_id: string;
  story_date: string;
  created_at: string;
  story_items: {
    id: string;
    story_id: string;
    media_type: 'image' | 'video';
    media_url: string;
    position: number;
  }[];
}

interface StoryMedia {
  id: string;
  storyId: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
}

interface StoryGroup extends StoryProfile {
  storyIds: string[];
  storyDates: string[];
  items: StoryMedia[];
  isMock?: boolean;
}

function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error &&
      typeof error.message === 'string') {
    return error.message;
  }
  return 'Please try again.';
}

function getErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string') {
    return error.code;
  }
  return null;
}

function hasViewedMockJohnStory(userId: string | null): boolean {
  try {
    return window.localStorage.getItem(`social-app-story-viewed:${userId ?? 'guest'}:${MOCK_JOHN_STORY_ID}`) === 'true';
  } catch (error) {
    console.error('Could not read the saved story view.', error);
    return false;
  }
}

export default function StoriesBar({
  currentUserId,
  userName,
  userHandle,
  userAvatar,
  followedProfiles,
  mockStory,
}: {
  currentUserId: string | null;
  userName: string;
  userHandle: string;
  userAvatar: string;
  followedProfiles: FollowedProfile[];
  mockStory: FeedPost | null;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storyError, setStoryError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  const profilesById = useMemo(() => {
    const profiles = new Map<string, StoryProfile>();
    if (currentUserId && UUID_PATTERN.test(currentUserId)) {
      profiles.set(currentUserId, {
        id: currentUserId,
        username: userHandle.replace(/^@/, ''),
        displayName: userName || userHandle,
        avatar: userAvatar,
      });
    }
    for (const profile of followedProfiles) {
      if (!UUID_PATTERN.test(profile.id)) continue;
      profiles.set(profile.id, {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name || profile.username,
        avatar: profile.avatar_url ?? '',
      });
    }
    return profiles;
  }, [currentUserId, followedProfiles, userAvatar, userHandle, userName]);
  const ownerIds = useMemo(() => [...profilesById.keys()], [profilesById]);
  const mockJohnGroup = useMemo<StoryGroup | null>(() => mockStory ? ({
    id: MOCK_JOHN_STORY_ID,
    username: mockStory.handle,
    displayName: mockStory.username,
    avatar: mockStory.avatar,
    storyIds: [MOCK_JOHN_STORY_ID],
    storyDates: [utcDateKey()],
    isMock: true,
    items: [{
      id: `${MOCK_JOHN_STORY_ID}-item`,
      storyId: MOCK_JOHN_STORY_ID,
      mediaType: 'image',
      mediaUrl: mockStory.image,
    }],
  }) : null, [mockStory]);

  const loadStories = useCallback(async () => {
    if (!supabase || !currentUserId || ownerIds.length === 0) {
      setStoryGroups(mockJohnGroup ? [mockJohnGroup] : []);
      setViewedStoryIds(hasViewedMockJohnStory(currentUserId)
        ? new Set([MOCK_JOHN_STORY_ID])
        : new Set());
      setStoriesLoading(false);
      return;
    }

    setStoriesLoading(true);
    setStoryError('');
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('id, owner_id, story_date, created_at, story_items(id, story_id, media_type, media_url, position)')
        .in('owner_id', ownerIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as StoryRow[];
      const storyIds = rows.map((story) => story.id);
      const viewedResult = storyIds.length
        ? await supabase
          .from('story_views')
          .select('story_id')
          .eq('user_id', currentUserId)
          .in('story_id', storyIds)
        : { data: [], error: null };
      if (viewedResult.error) throw viewedResult.error;

      const grouped = new Map<string, StoryGroup>();
      for (const row of rows) {
        const profile = profilesById.get(row.owner_id);
        if (!profile) continue;
        const group = grouped.get(row.owner_id) ?? {
          ...profile,
          storyIds: [],
          storyDates: [],
          items: [],
        };
        group.storyIds.push(row.id);
        group.storyDates.push(row.story_date);
        group.items.push(...(row.story_items ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            id: item.id,
            storyId: row.id,
            mediaType: item.media_type,
            mediaUrl: item.media_url,
          })));
        grouped.set(row.owner_id, group);
      }

      const ownerOrder = new Map(ownerIds.map((id, index) => [id, index]));
      const databaseGroups = [...grouped.values()]
        .filter((group) => group.items.length > 0)
        .sort((a, b) => (ownerOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (ownerOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      const ownGroup = databaseGroups.filter((group) => group.id === currentUserId);
      const followedGroups = databaseGroups.filter((group) => group.id !== currentUserId);
      setStoryGroups([
        ...ownGroup,
        ...(mockJohnGroup ? [mockJohnGroup] : []),
        ...followedGroups,
      ]);
      const viewedIds = (viewedResult.data ?? []).map((view) => view.story_id);
      if (hasViewedMockJohnStory(currentUserId)) viewedIds.push(MOCK_JOHN_STORY_ID);
      setViewedStoryIds(new Set(viewedIds));
    } catch (error) {
      console.error('Could not load stories.', error);
      setStoryError(`Could not load stories. ${getErrorMessage(error)}`);
    } finally {
      setStoriesLoading(false);
    }
  }, [currentUserId, mockJohnGroup, ownerIds, profilesById]);

  useEffect(() => {
    void loadStories();
    if (!supabase || !currentUserId) return;

    const client = supabase;
    const channel = client
      .channel(`feed-stories:${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        void loadStories();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_items' }, () => {
        void loadStories();
      })
      .subscribe((status, error) => {
        if (error) console.error('Could not subscribe to story updates.', error);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime story subscription failed:', status);
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [currentUserId, loadStories]);

  const markGroupViewed = useCallback(async (group: StoryGroup) => {
    const unseenIds = group.storyIds.filter((id) => !viewedStoryIds.has(id));
    if (unseenIds.length === 0) return;
    setViewedStoryIds((previous) => new Set([...previous, ...unseenIds]));
    if (group.isMock) {
      try {
        window.localStorage.setItem(
          `social-app-story-viewed:${currentUserId ?? 'guest'}:${MOCK_JOHN_STORY_ID}`,
          'true',
        );
      } catch (error) {
        console.error('Could not save the story view.', error);
        setStoryError('Could not save your story view. Please try again.');
      }
      return;
    }
    if (!supabase || !currentUserId) return;

    const { error } = await supabase
      .from('story_views')
      .upsert(
        unseenIds.map((storyId) => ({ user_id: currentUserId, story_id: storyId })),
        { onConflict: 'user_id,story_id', ignoreDuplicates: true },
      );
    if (error) {
      console.error('Could not save viewed stories.', error);
      setStoryError('Could not save your story views. Please try again.');
    }
  }, [currentUserId, viewedStoryIds]);

  const activeGroup = storyGroups.find((group) => group.id === activeGroupId) ?? null;

  const openStory = (group: StoryGroup) => {
    setActiveGroupId(group.id);
    setActiveItemIndex(0);
    void markGroupViewed(group);
  };

  const closeStory = useCallback(() => {
    setActiveGroupId(null);
    setActiveItemIndex(0);
  }, []);

  const navigateStory = useCallback((direction: -1 | 1) => {
    if (!activeGroupId) return;
    const groupIndex = storyGroups.findIndex((group) => group.id === activeGroupId);
    const group = storyGroups[groupIndex];
    if (!group) return;
    const nextItemIndex = activeItemIndex + direction;
    if (nextItemIndex >= 0 && nextItemIndex < group.items.length) {
      setActiveItemIndex(nextItemIndex);
      return;
    }

    if (direction > 0) closeStory();
    else setActiveItemIndex(0);
  }, [activeGroupId, activeItemIndex, closeStory, storyGroups]);

  useEffect(() => {
    if (!activeGroup) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') navigateStory(1);
      else if (event.key === 'ArrowLeft') navigateStory(-1);
      else if (event.key === 'Escape') closeStory();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGroup, closeStory, navigateStory]);

  useEffect(() => {
    if (!activeGroup) return;
    const timer = window.setTimeout(closeStory, 30_000);
    return () => window.clearTimeout(timer);
  }, [activeGroup, activeItemIndex, closeStory]);

  const today = utcDateKey();
  const hasPostedToday = storyGroups.some((group) =>
    group.id === currentUserId && group.storyDates.includes(today),
  );

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    setSelectedFiles([]);
    setStoryError('');
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) {
      setSelectedFiles([]);
      setStoryError('');
      return;
    }
    if (files.length > MAX_STORY_ITEMS) {
      setSelectedFiles([]);
      setStoryError('A story can contain at most 10 photos or videos.');
      return;
    }
    if (files.some((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'))) {
      setSelectedFiles([]);
      setStoryError('Stories can only contain photos and videos.');
      return;
    }
    if (files.some((file) => file.size > MAX_STORY_FILE_SIZE)) {
      setSelectedFiles([]);
      setStoryError('Each story photo or video must be smaller than 100 MB.');
      return;
    }
    setSelectedFiles(files);
    setStoryError('');
  };

  const submitStory = async () => {
    if (!supabase || !currentUserId) {
      setStoryError('Sign in with a configured Supabase project to post a story.');
      return;
    }
    if (hasPostedToday) {
      setStoryError('You have already posted a story today.');
      return;
    }
    if (selectedFiles.length < 1 || selectedFiles.length > MAX_STORY_ITEMS) {
      setStoryError('Choose between 1 and 10 photos or videos.');
      return;
    }

    setUploading(true);
    setStoryError('');
    const client = supabase;
    const uploadedPaths: string[] = [];
    let storyId: string | null = null;
    try {
      const { data: story, error: storyInsertError } = await client
        .from('stories')
        .insert({ owner_id: currentUserId, story_date: today })
        .select('id')
        .single();
      if (storyInsertError) throw storyInsertError;
      storyId = story.id;
      const createdStoryId = story.id;

      const mediaRows: {
        story_id: string;
        media_type: 'image' | 'video';
        media_url: string;
        storage_path: string;
        position: number;
      }[] = [];
      for (const [position, file] of selectedFiles.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
          (file.type.startsWith('video/') ? 'mp4' : 'jpg');
        const storagePath = `${currentUserId}/stories/${createdStoryId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage
          .from('social-media')
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);
        const { data: publicUrl } = client.storage.from('social-media').getPublicUrl(storagePath);
        mediaRows.push({
          story_id: createdStoryId,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          media_url: publicUrl.publicUrl,
          storage_path: storagePath,
          position,
        });
      }

      const { error: itemsInsertError } = await client.from('story_items').insert(mediaRows);
      if (itemsInsertError) throw itemsInsertError;

      setUploadOpen(false);
      setSelectedFiles([]);
      showToast('Story shared', 'success');
      await loadStories();
    } catch (error) {
      console.error('Could not publish story.', error);
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await client.storage.from('social-media').remove(uploadedPaths);
        if (cleanupError) console.error('Could not remove uploaded files after story failure.', cleanupError);
      }
      if (storyId) {
        const { error: cleanupError } = await client.from('stories').delete().eq('id', storyId);
        if (cleanupError) console.error('Could not remove incomplete story.', cleanupError);
      }
      setStoryError(getErrorCode(error) === '23505'
        ? 'You have already posted a story today.'
        : `Could not share your story. ${getErrorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const activeItem = activeGroup?.items[activeItemIndex];

  return (
    <>
      <section className="pt-3" aria-label="Stories">
        <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-1">
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (hasPostedToday) {
                  showToast('You can post one story per day', 'default');
                  return;
                }
                setStoryError('');
                setUploadOpen(true);
              }}
              disabled={!currentUserId || storiesLoading || hasPostedToday}
              aria-label={hasPostedToday ? 'You already posted a story today' : 'Add a story'}
              className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full border border-white/15 bg-zinc-900 text-white transition-colors hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Camera size={23} />
              <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-green-400 text-black">
                <ImagePlus size={11} />
              </span>
            </button>
            <span className="w-full truncate text-center text-[10px] font-medium text-white/70">
              {hasPostedToday ? 'Added today' : 'Your story'}
            </span>
          </div>
          {storyGroups.map((group) => {
            const viewed = group.storyIds.every((id) => viewedStoryIds.has(id));
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => openStory(group)}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                aria-label={`View ${group.displayName}'s story`}
              >
                <span className={`rounded-full p-[2px] ${
                  viewed
                    ? 'bg-zinc-600'
                    : 'bg-gradient-to-br from-green-400 via-cyan-400 to-purple-500'
                }`}>
                  {group.avatar ? (
                    <img
                      src={group.avatar}
                      alt=""
                      className="h-14 w-14 rounded-full border-2 border-black bg-zinc-900 object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-zinc-800 text-lg font-bold text-white">
                      {group.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] font-medium text-white/70">
                  {group.id === currentUserId ? 'Your story' : group.displayName}
                </span>
              </button>
            );
          })}
        </div>
        {storyError && !uploadOpen && (
          <p role="alert" className="px-4 pt-1 text-[11px] text-red-300">{storyError}</p>
        )}
      </section>

      <BottomSheet open={uploadOpen} onClose={closeUpload} title="Add today's story" showBackButton>
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-white/50">
            Share 1–10 photos or videos. Your story is visible for 24 hours; you can post once per UTC day.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-4 text-center disabled:opacity-50"
          >
            <Camera size={24} className="text-green-300" />
            <span className="text-sm font-semibold text-white">
              {selectedFiles.length ? 'Change photos or videos' : 'Choose photos or videos'}
            </span>
          </button>
          {selectedFiles.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold text-white/55">
                {selectedFiles.length} of {MAX_STORY_ITEMS} selected
              </p>
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 text-xs text-white/70">
                  {file.type.startsWith('video/')
                    ? <Video size={14} className="shrink-0 text-cyan-300" />
                    : <ImagePlus size={14} className="shrink-0 text-green-300" />}
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-white/35">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              ))}
            </div>
          )}
          {storyError && <p role="alert" className="text-xs text-red-300">{storyError}</p>}
          <button
            type="button"
            onClick={() => void submitStory()}
            disabled={uploading || selectedFiles.length === 0}
            className="w-full rounded-xl bg-gradient-to-r from-green-400 to-cyan-400 py-3 text-sm font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? 'Sharing story…' : 'Share story'}
          </button>
        </div>
      </BottomSheet>

      {activeGroup && activeItem && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/95 p-3"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeGroup.displayName}'s story`}
          onClick={closeStory}
        >
          <div
            className="relative flex h-full max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => {
              touchStartX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartX.current;
              const endX = event.changedTouches[0]?.clientX;
              touchStartX.current = null;
              if (startX === null || endX === undefined) return;
              const delta = endX - startX;
              if (Math.abs(delta) > 45) navigateStory(delta < 0 ? 1 : -1);
            }}
          >
            {activeItem.mediaType === 'video' ? (
              <video
                key={activeItem.id}
                src={activeItem.mediaUrl}
                autoPlay
                controls
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <img src={activeItem.mediaUrl} alt="" className="h-full w-full object-contain" />
            )}
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent px-3 pb-5 pt-3">
              <div className="mb-3 flex gap-1">
                {activeGroup.items.map((item, index) => (
                  <span key={item.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                    {index < activeItemIndex && <span className="block h-full w-full bg-white" />}
                    {index === activeItemIndex && (
                      <span key={activeItem.id} className="story-progress-fill block h-full bg-white" />
                    )}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {activeGroup.avatar ? (
                  <img src={activeGroup.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/70" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-white">
                    {activeGroup.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{activeGroup.displayName}</span>
                  <span className="block truncate text-[10px] text-white/50">@{activeGroup.username}</span>
                </div>
                <button
                  type="button"
                  onClick={closeStory}
                  aria-label="Close story"
                  className="rounded-full bg-black/40 p-2 text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateStory(-1)}
              aria-label="Previous story"
              className="absolute inset-y-20 left-0 z-10 w-1/3 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            />
            <button
              type="button"
              onClick={() => navigateStory(1)}
              aria-label="Next story"
              className="absolute inset-y-20 right-0 z-10 w-1/3 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            />
          </div>
        </div>
      )}
    </>
  );
}
