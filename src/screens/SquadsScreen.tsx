import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Check,
  ChevronRight,
  Circle,
  Flame,
  ImagePlus,
  Plus,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import { useToast } from '@/components/ToastContext';
import { DEFAULT_SQUAD_COVER } from '@/data/mockData';
import type { FollowedProfile } from '@/lib/socialContent';
import type { Squad } from '@/types';

export default function SquadsScreen({
  squads,
  followedProfiles,
  userName,
  userHandle,
  userAvatar,
  openGroupChat,
  onCreateSquad,
}: {
  squads: Squad[];
  followedProfiles: FollowedProfile[];
  userName: string;
  userHandle: string;
  userAvatar: string;
  openGroupChat: (squadId: number) => void;
  onCreateSquad: (squad: Squad) => boolean;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [squadName, setSquadName] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [selectedHandles, setSelectedHandles] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleSquads = useMemo(
    () => squads.filter((squad) => squad.name.toLocaleLowerCase().includes(normalizedSearch)),
    [normalizedSearch, squads],
  );
  const normalizedMemberSearch = memberSearch.trim().replace(/^@/, '').toLocaleLowerCase();
  const visibleProfiles = useMemo(
    () => followedProfiles
      .filter((profile) =>
        (profile.display_name || profile.username).toLocaleLowerCase().includes(normalizedMemberSearch) ||
        profile.username.toLocaleLowerCase().includes(normalizedMemberSearch),
      )
      .sort((a, b) =>
        (a.display_name || a.username).localeCompare(
          b.display_name || b.username,
          undefined,
          { sensitivity: 'base' },
        ),
      ),
    [followedProfiles, normalizedMemberSearch],
  );

  useEffect(() => {
    setSelectedHandles((previous) => {
      const next = new Set([...previous].filter((handle) =>
        followedProfiles.some((profile) => profile.username === handle),
      ));
      return next.size === previous.size ? previous : next;
    });
  }, [followedProfiles]);

  const resetCreateForm = () => {
    setSquadName('');
    setCoverImage('');
    setSelectedHandles(new Set());
    setMemberSearch('');
    setFormError('');
  };

  const handleCoverSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Choose an image file for the squad cover.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('The cover image must be smaller than 10 MB.');
      return;
    }

    let image: ImageBitmap | null = null;
    try {
      image = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the selected cover image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setCoverImage(canvas.toDataURL('image/jpeg', 0.85));
      setFormError('');
    } catch (error) {
      console.error('Could not prepare the squad cover image.', error);
      setFormError('Could not load this image. Please choose another one.');
    } finally {
      image?.close();
    }
  };

  const submitCreateSquad = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = squadName.trim();
    if (!name) {
      setFormError('Enter a name for your squad.');
      return;
    }

    const members = followedProfiles.filter((profile) => selectedHandles.has(profile.username));
    const squad: Squad = {
      id: Date.now(),
      name,
      members: members.length + 1,
      memberProfiles: [
        { username: userName || 'You', avatar: userAvatar, handle: userHandle },
        ...members.map((profile) => ({
          username: profile.display_name || profile.username,
          avatar: profile.avatar_url ?? '',
          handle: profile.username,
        })),
      ],
      syncPoints: 0,
      streak: 0,
      peakStreak: 0,
      matchingTopics: 0,
      color: 'green',
      avatar: coverImage || DEFAULT_SQUAD_COVER,
    };
    const saved = onCreateSquad(squad);
    setCreateOpen(false);
    resetCreateForm();
    showToast(
      saved ? 'Squad created' : 'Squad created for this session, but could not be saved',
      saved ? 'success' : 'default',
    );
  };

  const openSquad = (squadId: number) => {
    setSearch('');
    openGroupChat(squadId);
  };

  return (
    <div className="animate-screen-in h-full overflow-y-auto bg-black px-4 pb-24 pt-4 no-scrollbar">
      <div className="sticky top-0 z-20 -mx-4 mb-5 bg-black/90 px-4 pb-3 pt-2 backdrop-blur-xl">
        <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 px-3 py-3 focus-within:border-yellow-400/50">
          <Search size={17} className="shrink-0 text-white/40" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search squads..."
            aria-label="Search squads"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear squad search"
              className="rounded-full p-1 text-white/45 transition-colors hover:text-white"
            >
              <X size={15} />
            </button>
          )}
        </label>
      </div>

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-400">Your circle</p>
        <div className="mt-1 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Squads</h1>
            <p className="mt-1 text-sm text-white/45">Your people, all in one place</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/55">
            {visibleSquads.length} groups
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="Create squad"
          className="group min-w-0 overflow-hidden rounded-2xl border border-dashed border-green-400/35 bg-zinc-900/70 text-left transition-all active:scale-[0.97] hover:border-green-300/70 hover:bg-zinc-900"
        >
          <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-green-500/10 via-zinc-900 to-cyan-500/10">
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-green-400/50 text-green-300 transition-colors group-hover:border-green-300 group-hover:text-green-200">
              <Plus size={38} strokeWidth={1.8} />
            </span>
          </div>
          <div className="px-2.5 py-2.5">
            <h2 className="truncate text-sm font-extrabold text-white">Create squad</h2>
            <p className="mt-1 truncate text-[10px] text-white/45">Bring your people together</p>
          </div>
        </button>

        {visibleSquads.map((squad) => (
          <button
            key={squad.id}
            type="button"
            onClick={() => openSquad(squad.id)}
            className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 text-left transition-all active:scale-[0.97]"
          >
            <div className="relative aspect-square">
              <img
                src={squad.avatar || DEFAULT_SQUAD_COVER}
                alt={squad.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/5" />
              <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-1">
                <div className="flex min-w-0 items-center">
                  {squad.memberProfiles.slice(0, 3).map((member, index) => (
                    member.avatar ? (
                      <img
                        key={`${squad.id}-${member.username}`}
                        src={member.avatar}
                        alt={member.username}
                        title={member.username}
                        className={`h-7 w-7 rounded-full border-2 border-zinc-900 object-cover ${index > 0 ? '-ml-2' : ''}`}
                      />
                    ) : (
                      <span
                        key={`${squad.id}-${member.username}`}
                        title={member.username}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-700 text-[9px] font-bold text-white ${index > 0 ? '-ml-2' : ''}`}
                      >
                        {member.username.slice(0, 1).toUpperCase()}
                      </span>
                    )
                  ))}
                  {squad.members > squad.memberProfiles.length && (
                    <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-700 text-[9px] font-bold text-white">
                      +{squad.members - squad.memberProfiles.length}
                    </span>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/40 px-1.5 py-1 text-[9px] font-bold text-white backdrop-blur-sm">
                  <Flame size={11} className="text-orange-400" />
                  {squad.streak}d
                </span>
              </div>
            </div>

            <div className="px-2.5 py-2.5">
              <h2 className="truncate text-sm font-extrabold text-white">
                <HighlightedName name={squad.name} query={search} />
              </h2>
              <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-white/45">
                <span>{squad.members} members</span>
                <span className="flex items-center gap-0.5">
                  <TrendingUp size={10} className="text-green-400" />
                  {squad.syncPoints}
                  <ChevronRight size={12} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {visibleSquads.length === 0 && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-4 text-center text-sm text-white/50">
          {search ? `No squads found for “${search}”` : 'No squads yet. Create one to start your circle.'}
        </p>
      )}

      <BottomSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create squad"
      >
        <form onSubmit={submitCreateSquad} className="max-h-[75vh] space-y-4 overflow-y-auto pb-2 no-scrollbar">
          <div>
            <label htmlFor="squad-name" className="mb-2 block text-sm font-semibold text-white/75">
              Squad name
            </label>
            <input
              id="squad-name"
              type="text"
              value={squadName}
              onChange={(event) => setSquadName(event.target.value)}
              placeholder="Name your squad"
              maxLength={32}
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-green-400/50"
            />
          </div>

          <div>
            <p className="mb-2 block text-sm font-semibold text-white/75">Cover image</p>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverSelect}
              className="hidden"
              aria-label="Choose a squad cover image"
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5"
            >
              <img
                src={coverImage || DEFAULT_SQUAD_COVER}
                alt={coverImage ? 'Squad cover preview' : ''}
                className="absolute inset-0 h-full w-full object-cover opacity-60"
              />
              <span className="relative flex items-center gap-2 rounded-full bg-black/65 px-3 py-2 text-xs font-semibold text-white">
                <ImagePlus size={15} />
                {coverImage ? 'Change cover' : 'Upload cover'}
              </span>
            </button>
            <p className="mt-1 text-[10px] text-white/35">Image file, up to 10 MB. Optional.</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-white/75">Choose people you follow</p>
              <span className="text-[10px] text-white/40">{selectedHandles.size} selected</span>
            </div>
            <label className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-green-400/40">
              <Search size={15} className="shrink-0 text-white/40" />
              <input
                type="search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search followed people..."
                aria-label="Search followed people for squad"
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
              />
              {memberSearch && (
                <button
                  type="button"
                  onClick={() => setMemberSearch('')}
                  aria-label="Clear people search"
                  className="rounded-full p-1 text-white/45 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-1">
              {visibleProfiles.length ? visibleProfiles.map((profile) => {
                const selected = selectedHandles.has(profile.username);
                const displayName = profile.display_name || profile.username;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedHandles((previous) => {
                      const next = new Set(previous);
                      if (next.has(profile.username)) next.delete(profile.username);
                      else next.add(profile.username);
                      return next;
                    })}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5"
                  >
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
                        {displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white">{displayName}</span>
                      <span className="block truncate text-[10px] text-white/40">@{profile.username}</span>
                    </span>
                    {selected ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-400 text-black">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    ) : (
                      <Circle size={20} className="shrink-0 text-white/35" />
                    )}
                  </button>
                );
              }) : (
                <p className="px-3 py-5 text-center text-xs text-white/40">
                  {followedProfiles.length ? 'No followed people match your search.' : 'Follow people to add them to a squad.'}
                </p>
              )}
            </div>
          </div>

          {formError && <p role="alert" className="text-xs text-red-300">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/65"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!squadName.trim()}
              className="flex-1 rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create squad
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return name;

  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = name.split(new RegExp(`(${escapedQuery})`, 'ig'));

  return parts.map((part, index) =>
    part.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase() ? (
      <mark key={index} className="rounded-sm bg-yellow-300 px-0.5 text-zinc-950">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
