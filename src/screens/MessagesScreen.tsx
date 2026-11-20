import { useCallback, useRef, useEffect, useState } from 'react';
import {
  Search,
  ArrowLeft,
  Send,
  Heart,
  BadgeCheck,
  Phone,
  Video,
  X,
  Bell,
  MessageCircle,
  SmilePlus,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import { dmConversations, chatMessagesByConv } from '@/data/mockData';
import type { DMConversation, ChatMessage } from '@/types';
import { supabase } from '@/lib/supabase';
import type { FollowedProfile } from '@/lib/socialContent';

interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  read_at: string | null;
  message_reactions?: { user_id: string; emoji: string }[];
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface NotificationRow {
  id: string;
  actor_id: string;
  type: 'like' | 'unfollow';
  post_id: string | null;
  created_at: string;
  read_at: string | null;
  actor: Pick<ProfileRow, 'username' | 'display_name' | 'avatar_url'> | Pick<ProfileRow, 'username' | 'display_name' | 'avatar_url'>[] | null;
  post: { caption: string; media_type: 'post' | 'reel' } | { caption: string; media_type: 'post' | 'reel' }[] | null;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙌'];

function notificationsErrorMessage(error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}): string {
  const code = error.code ?? 'unknown';
  const details = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  if (code === 'PGRST205' || code === '42P01') {
    return `Supabase cannot find public.notifications (${code}). Run the complete supabase/schema.sql in the project configured for this app, then reload the page. ${details}`;
  }
  if (code === '42501') {
    return `Supabase denied access to notifications (${code}). Check the notifications SELECT/UPDATE grants and recipient-only RLS policies in supabase/schema.sql. ${details}`;
  }
  return `Notifications request failed (${code}). ${details || 'Check the Supabase API response and access policies.'}`;
}

function messageTime(timestamp: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

export default function MessagesScreen({
  dmTarget,
  clearDmTarget,
  openCreator,
  onConversationOpenChange,
  userAvatar,
  userName,
  currentUserId,
  isActive,
  followedProfiles,
  onUnreadCountChange,
  onUnreadNotificationCountChange,
}: {
  dmTarget: string | null;
  clearDmTarget: () => void;
  openCreator: (handle: string) => void;
  onConversationOpenChange: (isOpen: boolean) => void;
  userAvatar: string;
  userName: string;
  currentUserId: string | null;
  isActive: boolean;
  followedProfiles: FollowedProfile[];
  onUnreadCountChange: (count: number) => void;
  onUnreadNotificationCountChange: (count: number) => void;
}) {
  const [viewMode, setViewMode] = useState<'notifications' | 'messages'>('notifications');
  const [openConv, setOpenConv] = useState<DMConversation | null>(null);
  const [conversations, setConversations] = useState<DMConversation[]>(
    () => currentUserId ? [] : dmConversations,
  );
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() =>
    currentUserId
      ? {}
      : Object.fromEntries(
          dmConversations.map((conversation) => [
            String(conversation.id),
            [...(chatMessagesByConv[Number(conversation.id)] ?? [])],
          ]),
        ),
  );
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [backendError, setBackendError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [sending, setSending] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [reactionMenuFor, setReactionMenuFor] = useState<number | string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const openConvRef = useRef<DMConversation | null>(null);
  const activeRef = useRef(isActive);
  const viewModeRef = useRef(viewMode);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    onConversationOpenChange(isActive && openConv !== null);
  }, [isActive, openConv, onConversationOpenChange]);

  useEffect(() => {
    if (isActive && !wasActiveRef.current && !dmTarget) {
      setViewMode('notifications');
      setOpenConv(null);
      openConvRef.current = null;
      onConversationOpenChange(false);
    }
    wasActiveRef.current = isActive;
  }, [dmTarget, isActive, onConversationOpenChange]);

  useEffect(() => {
    onUnreadCountChange(conversations.reduce((total, conversation) => total + conversation.unread, 0));
  }, [conversations, onUnreadCountChange]);

  useEffect(() => {
    activeRef.current = isActive;
    viewModeRef.current = viewMode;
  }, [isActive, viewMode]);

  useEffect(() => {
    onUnreadNotificationCountChange(
      notifications.reduce((total, notification) => total + Number(!notification.read_at), 0),
    );
  }, [notifications, onUnreadNotificationCountChange]);

  const openConversation = useCallback((conversation: DMConversation) => {
    const readConversation = { ...conversation, unread: 0 };
    setViewMode('messages');
    setOpenConv(readConversation);
    openConvRef.current = readConversation;
    setConversations((prev) =>
      prev.map((item) => String(item.id) === String(conversation.id) ? { ...item, unread: 0 } : item),
    );
  }, []);

  const openFollowedProfile = useCallback((profile: FollowedProfile) => {
    const existing = conversations.find((conversation) => conversation.handle === profile.username);
    if (existing) {
      openConversation(existing);
      return;
    }

    const isTestProfile = profile.id === 'test-john';
    const conversation: DMConversation = {
      id: profile.id,
      peerId: isTestProfile ? undefined : profile.id,
      username: profile.display_name || profile.username,
      handle: profile.username,
      avatar: profile.avatar_url || '',
      lastMessage: '',
      time: 'now',
      unread: 0,
      online: false,
    };
    setMessages((previous) => ({
      ...previous,
      [String(conversation.id)]: previous[String(conversation.id)] ?? [],
    }));
    setConversations((previous) => [conversation, ...previous]);
    openConversation(conversation);
  }, [conversations, openConversation]);

  const loadConversations = useCallback(async () => {
    if (!currentUserId || !supabase) return;
    const { data: rows, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, created_at, read_at')
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('Could not load direct messages.', error);
      setBackendError('Could not load conversations. Check your Supabase configuration and access policies.');
      return;
    }

    const messagesForUser = (rows ?? []) as MessageRow[];
    const peers = [...new Set(messagesForUser.map((row) =>
      row.sender_id === currentUserId ? row.recipient_id : row.sender_id,
    ))];
    if (peers.length === 0) {
      setConversations([]);
      setBackendError('');
      return;
    }
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', peers);
    if (profileError) {
      console.error('Could not load conversation profiles.', profileError);
      setBackendError('Could not load conversation profiles.');
      return;
    }

    const profileById = new Map(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const latestByPeer = new Map<string, MessageRow>();
    const unreadByPeer = new Map<string, number>();
    for (const row of messagesForUser) {
      const peerId = row.sender_id === currentUserId ? row.recipient_id : row.sender_id;
      if (!latestByPeer.has(peerId)) latestByPeer.set(peerId, row);
      if (row.recipient_id === currentUserId && !row.read_at) {
        unreadByPeer.set(peerId, (unreadByPeer.get(peerId) ?? 0) + 1);
      }
    }
    setConversations([...latestByPeer.entries()].flatMap(([peerId, latest]) => {
      const profile = profileById.get(peerId);
      if (!profile) return [];
      return [{
        id: peerId,
        peerId,
        username: profile.display_name || profile.username,
        handle: profile.username,
        avatar: profile.avatar_url || '',
        lastMessage: latest.content,
        time: messageTime(latest.created_at),
        unread: unreadByPeer.get(peerId) ?? 0,
        online: false,
      }];
    }));
    setBackendError('');
  }, [currentUserId]);

  const loadNotifications = useCallback(async (markRead = false) => {
    if (!currentUserId || !supabase) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, actor_id, type, post_id, created_at, read_at, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url), post:posts!notifications_post_id_fkey(caption, media_type)')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Could not load notifications.', error);
      setNotificationError(notificationsErrorMessage(error));
      return;
    }

    const rows = (data ?? []) as NotificationRow[];
    const unreadIds = rows.filter((notification) => !notification.read_at).map((notification) => notification.id);
    if (markRead && unreadIds.length > 0) {
      const readAt = new Date().toISOString();
      const { error: readError } = await supabase
        .from('notifications')
        .update({ read_at: readAt })
        .in('id', unreadIds);
      if (readError) {
        console.error('Could not mark notifications as read.', readError);
        setNotificationError(`Notifications loaded but could not be marked as read. ${notificationsErrorMessage(readError)}`);
        return;
      }
      for (const notification of rows) if (!notification.read_at) notification.read_at = readAt;
    }
    setNotifications(rows);
    setNotificationError('');
  }, [currentUserId]);

  const loadThread = useCallback(async (conversation: DMConversation) => {
    if (!currentUserId || !supabase || !conversation.peerId) return;
    const peerId = conversation.peerId;
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, created_at, edited_at, read_at, message_reactions(user_id, emoji)')
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${currentUserId})`,
      )
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) {
      console.error('Could not load the conversation messages.', error);
      setBackendError('Could not load messages for this conversation.');
      return;
    }
    setMessages((previous) => ({
      ...previous,
      [String(conversation.id)]: ((data ?? []) as MessageRow[]).map((row) => {
        const reactions: Record<string, number> = {};
        for (const reaction of row.message_reactions ?? []) {
          reactions[reaction.emoji] = (reactions[reaction.emoji] ?? 0) + 1;
        }
        return {
          id: row.id,
          fromMe: row.sender_id === currentUserId,
          username: row.sender_id === currentUserId ? userName : conversation.username,
          avatar: row.sender_id === currentUserId ? userAvatar : conversation.avatar,
          text: row.content,
          time: messageTime(row.created_at),
          readAt: row.read_at,
          editedAt: row.edited_at,
          reactions,
          myReaction: row.message_reactions?.find((reaction) => reaction.user_id === currentUserId)?.emoji ?? null,
        };
      }),
    }));
    setBackendError('');
  }, [currentUserId, userAvatar, userName]);

  const markThreadRead = useCallback(async (conversation: DMConversation) => {
    if (!currentUserId || !supabase || !conversation.peerId) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from('messages')
      .update({ read_at: readAt })
      .eq('sender_id', conversation.peerId)
      .eq('recipient_id', currentUserId)
      .is('read_at', null);
    if (error) {
      console.error('Could not mark messages as read.', error);
      setBackendError('Could not update read receipts.');
      return;
    }
    setMessages((previous) => ({
      ...previous,
      [String(conversation.id)]: (previous[String(conversation.id)] ?? []).map((message) =>
        message.fromMe ? message : { ...message, readAt },
      ),
    }));
    setConversations((previous) => previous.map((item) =>
      String(item.id) === String(conversation.id) ? { ...item, unread: 0 } : item,
    ));
  }, [currentUserId]);

  useEffect(() => {
    openConvRef.current = openConv;
  }, [openConv]);

  useEffect(() => {
    if (!currentUserId || !supabase) return;
    let active = true;
    void loadConversations();
    const channel = supabase
      .channel(`direct-messages:${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<MessageRow>;
        if (payload.eventType === 'DELETE' && row.id && (!row.sender_id || !row.recipient_id)) {
          setMessages((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, thread]) => [
              key,
              thread.filter((message) => String(message.id) !== String(row.id)),
            ]),
          ));
          if (active) void loadConversations();
          return;
        }
        if (row.sender_id !== currentUserId && row.recipient_id !== currentUserId) return;
        if (payload.eventType === 'INSERT' && row.id && row.sender_id && row.recipient_id) {
          const conversation = openConvRef.current;
          const peerId = row.sender_id === currentUserId ? row.recipient_id : row.sender_id;
          const isOpenRecipient = activeRef.current && conversation?.peerId === peerId && row.recipient_id === currentUserId;
          const message: ChatMessage = {
            id: row.id,
            fromMe: row.sender_id === currentUserId,
            username: row.sender_id === currentUserId ? userName : conversation?.username ?? 'User',
            avatar: row.sender_id === currentUserId ? userAvatar : conversation?.avatar ?? '',
            text: row.content ?? '',
            time: row.created_at ? messageTime(row.created_at) : 'now',
            readAt: isOpenRecipient ? new Date().toISOString() : row.read_at,
            editedAt: row.edited_at,
          };
          setMessages((previous) => {
            const key = String(conversation?.id ?? peerId);
            const existing = previous[key] ?? [];
            if (existing.some((item) => String(item.id) === String(message.id))) return previous;
            return { ...previous, [key]: [...existing, message] };
          });
          if (isOpenRecipient && supabase) {
            void supabase.from('messages').update({ read_at: new Date().toISOString() })
              .eq('id', row.id).is('read_at', null)
              .then(({ error }) => {
                if (error) console.error('Could not mark the incoming message as read.', error);
              });
          }
        } else if (payload.eventType === 'UPDATE' && row.id) {
          setMessages((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, thread]) => [
              key,
              thread.map((message) =>
                String(message.id) === String(row.id)
                  ? {
                      ...message,
                      readAt: row.read_at ?? null,
                      text: row.content ?? message.text,
                      editedAt: row.edited_at ?? message.editedAt,
                    }
                  : message,
              ),
            ]),
          ));
        } else if (payload.eventType === 'DELETE' && row.id) {
          setMessages((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, thread]) => [
              key,
              thread.filter((message) => String(message.id) !== String(row.id)),
            ]),
          ));
        }
        if (active) void loadConversations();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        const conversation = openConvRef.current;
        if (activeRef.current && conversation) void loadThread(conversation);
      })
      .subscribe((status, error) => {
        if (error) {
          console.error('Could not subscribe to realtime messages.', error);
          setBackendError('Realtime connection failed. Check that the messages table is in the Supabase Realtime publication.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime message subscription failed:', status);
          setBackendError('Realtime connection failed. Check that the messages table is in the Supabase Realtime publication.');
        } else if (status === 'SUBSCRIBED') {
          setBackendError('');
        }
      });
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, [currentUserId, loadConversations, loadThread, userAvatar, userName]);

  useEffect(() => {
    if (!currentUserId || !supabase) return;
    void loadNotifications();
    const channel = supabase
      .channel(`user-notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        () => void loadNotifications(activeRef.current && viewModeRef.current === 'notifications'),
      )
      .subscribe((status, error) => {
        if (error || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Could not subscribe to notifications.', error ?? status);
          setNotificationError('Realtime notifications are unavailable. Check that notifications are enabled in Supabase Realtime.');
        }
      });
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [currentUserId, loadNotifications]);

  useEffect(() => {
    if (isActive && viewMode === 'notifications' && currentUserId && supabase) {
      void loadNotifications(true);
    }
  }, [currentUserId, isActive, loadNotifications, viewMode]);

  useEffect(() => {
    if (!isActive || !openConv || !currentUserId || !supabase) return;
    void loadThread(openConv).then(() => markThreadRead(openConv));
  }, [currentUserId, isActive, loadThread, markThreadRead, openConv]);

  // Auto-open conversation when dmTarget is set (from "Send Message" on a profile)
  useEffect(() => {
    if (!dmTarget) return;
    const followedTestProfile = followedProfiles.find(
      (profile) => profile.username === dmTarget && profile.id === 'test-john',
    );
    if (followedTestProfile) {
      openFollowedProfile(followedTestProfile);
      clearDmTarget();
      return;
    }
    if (currentUserId && supabase) {
      let active = true;
      void (async () => {
        const existing = conversations.find((conversation) => conversation.handle === dmTarget);
        if (existing) {
          openConversation(existing);
          clearDmTarget();
          return;
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('username', dmTarget)
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          console.error('Could not find the account to message.', error ?? dmTarget);
          setBackendError('Could not find this account. It may not have a Supabase profile yet.');
          clearDmTarget();
          return;
        }
        const profile = data as ProfileRow;
        const newConversation: DMConversation = {
          id: profile.id,
          peerId: profile.id,
          username: profile.display_name || profile.username,
          handle: profile.username,
          avatar: profile.avatar_url || '',
          lastMessage: '',
          time: 'now',
          unread: 0,
          online: false,
        };
        setConversations((previous) => [
          newConversation,
          ...previous.filter((conversation) => conversation.peerId !== profile.id),
        ]);
        openConversation(newConversation);
        clearDmTarget();
      })();
      return () => { active = false; };
    }
    const conv = conversations.find((c) => c.handle === dmTarget);
    if (conv) {
      openConversation(conv);
    } else {
      const newConv: DMConversation = {
        id: Date.now(),
        username: dmTarget.split('.')[0].charAt(0).toUpperCase() + dmTarget.slice(1),
        handle: dmTarget,
        avatar: '',
        lastMessage: '',
        time: 'now',
        unread: 0,
        online: true,
      };
      setMessages((prev) => ({ ...prev, [newConv.id]: [] }));
      setConversations((prev) => [newConv, ...prev]);
      setViewMode('messages');
      setOpenConv(newConv);
    }
    clearDmTarget();
  }, [
    dmTarget,
    conversations,
    clearDmTarget,
    currentUserId,
    followedProfiles,
    openFollowedProfile,
    openConversation,
  ]);

  useEffect(() => {
    if (openConv && messages[openConv.id]) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [openConv, messages]);

  const normalizedSearch = search.trim().replace(/^@/, '').toLocaleLowerCase();
  const filtered = conversations.filter(
    (c) =>
      c.username.toLocaleLowerCase().includes(normalizedSearch) ||
      c.handle.toLocaleLowerCase().includes(normalizedSearch) ||
      c.lastMessage.toLocaleLowerCase().includes(normalizedSearch),
  );
  const followedSearchResults = normalizedSearch
    ? followedProfiles
      .filter((profile) =>
        (profile.display_name || profile.username).toLocaleLowerCase().includes(normalizedSearch) ||
        profile.username.toLocaleLowerCase().includes(normalizedSearch),
      )
      .filter((profile) => !conversations.some((conversation) => conversation.handle === profile.username))
      .sort((a, b) =>
        (a.display_name || a.username).localeCompare(
          b.display_name || b.username,
          undefined,
          { sensitivity: 'base' },
        ),
      )
    : [];

  const sendMessage = () => {
    if (!openConv || !draft.trim()) return;
    const text = draft.trim();
    if (currentUserId && supabase && openConv.peerId) {
      setSending(true);
      setBackendError('');
      void supabase.from('messages').insert({
        sender_id: currentUserId,
        recipient_id: openConv.peerId,
        content: text,
      }).select('id, sender_id, recipient_id, content, created_at, edited_at, read_at').single()
        .then(({ data, error }) => {
          setSending(false);
          if (error) {
            console.error('Could not send direct message.', error);
            setBackendError('Message could not be sent. Check the Supabase messages policies.');
            return;
          }
          const row = data as MessageRow;
          const message: ChatMessage = {
            id: row.id,
            fromMe: true,
            username: userName,
            avatar: userAvatar,
            text: row.content,
            time: messageTime(row.created_at),
            readAt: row.read_at,
            editedAt: row.edited_at,
          };
          setMessages((previous) => ({
            ...previous,
            [String(openConv.id)]: [
              ...(previous[String(openConv.id)] ?? []).filter((item) => String(item.id) !== String(message.id)),
              message,
            ],
          }));
          setConversations((previous) => [
            { ...openConv, lastMessage: text, time: 'now', unread: 0 },
            ...previous.filter((conversation) => String(conversation.id) !== String(openConv.id)),
          ]);
          setOpenConv((previous) => previous
            ? { ...previous, lastMessage: text, time: 'now', unread: 0 }
            : previous);
          setDraft('');
        });
      return;
    }
    const newMsg: ChatMessage = {
      id: Date.now(),
      fromMe: true,
      username: userName,
      avatar: userAvatar,
      time: 'now',
      text,
    };
    setMessages((prev) => ({
      ...prev,
      [String(openConv.id)]: [...(prev[String(openConv.id)] ?? []), newMsg],
    }));
    setConversations((prev) => {
      const updatedConversation = { ...openConv, lastMessage: text, time: 'now', unread: 0 };
      return [
        updatedConversation,
        ...prev.filter((conversation) => String(conversation.id) !== String(openConv.id)),
      ];
    });
    setOpenConv((prev) => prev ? { ...prev, lastMessage: text, time: 'now', unread: 0 } : prev);
    setDraft('');
  };

  const saveMessageEdit = async () => {
    if (!openConv || editingMessageId === null) return;
    const text = editDraft.trim();
    const thread = messages[String(openConv.id)] ?? [];
    const target = thread.find((message) => String(message.id) === String(editingMessageId));
    if (!target || !target.fromMe || target.readAt || !text || text.length > 4000) return;
    const isUuid = typeof target.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.id);
    let editedAt = new Date().toISOString();
    if (isUuid && currentUserId && supabase) {
      const { data, error } = await supabase
        .from('messages')
        .update({ content: text })
        .eq('id', target.id)
        .eq('sender_id', currentUserId)
        .is('read_at', null)
        .select('id, content, edited_at')
        .maybeSingle();
      if (error || !data) {
        console.error('Could not edit direct message.', error ?? target.id);
        setBackendError('This message could not be edited. It may already have been read.');
        return;
      }
      editedAt = data.edited_at ?? editedAt;
    }

    setMessages((previous) => ({
      ...previous,
      [String(openConv.id)]: (previous[String(openConv.id)] ?? []).map((message) =>
        String(message.id) === String(target.id) ? { ...message, text, editedAt } : message,
      ),
    }));
    if (String(thread[thread.length - 1]?.id) === String(target.id)) {
      setConversations((previous) => previous.map((conversation) =>
        String(conversation.id) === String(openConv.id) ? { ...conversation, lastMessage: text } : conversation,
      ));
      setOpenConv((previous) => previous ? { ...previous, lastMessage: text } : previous);
    }
    setEditingMessageId(null);
    setEditDraft('');
    setBackendError('');
  };

  const deleteMessage = async (target: ChatMessage) => {
    if (!openConv || !target.fromMe) return;
    const isUuid = typeof target.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.id);
    if (isUuid && currentUserId && supabase) {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', target.id)
        .eq('sender_id', currentUserId)
        .select('id')
        .maybeSingle();
      if (error || !data) {
        console.error('Could not delete direct message.', error ?? target.id);
        setBackendError('This message could not be deleted.');
        return;
      }
    }
    const remaining = (messages[String(openConv.id)] ?? []).filter(
      (message) => String(message.id) !== String(target.id),
    );
    if (String(editingMessageId) === String(target.id)) {
      setEditingMessageId(null);
      setEditDraft('');
    }
    setMessages((previous) => ({ ...previous, [String(openConv.id)]: remaining }));
    const lastMessage = remaining[remaining.length - 1]?.text ?? '';
    setConversations((previous) => previous.map((conversation) =>
      String(conversation.id) === String(openConv.id) ? { ...conversation, lastMessage } : conversation,
    ));
    setOpenConv((previous) => previous ? { ...previous, lastMessage } : previous);
    setBackendError('');
  };

  const toggleMessageReaction = async (target: ChatMessage, emoji: string) => {
    if (!openConv) return;
    const nextReaction = target.myReaction === emoji ? null : emoji;
    const isUuid = typeof target.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.id);
    if (isUuid && currentUserId && supabase) {
      const result = nextReaction
        ? await supabase.from('message_reactions').upsert(
            { message_id: target.id, user_id: currentUserId, emoji: nextReaction },
            { onConflict: 'message_id,user_id' },
          )
        : await supabase.from('message_reactions')
            .delete()
            .eq('message_id', target.id)
            .eq('user_id', currentUserId);
      if (result.error) {
        console.error('Could not save message reaction.', result.error);
        setBackendError('Could not save your reaction.');
        return;
      }
    }

    setMessages((previous) => ({
      ...previous,
      [String(openConv.id)]: (previous[String(openConv.id)] ?? []).map((message) => {
        if (String(message.id) !== String(target.id)) return message;
        const reactions = { ...(message.reactions ?? {}) };
        if (message.myReaction) {
          reactions[message.myReaction] = Math.max(0, (reactions[message.myReaction] ?? 1) - 1);
          if (reactions[message.myReaction] === 0) delete reactions[message.myReaction];
        }
        if (nextReaction) reactions[nextReaction] = (reactions[nextReaction] ?? 0) + 1;
        return { ...message, reactions, myReaction: nextReaction };
      }),
    }));
    setReactionMenuFor(null);
    setBackendError('');
  };

  const selectViewMode = (mode: 'notifications' | 'messages') => {
    setViewMode(mode);
    if (mode === 'notifications') {
      setOpenConv(null);
      openConvRef.current = null;
      onConversationOpenChange(false);
    }
  };

  const viewSelector = (
    <div
      role="group"
      aria-label="Choose Messages or Notifications"
      className="relative inline-flex items-center rounded-full border border-white/10 bg-zinc-900/80 p-1"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_12px_rgba(34,211,238,0.2)] transition-transform duration-300 ease-out ${
          viewMode === 'messages' ? 'translate-x-full' : ''
        }`}
      />
      <button
        type="button"
        aria-pressed={viewMode === 'notifications'}
        onClick={() => selectViewMode('notifications')}
        className={`relative z-10 flex min-w-[120px] items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-300 ${
          viewMode === 'notifications' ? 'text-white' : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Bell size={15} />
        Notifications
      </button>
      <button
        type="button"
        aria-pressed={viewMode === 'messages'}
        onClick={() => selectViewMode('messages')}
        className={`relative z-10 flex min-w-[120px] items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-300 ${
          viewMode === 'messages' ? 'text-white' : 'text-white/50 hover:text-white/80'
        }`}
      >
        <MessageCircle size={15} />
        Messages
      </button>
    </div>
  );

  if (openConv) {
    const convMessages = messages[String(openConv.id)] ?? [];
    return (
      <div className="animate-overlay-in flex h-full flex-col bg-black">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
          <button
            onClick={() => {
              setOpenConv(null);
              openConvRef.current = null;
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors active:scale-90"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <button
            onClick={() => openCreator(openConv.handle)}
            className="relative transition-transform active:scale-90"
          >
            <img
              src={openConv.avatar}
              alt={openConv.username}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white/15"
            />
            {openConv.online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black bg-green-400" />
            )}
          </button>
          <button onClick={() => openCreator(openConv.handle)} className="flex-1 text-left">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-white">{openConv.username}</span>
              {openConv.online && <span className="text-[10px] font-semibold text-green-400">Active</span>}
            </div>
            <span className="text-[11px] text-white/40">@{openConv.handle}</span>
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors active:scale-90">
            <Phone size={18} className="text-cyan-400" />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors active:scale-90">
            <Video size={18} className="text-cyan-400" />
          </button>
        </div>
        <div className="border-b border-white/10 px-4 py-2">{viewSelector}</div>

        {backendError && (
          <p role="alert" className="mx-3 mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {backendError}
          </p>
        )}

        {/* Messages */}
        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {convMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex animate-msg-in items-end gap-2 ${msg.fromMe ? 'flex-row-reverse' : ''}`}
            >
              {!msg.fromMe && (
                <img src={msg.avatar} alt={msg.username} className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10" />
              )}
              <div className={`max-w-[75%] ${msg.fromMe ? 'items-end' : 'items-start'}`}>
                {!msg.fromMe && (
                  <span className="mb-0.5 block text-[10px] font-semibold text-white/40">{msg.username}</span>
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
                        onClick={() => void saveMessageEdit()}
                        disabled={!editDraft.trim() || editDraft.trim() === msg.text}
                        aria-label="Save edited message"
                        className="rounded-lg bg-cyan-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-40"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                      msg.fromMe
                        ? 'rounded-br-md bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
                        : 'rounded-bl-md bg-zinc-800 text-white/90'
                    }`}
                  >
                    {msg.text}
                  </div>
                )}
                {Object.entries(msg.reactions ?? {}).length > 0 && (
                  <div className={`mt-1 flex flex-wrap gap-1 ${msg.fromMe ? 'justify-end' : ''}`}>
                    {Object.entries(msg.reactions ?? {}).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void toggleMessageReaction(msg, emoji)}
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
                        onClick={() => void toggleMessageReaction(msg, emoji)}
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
                      onClick={() => void deleteMessage(msg)}
                      aria-label="Delete message"
                      className="text-white/35 transition-colors hover:text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  {msg.editedAt && <span className="text-[9px] text-white/30">edited</span>}
                </div>
                <span className={`mt-0.5 block text-[9px] text-white/30 ${msg.fromMe ? 'text-right' : ''}`}>
                  {msg.time}
                </span>
                {msg.fromMe && msg.readAt && (
                  <span className="mt-0.5 block text-right text-[9px] font-semibold text-cyan-300/80">Seen</span>
                )}
              </div>
            </div>
          ))}
          {convMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-white/30">Say hi to {openConv.username}</p>
              <p className="mt-1 text-xs text-white/20">No messages yet</p>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
          className="border-t border-white/10 bg-black/95 px-4 pb-4 pt-3 backdrop-blur-xl"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message..."
              aria-label={`Message ${openConv.username}`}
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                draft.trim()
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                  : 'bg-white/5 text-white/30'
              }`}
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="animate-screen-in h-full overflow-y-auto no-scrollbar bg-black pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          {viewSelector}
          <span className="text-sm font-bold text-cyan-400">
            {viewMode === 'messages'
              ? `${conversations.filter((conversation) => conversation.unread > 0).length} unread`
              : `${notifications.filter((notification) => !notification.read_at).length} new`}
          </span>
        </div>
        {viewMode === 'messages' && <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 px-3 py-3 focus-within:border-cyan-400/50">
            <Search size={17} className="shrink-0 text-white/40" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations or people you follow..."
              aria-label="Search conversations and followed people"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear conversation search"
                className="rounded-full p-1 text-white/45 transition-colors hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>}
      </div>

      {(viewMode === 'notifications' ? notificationError : backendError) && (
        <p role="alert" className="mx-3 mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {viewMode === 'notifications' ? notificationError : backendError}
        </p>
      )}

      {viewMode === 'notifications' ? (
        <div className="px-2 pt-2">
          {notifications.map((notification) => {
            const actor = Array.isArray(notification.actor) ? notification.actor[0] : notification.actor;
            const post = Array.isArray(notification.post) ? notification.post[0] : notification.post;
            const actorName = actor?.display_name || actor?.username || 'Someone';
            const username = actor?.username;
            const liked = notification.type === 'like';
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (username) openCreator(username);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/5"
              >
                {actor?.avatar_url ? (
                  <img
                    src={actor.avatar_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/10"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white/70">
                    {actorName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-white">
                    <strong>{actorName}</strong>{' '}
                    {liked
                      ? `liked your ${post?.media_type ?? 'video'}`
                      : 'unfollowed you'}
                  </span>
                  {liked && post?.caption && (
                    <span className="mt-0.5 block truncate text-xs text-white/40">
                      {post.caption}
                    </span>
                  )}
                  <span className="mt-1 block text-[10px] text-white/35">
                    {messageTime(notification.created_at)}
                  </span>
                </span>
                {liked
                  ? <Heart size={18} className="shrink-0 text-rose-400" />
                  : <Bell size={17} className="shrink-0 text-cyan-300" />}
              </button>
            );
          })}
          {notifications.length === 0 && (
            <p className="py-12 text-center text-sm text-white/35">No notifications yet</p>
          )}
        </div>
      ) : (
      <>
      {/* Conversation list */}
      <div className="px-2 pt-2">
        {filtered.map((conv) => (
          <div
            key={conv.id}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-white/5"
          >
            <button
              onClick={() => openConversation(conv)}
              className="relative shrink-0 transition-transform active:scale-90"
            >
              <img
                src={conv.avatar}
                alt={conv.username}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-white/10"
              />
              {conv.online && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-black bg-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.6)]" />
              )}
            </button>
            <button
              onClick={() => openConversation(conv)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white">{conv.username}</span>
                {conv.username === 'David' && <BadgeCheck size={13} className="text-blue-400" />}
              </div>
              <p className={`truncate text-xs ${conv.unread ? 'font-semibold text-white/80' : 'text-white/40'}`}>
                {conv.lastMessage}
              </p>
            </button>
            <button
              onClick={() => openCreator(conv.handle)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/40 transition-all active:scale-90 hover:bg-white/10"
              title="View profile"
            >
              <BadgeCheck size={16} />
            </button>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-white/40">{conv.time}</span>
              {conv.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold text-white drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]">
                  {conv.unread}
                </span>
              )}
            </div>
          </div>
        ))}
        {followedSearchResults.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-white/35">
              People you follow
            </p>
            {followedSearchResults.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => openFollowedProfile(profile)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/5"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/10"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white/70">
                    {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">
                    {profile.display_name || profile.username}
                  </span>
                  <span className="block truncate text-xs text-white/40">@{profile.username}</span>
                </span>
                <Send size={16} className="shrink-0 text-cyan-300" />
              </button>
            ))}
          </>
        )}
        {filtered.length === 0 && followedSearchResults.length === 0 && (
          <p className="py-12 text-center text-sm text-white/30">No conversations found</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
