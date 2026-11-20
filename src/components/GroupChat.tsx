import { useRef, useState, useEffect, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  Check,
  CornerUpLeft,
  Eye,
  EyeOff,
  ImagePlus,
  LogOut,
  Pencil,
  Search,
  Send,
  SmilePlus,
  Trash2,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import { dumpReelsBySquad } from '@/data/mockData';
import { getReelVideoSource } from '@/data/media';
import { useToast } from '@/components/ToastContext';
import type { FollowedProfile } from '@/lib/socialContent';
import type { ChatMessage, DumpReel, Squad, Overlay } from '@/types';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙌'];

const getSquadMemberDisplayName = (squad: Squad, username: string) =>
  squad.memberProfiles.find((member) => member.username === username)?.nickname?.trim() || username;

export function GroupChat({
  squad,
  messages,
  onMessagesChange,
  userDrops,
  viewedReelIds,
  userAvatar,
  userName,
  followedProfiles,
  onBack,
  setOverlay,
  onUpdateSquad,
  onLeaveSquad,
}: {
  squad: Squad;
  messages: ChatMessage[];
  onMessagesChange: (squadId: number, messages: ChatMessage[]) => boolean;
  userDrops: DumpReel[];
  viewedReelIds: Set<number>;
  userAvatar: string;
  userName: string;
  followedProfiles: FollowedProfile[];
  onBack: () => void;
  setOverlay: (o: Overlay) => void;
  onUpdateSquad: (squad: Squad) => boolean;
  onLeaveSquad: (squadId: number) => boolean;
}) {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [reactionMenuFor, setReactionMenuFor] = useState<number | string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editedName, setEditedName] = useState(squad.name);
  const [editedAvatar, setEditedAvatar] = useState(squad.avatar);
  const [editedMembers, setEditedMembers] = useState(squad.memberProfiles);
  const [memberSearch, setMemberSearch] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const dumpReels = [...(dumpReelsBySquad[squad.id] ?? []), ...userDrops].map((reel) => ({
    ...reel,
    viewed: reel.viewed || viewedReelIds.has(reel.id),
  }));
  const unviewedCount = dumpReels.filter((r) => !r.viewed).length;

  const persistMessages = (nextMessages: ChatMessage[]) => {
    if (!onMessagesChange(squad.id, nextMessages)) {
      showToast('Messages are available for this session, but could not be saved', 'default');
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || text.length > 4000) return;
    const newMsg: ChatMessage = {
      id: Date.now(),
      fromMe: true,
      username: userName,
      avatar: userAvatar,
      text,
      time: 'now',
      ...(replyingTo ? {
        replyToId: replyingTo.id,
        replyToUsername: replyingTo.username,
        replyToText: replyingTo.text,
      } : {}),
    };
    persistMessages([...messages, newMsg]);
    setDraft('');
    setReplyingTo(null);
  };

  const saveMessageEdit = () => {
    const text = editDraft.trim();
    const target = messages.find((message) => String(message.id) === String(editingMessageId));
    if (!target || !target.fromMe || target.readAt || !text || text.length > 4000) return;
    persistMessages(messages.map((message) =>
      String(message.id) === String(target.id)
        ? { ...message, text, editedAt: new Date().toISOString() }
        : message,
    ));
    setEditingMessageId(null);
    setEditDraft('');
  };

  const deleteMessage = (target: ChatMessage) => {
    if (!target.fromMe) return;
    persistMessages(messages.filter((message) => String(message.id) !== String(target.id)));
    if (String(editingMessageId) === String(target.id)) {
      setEditingMessageId(null);
      setEditDraft('');
    }
  };

  const toggleMessageReaction = (target: ChatMessage, emoji: string) => {
    const nextReaction = target.myReaction === emoji ? null : emoji;
    persistMessages(messages.map((message) => {
      if (String(message.id) !== String(target.id)) return message;
      const reactions = { ...(message.reactions ?? {}) };
      if (message.myReaction) {
        reactions[message.myReaction] = Math.max(0, (reactions[message.myReaction] ?? 1) - 1);
        if (reactions[message.myReaction] === 0) delete reactions[message.myReaction];
      }
      if (nextReaction) reactions[nextReaction] = (reactions[nextReaction] ?? 0) + 1;
      return { ...message, reactions, myReaction: nextReaction };
    }));
    setReactionMenuFor(null);
  };

  const openSettings = () => {
    setEditedName(squad.name);
    setEditedAvatar(squad.avatar);
    setEditedMembers(squad.memberProfiles.map((member) => ({ ...member })));
    setMemberSearch('');
    setSettingsError('');
    setConfirmLeave(false);
    setSettingsOpen(true);
  };

  const handleCoverSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSettingsError('Choose an image file for the squad cover.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setSettingsError('The cover image must be smaller than 10 MB.');
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
      setEditedAvatar(canvas.toDataURL('image/jpeg', 0.85));
      setSettingsError('');
    } catch (error) {
      console.error('Could not prepare the squad cover image.', error);
      setSettingsError('Could not load this image. Please choose another one.');
    } finally {
      image?.close();
    }
  };

  const addableProfiles = followedProfiles.filter((profile) =>
    !editedMembers.some((member) =>
      member.username === profile.username ||
      member.username === (profile.display_name || profile.username),
    ) &&
    (profile.display_name || profile.username).toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase()),
  );

  const saveSettings = () => {
    const name = editedName.trim();
    if (!name) {
      setSettingsError('Enter a name for your squad.');
      return;
    }
    const updated = onUpdateSquad({
      ...squad,
      name,
      avatar: editedAvatar,
      members: Math.max(
        editedMembers.length,
        squad.members + Math.max(0, editedMembers.length - squad.memberProfiles.length),
      ),
      memberProfiles: editedMembers,
    });
    const systemNotes: string[] = [];
    if (name !== squad.name) systemNotes.push(`Squad name changed to ${name}`);
    if (editedAvatar !== squad.avatar) systemNotes.push('Squad picture updated');
    const addedMembers = editedMembers.filter((member) =>
      !squad.memberProfiles.some((existing) => existing.username === member.username),
    );
    for (const member of addedMembers) systemNotes.push(`${member.nickname || member.username} was added to the squad`);
    const renamedMembers = editedMembers.filter((member) => {
      const existing = squad.memberProfiles.find((item) => item.username === member.username);
      return existing && (existing.nickname ?? '') !== (member.nickname ?? '');
    });
    for (const member of renamedMembers) {
      systemNotes.push(member.nickname?.trim()
        ? `${member.username}'s nickname changed to ${member.nickname.trim()}`
        : `${member.username}'s nickname was removed`);
    }
    if (systemNotes.length) {
      const timestamp = Date.now();
      persistMessages([
        ...messages,
        ...systemNotes.map((text, index) => ({
          id: timestamp + index,
          fromMe: false,
          system: true,
          username: '',
          avatar: '',
          text,
          time: 'now',
        })),
      ]);
    }
    showToast(
      updated ? 'Squad updated' : 'Squad updated for this session, but could not be saved',
      updated ? 'success' : 'default',
    );
    setSettingsOpen(false);
  };

  return (
    <div className="animate-overlay-in flex h-full flex-col bg-black">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors active:scale-90"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <button
          type="button"
          onClick={openSettings}
          aria-label="Edit squad information"
          className="shrink-0 rounded-full transition-transform active:scale-95"
        >
          <img
            src={squad.avatar}
            alt={squad.name}
            className="h-9 w-9 rounded-full object-cover ring-2 ring-white/15"
          />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-white">{squad.name}</span>
          </div>
          <p className="text-[11px] text-white/40">{squad.members} members</p>
        </div>
        {/* Dump corner button */}
        <button
          onClick={() => setOverlay({ type: 'dump-wall', squadId: squad.id })}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/15 transition-all active:scale-90"
        >
          <EyeOff size={20} className="text-cyan-400" />
          {unviewedCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
              {unviewedCount}
            </span>
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-center gap-2 rounded-full bg-white/5 px-4 py-2">
          <Eye size={14} className="text-cyan-400" />
          <span className="text-[11px] text-white/40">
            {unviewedCount} unseen reels in the dump wall
          </span>
        </div>
        {messages.map((msg) => {
          if (msg.system) {
            return (
              <div key={msg.id} className="py-1 text-center text-[10px] font-medium text-white/35">
                {msg.text}
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className={`flex animate-msg-in items-end gap-2 ${msg.fromMe ? 'flex-row-reverse' : ''}`}
            >
              {!msg.fromMe && (
                <img src={msg.avatar} alt={msg.username} className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10" />
              )}
              <div className={`flex max-w-[80%] flex-col ${msg.fromMe ? 'items-end' : 'items-start'}`}>
                {!msg.fromMe && (
                  <span className="mb-0.5 block text-[10px] font-semibold text-white/40">
                    {getSquadMemberDisplayName(squad, msg.username)}
                  </span>
                )}
                {msg.replyToId !== undefined && (
                  <div className="mb-1 max-w-full rounded-xl border-l-2 border-cyan-400/50 bg-white/5 px-2.5 py-1.5">
                    <span className="block truncate text-[9px] font-semibold text-cyan-200/70">
                      Reply to {msg.replyToUsername
                        ? getSquadMemberDisplayName(squad, msg.replyToUsername)
                        : ''}
                    </span>
                    <span className="block truncate text-[10px] text-white/45">{msg.replyToText}</span>
                  </div>
                )}
                {editingMessageId === msg.id ? (
                  <div className="min-w-[220px] rounded-2xl bg-zinc-800 p-2">
                    <input
                      autoFocus
                      value={editDraft}
                      maxLength={4000}
                      onChange={(event) => setEditDraft(event.target.value)}
                      aria-label="Edit message"
                      className="w-full rounded-xl bg-black/40 px-3 py-2 text-sm text-white outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditDraft('');
                        }}
                        className="rounded-lg px-2 py-1 text-xs text-white/60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveMessageEdit}
                        disabled={!editDraft.trim() || editDraft.trim() === msg.text}
                        aria-label="Save edited message"
                        className="rounded-lg bg-cyan-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-40"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.fromMe
                      ? 'rounded-br-md bg-gradient-to-br from-green-500 to-emerald-600 text-white'
                      : 'rounded-bl-md bg-zinc-800 text-white/90'
                  }`}>
                    {msg.text}
                  </div>
                )}
                {Object.entries(msg.reactions ?? {}).length > 0 && (
                  <div className={`mt-1 flex flex-wrap gap-1 ${msg.fromMe ? 'justify-end' : ''}`}>
                    {Object.entries(msg.reactions ?? {}).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleMessageReaction(msg, emoji)}
                        aria-label={`${emoji} reaction, ${count}`}
                        className={`rounded-full border px-1.5 py-0.5 text-xs ${
                          msg.myReaction === emoji ? 'border-cyan-400/60 bg-cyan-500/15' : 'border-white/10 bg-white/5'
                        }`}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
                {reactionMenuFor === msg.id && (
                  <div className={`mt-1 flex gap-1 rounded-full border border-white/10 bg-zinc-900 p-1 ${msg.fromMe ? 'ml-auto' : ''}`}>
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleMessageReaction(msg, emoji)}
                        aria-label={`React with ${emoji}`}
                        className="rounded-full px-1.5 py-1 text-base transition-transform hover:scale-110"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                <div className={`mt-1 flex items-center gap-2 ${msg.fromMe ? 'justify-end' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setReactionMenuFor((previous) => previous === msg.id ? null : msg.id)}
                    aria-label="Add quick reaction"
                    className="text-white/35 transition-colors hover:text-white/80"
                  >
                    <SmilePlus size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(msg);
                      setEditingMessageId(null);
                    }}
                    aria-label="Reply to message"
                    className="text-white/35 transition-colors hover:text-white/80"
                  >
                    <CornerUpLeft size={13} />
                  </button>
                  {msg.fromMe && !msg.readAt && editingMessageId !== msg.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessageId(msg.id);
                        setEditDraft(msg.text);
                      }}
                      aria-label="Edit message"
                      className="text-white/35 transition-colors hover:text-white/80"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  {msg.fromMe && (
                    <button
                      type="button"
                      onClick={() => deleteMessage(msg)}
                      aria-label="Delete message"
                      className="text-white/35 transition-colors hover:text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  {msg.editedAt && <span className="text-[9px] text-white/30">edited</span>}
                </div>
                <span className="mt-0.5 block text-[9px] text-white/30">
                  {msg.time}
                </span>
                {msg.fromMe && msg.readAt && (
                  <span className="mt-0.5 block text-right text-[9px] font-semibold text-cyan-300/80">Seen</span>
                )}
              </div>
            </div>
          );
        })}
        {dumpReels.map((reel) => (
          <div key={`drop-${reel.id}`} className="flex justify-end">
            <button
              type="button"
              onClick={() => setOverlay({ type: 'dump-wall', squadId: squad.id, reelId: reel.id })}
              className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-medium text-cyan-200/80 transition-colors hover:bg-cyan-500/20"
            >
              <Video size={12} />
              {getSquadMemberDisplayName(squad, reel.username)} dropped a reel · Tap to watch
            </button>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-cyan-400/50 bg-white/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-cyan-200/70">Replying to {replyingTo.username}</p>
              <p className="truncate text-xs text-white/50">{replyingTo.text}</p>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">
              <X size={15} className="text-white/45" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Message squad..."
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-green-400/40 focus:outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim()}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
              draft.trim()
                ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
                : 'bg-white/5 text-white/30'
            }`}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      <BottomSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Squad information & settings"
        showBackButton
      >
        <div className="max-h-[75vh] space-y-5 overflow-y-auto pb-2 no-scrollbar">
          <div>
            <label htmlFor="edit-squad-name" className="mb-2 block text-sm font-semibold text-white/75">
              Squad name
            </label>
            <input
              id="edit-squad-name"
              type="text"
              value={editedName}
              onChange={(event) => setEditedName(event.target.value)}
              maxLength={32}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-green-400/50"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-white/75">Squad picture</p>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverSelect}
              className="hidden"
              aria-label="Choose a squad picture"
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5"
            >
              <img src={editedAvatar} alt="Squad picture preview" className="absolute inset-0 h-full w-full object-cover opacity-60" />
              <span className="relative flex items-center gap-2 rounded-full bg-black/65 px-3 py-2 text-xs font-semibold text-white">
                <ImagePlus size={15} /> Change picture
              </span>
            </button>
            <p className="mt-1 text-[10px] text-white/35">Image file, up to 10 MB.</p>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/75">Members and nicknames</h3>
              <span className="text-[10px] text-white/40">{squad.members} members</span>
            </div>
            <div className="space-y-2">
              {editedMembers.map((member, index) => (
                <div key={`${member.username}-${index}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  {member.avatar ? (
                    <img src={member.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
                      {(member.nickname || member.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{member.username}</p>
                    <input
                      type="text"
                      value={member.nickname ?? ''}
                      maxLength={24}
                      placeholder="Set a nickname"
                      aria-label={`Nickname for ${member.username}`}
                      onChange={(event) => setEditedMembers((current) =>
                        current.map((item, itemIndex) => itemIndex === index
                          ? { ...item, nickname: event.target.value }
                          : item),
                      )}
                      className="mt-1 w-full bg-transparent text-[11px] text-green-200 outline-none placeholder:text-white/30"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-white/75">Add people you follow</h3>
            <label className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
              <Search size={15} className="text-white/40" />
              <input
                type="search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search followed people..."
                aria-label="Search people to add to squad"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-white/35"
              />
              {memberSearch && (
                <button type="button" onClick={() => setMemberSearch('')} aria-label="Clear people search">
                  <X size={14} className="text-white/45" />
                </button>
              )}
            </label>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {addableProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setEditedMembers((current) => [
                    ...current,
                    {
                      username: profile.display_name || profile.username,
                      avatar: profile.avatar_url ?? '',
                      handle: profile.username,
                    },
                  ])}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                >
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs text-white">
                      {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-white">{profile.display_name || profile.username}</span>
                  <UserPlus size={16} className="text-green-300" />
                </button>
              ))}
              {addableProfiles.length === 0 && (
                <p className="py-3 text-center text-xs text-white/40">
                  {followedProfiles.length ? 'No followed people available to add.' : 'Follow people to add them to a squad.'}
                </p>
              )}
            </div>
          </section>

          {settingsError && <p role="alert" className="text-xs text-red-300">{settingsError}</p>}
          <button
            type="button"
            onClick={saveSettings}
            className="w-full rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 py-3 text-sm font-bold text-black"
          >
            Save changes
          </button>

          <div className="border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setConfirmLeave(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 py-3 text-sm font-semibold text-red-300"
            >
              <LogOut size={16} /> Leave squad
            </button>
          </div>
        </div>
      </BottomSheet>
      {confirmLeave && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-squad-title"
            className="w-full max-w-[320px] rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl"
          >
            <h2 id="leave-squad-title" className="text-center text-base font-bold text-white">
              Leave {squad.name}?
            </h2>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const saved = onLeaveSquad(squad.id);
                  setConfirmLeave(false);
                  showToast(
                    saved ? 'You left the squad' : 'You left the squad for this session, but could not save it',
                    saved ? 'success' : 'default',
                  );
                }}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600"
              >
                Leave
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DumpWall({
  squad,
  userDrops,
  viewedReelIds,
  initialReelId,
  onMarkViewed,
  onBack,
}: {
  squad: Squad;
  userDrops: DumpReel[];
  viewedReelIds: number[];
  initialReelId?: number;
  onMarkViewed: (squadId: number, reelId: number) => void;
  onBack: () => void;
}) {
  const [dumpReels, setDumpReels] = useState<DumpReel[]>([
    ...(dumpReelsBySquad[squad.id] ?? []),
    ...userDrops,
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const visibleDumpReels = dumpReels;

  useEffect(() => {
    const ids = new Set(viewedReelIds);
    setDumpReels((previous) => previous.map((reel) =>
      ids.has(reel.id) && !reel.viewed ? { ...reel, viewed: true } : reel,
    ));
  }, [viewedReelIds]);

  useEffect(() => {
    if (initialReelId === undefined || initialScrollDoneRef.current) return;
    const index = visibleDumpReels.findIndex((reel) => reel.id === initialReelId);
    if (index < 0) return;
    initialScrollDoneRef.current = true;
    setActiveIdx(index);
    if (scrollRef.current) scrollRef.current.scrollTop = index * scrollRef.current.clientHeight;
  }, [initialReelId, visibleDumpReels]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      if (idx !== activeIdx && idx >= 0 && idx < visibleDumpReels.length) {
        setActiveIdx(idx);
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [activeIdx, visibleDumpReels.length]);

  // Mark an active reel as viewed after it has been on screen briefly.
  useEffect(() => {
    const activeReel = visibleDumpReels[activeIdx];
    if (!activeReel || activeReel.viewed) return;

    const timer = setTimeout(() => {
      setDumpReels((prev) =>
        prev.map((reel) =>
          reel.id === activeReel.id ? { ...reel, viewed: true } : reel,
        ),
      );
      onMarkViewed(squad.id, activeReel.id);
    }, 900);

    return () => clearTimeout(timer);
  }, [activeIdx, onMarkViewed, squad.id, visibleDumpReels]);

  const unviewed = dumpReels.filter((r) => !r.viewed).length;

  return (
    <div className="animate-overlay-in relative h-full bg-black">
      {/* Header */}
      <div className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors active:scale-90"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <img
          src={squad.avatar}
          alt={squad.name}
          className="h-9 w-9 rounded-full object-cover ring-2 ring-white/15"
        />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold text-white">{squad.name} Dump Wall</span>
          <p className="text-[11px] text-cyan-400">{unviewed} unseen</p>
        </div>
      </div>

      {/* Vertical swipe reels */}
      <div
        ref={scrollRef}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto"
      >
        {visibleDumpReels.map((reel, idx) => (
          <div
            key={reel.id}
            className="relative h-full w-full snap-start snap-always overflow-hidden"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${reel.gradient}`}>
              <div className="absolute inset-0 bg-black/30" />
            </div>
            {idx === activeIdx && (
              <video
                key={reel.id}
                src={getReelVideoSource(reel.reelId)}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {/* Top gradient */}
            <div className="absolute inset-x-0 top-16 h-24 bg-gradient-to-b from-black/40 to-transparent" />
            {/* Bottom gradient */}
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />

            {/* Creator info */}
            <div className="absolute bottom-24 left-4 right-4 space-y-2">
              <div className="flex items-center gap-2">
                <img
                  src={reel.avatar}
                  alt={reel.username}
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-white drop-shadow-lg">
                      {getSquadMemberDisplayName(squad, reel.username)}
                    </span>
                    {idx === activeIdx && reel.viewed && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white/70 backdrop-blur-sm">
                        VIEWED
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-white/50">@{reel.handle}</span>
                </div>
                <span className="ml-auto text-[11px] text-white/50">{reel.time}</span>
              </div>
              <p className="text-sm text-white/90 drop-shadow-lg">{reel.caption}</p>
            </div>

            {/* Viewed indicator */}
            {reel.viewed && (
              <div className="absolute right-4 top-20 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm">
                <Eye size={12} className="text-cyan-400" />
                <span className="text-[9px] font-semibold text-cyan-200">Viewed</span>
              </div>
            )}
          </div>
        ))}
        {visibleDumpReels.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <EyeOff size={48} className="mx-auto mb-3 text-white/20" />
              <p className="text-sm text-white/40">
                No reels in the dump wall yet
              </p>
              <p className="mt-1 text-xs text-white/25">Drop a reel from the Reels tab</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
