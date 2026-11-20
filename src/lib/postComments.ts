import type { Comment } from '@/types';
import { supabase } from '@/lib/supabase';

interface StoredPostComment {
  id: string;
  user_id: string;
  parent_comment_id: string | null;
  username: string;
  handle: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
  like_count: number;
  post_comment_likes?: { user_id: string }[];
}

interface SupabaseCommentError {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
}

function isSupabaseCommentError(error: unknown): error is SupabaseCommentError {
  return typeof error === 'object' && error !== null;
}

export function toCommentError(error: unknown): Error {
  if (!isSupabaseCommentError(error)) {
    return error instanceof Error ? error : new Error('Could not save your comment.');
  }

  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : 'Could not save your comment.';
  const details = typeof error.details === 'string' ? error.details : '';
  const hint = typeof error.hint === 'string' ? error.hint : '';
  const guidance = code === '42P01' || code === 'PGRST205'
    ? 'The comments table is missing. Run the latest supabase/schema.sql in the Supabase SQL Editor.'
    : code === '42501'
      ? 'Supabase denied access to comments. Re-run the latest supabase/schema.sql to install the comment permissions.'
      : '';
  const diagnostic = [code && `(${code})`, details, hint].filter(Boolean).join(' ');
  return new Error([guidance, message, diagnostic].filter(Boolean).join(' '));
}

function isComment(value: unknown): value is Comment {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value && (typeof value.id === 'number' || typeof value.id === 'string') &&
    'username' in value && typeof value.username === 'string' &&
    'handle' in value && typeof value.handle === 'string' &&
    'avatar' in value && typeof value.avatar === 'string' &&
    'text' in value && typeof value.text === 'string' &&
    'time' in value && typeof value.time === 'string' &&
    'likes' in value && typeof value.likes === 'number'
  );
}

function localCommentStorageKey(userId: string | null): string {
  return `social-app-comments-v1:${userId ?? 'guest'}`;
}

export function commentListKey(kind: 'post' | 'reel', id: number | string): string {
  return `${kind}:${id}`;
}

export function isSupabasePostId(contentId: string | undefined): contentId is string {
  return contentId !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId);
}

export function contentCommentListKey(
  kind: 'post' | 'reel',
  localId: number | string,
  contentId: string | undefined,
): string {
  return commentListKey(kind, isSupabasePostId(contentId) ? contentId : localId);
}

export function readCommentLists(userId: string | null): Record<string, Comment[]> {
  try {
    const stored = window.localStorage.getItem(localCommentStorageKey(userId));
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('Stored comments are invalid; starting with an empty comment list.');
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, Comment[]] =>
          Array.isArray(entry[1]) && entry[1].every(isComment),
        )
        .map(([key, comments]) => [key, comments.map((comment) => ({
          ...comment,
          userId: comment.userId ?? userId,
        }))]),
    );
  } catch (error) {
    console.error('Could not read saved comments.', error);
    return {};
  }
}

export function saveLocalComment(
  userId: string | null,
  key: string,
  comment: Comment,
): Record<string, Comment[]> {
  const existing = readCommentLists(userId);
  const updated = {
    ...existing,
    [key]: [...(existing[key] ?? []), comment],
  };
  try {
    window.localStorage.setItem(localCommentStorageKey(userId), JSON.stringify(updated));
  } catch (error) {
    console.error('Could not save this comment on this device.', error);
    throw new Error('Could not save the comment on this device.');
  }
  return updated;
}

function toComment(row: StoredPostComment): Comment {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_comment_id,
    username: row.username,
    handle: row.handle,
    avatar: row.avatar_url ?? '',
    text: row.content,
    time: new Date(row.created_at).toLocaleString(),
    likes: row.like_count,
    likedByMe: false,
  };
}

export async function loadPostComments(postId: string, currentUserId: string | null): Promise<Comment[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, user_id, parent_comment_id, username, handle, avatar_url, content, created_at, like_count, post_comment_likes(user_id)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw toCommentError(error);
  return ((data ?? []) as StoredPostComment[]).map((row) => ({
    ...toComment(row),
    likedByMe: currentUserId
      ? row.post_comment_likes?.some((like) => like.user_id === currentUserId) ?? false
      : false,
  }));
}

export async function addPostComment({
  postId,
  userId,
  username,
  handle,
  avatar,
  content,
  parentId,
}: {
  postId: string;
  userId: string;
  username: string;
  handle: string;
  avatar: string;
  content: string;
  parentId?: string;
}): Promise<Comment> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      user_id: userId,
      username,
      handle,
      avatar_url: avatar || null,
      content,
      parent_comment_id: parentId ?? null,
    })
    .select('id, user_id, parent_comment_id, username, handle, avatar_url, content, created_at, like_count')
    .single();
  if (error) throw toCommentError(error);
  return toComment(data as StoredPostComment);
}

export async function setPostCommentLike(
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const result = liked
    ? await supabase.from('post_comment_likes').insert({ comment_id: commentId, user_id: userId })
    : await supabase.from('post_comment_likes').delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
  if (result.error) throw toCommentError(result.error);
}

export async function deletePostComment(commentId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId)
    .select('id')
    .single();
  if (error) throw toCommentError(error);
}

function saveCommentLists(userId: string | null, lists: Record<string, Comment[]>): void {
  try {
    window.localStorage.setItem(localCommentStorageKey(userId), JSON.stringify(lists));
  } catch (error) {
    console.error('Could not update saved comments.', error);
    throw new Error('Could not update the comment on this device.');
  }
}

export function toggleLocalCommentLike(
  userId: string | null,
  key: string,
  commentId: Comment['id'],
  liked: boolean,
): Record<string, Comment[]> {
  const lists = readCommentLists(userId);
  const updated = {
    ...lists,
    [key]: (lists[key] ?? []).map((comment) => comment.id === commentId &&
      (comment.likedByMe ?? false) !== liked
      ? {
          ...comment,
          likes: Math.max(0, comment.likes + (liked ? 1 : -1)),
          likedByMe: liked,
        }
      : comment),
  };
  saveCommentLists(userId, updated);
  return updated;
}

export function removeLocalComment(
  userId: string | null,
  key: string,
  commentId: Comment['id'],
): Record<string, Comment[]> {
  const lists = readCommentLists(userId);
  const updated = {
    ...lists,
    [key]: (lists[key] ?? []).filter((comment) =>
      comment.id !== commentId && comment.parentId !== commentId,
    ),
  };
  saveCommentLists(userId, updated);
  return updated;
}
