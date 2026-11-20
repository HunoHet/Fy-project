import { useState, type FormEvent } from 'react';
import { Heart, MessageCircle, Send, Trash2, X } from 'lucide-react';
import type { Comment } from '@/types';

export default function CommentThread({
  comments,
  currentUserId,
  error,
  loading,
  onSend,
  onLike,
  onDelete,
}: {
  comments: Comment[];
  currentUserId: string | null;
  error: string;
  loading: boolean;
  onSend: (text: string, parentId?: Comment['id']) => Promise<boolean>;
  onLike: (comment: Comment) => Promise<void>;
  onDelete: (comment: Comment) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment['id'] | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const topLevelComments = comments.filter((comment) => comment.parentId == null);

  const send = async (event: FormEvent<HTMLFormElement>, parentId?: Comment['id']) => {
    event.preventDefault();
    const text = parentId === undefined ? draft : replyDraft;
    if (!text.trim() || loading) return;
    if (!await onSend(text.trim(), parentId)) return;
    if (parentId === undefined) setDraft('');
    else {
      setReplyDraft('');
      setReplyingTo(null);
    }
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={`flex gap-2.5 ${isReply ? 'ml-9 border-l border-white/10 pl-3' : ''}`}>
      {comment.avatar ? (
        <img
          src={comment.avatar}
          alt=""
          className={`${isReply ? 'h-7 w-7' : 'h-9 w-9'} shrink-0 rounded-full object-cover ring-1 ring-white/10`}
        />
      ) : (
        <span className={`${isReply ? 'h-7 w-7' : 'h-9 w-9'} flex shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/60`}>
          {comment.username.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white">{comment.username}</span>
          <span className="truncate text-[10px] text-white/35">@{comment.handle}</span>
          <span className="shrink-0 text-[10px] text-white/30">{comment.time}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-white/80">{comment.text}</p>
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            aria-label={`${comment.likedByMe ? 'Unlike' : 'Like'} comment`}
            aria-pressed={comment.likedByMe ?? false}
            onClick={() => void onLike(comment)}
            className="flex items-center gap-1 text-[11px] text-white/45 disabled:opacity-40"
          >
            <Heart size={13} fill={comment.likedByMe ? '#f43f5e' : 'none'} color={comment.likedByMe ? '#f43f5e' : 'currentColor'} />
            {comment.likes}
          </button>
          {!isReply && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setReplyingTo(comment.id);
                setReplyDraft('');
              }}
              className="flex items-center gap-1 text-[11px] text-white/45 disabled:opacity-40"
            >
              <MessageCircle size={13} /> Reply
            </button>
          )}
          {comment.userId === currentUserId && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void onDelete(comment)}
              className="flex items-center gap-1 text-[11px] text-red-300/70 disabled:opacity-40"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
        {!isReply && replyingTo === comment.id && (
          <form onSubmit={(event) => void send(event, comment.id)} className="mt-2 flex items-center gap-2">
            <input
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              maxLength={1000}
              disabled={loading}
              placeholder={`Reply to ${comment.username}...`}
              aria-label={`Reply to ${comment.username}`}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none"
            />
            <button type="submit" disabled={!replyDraft.trim() || loading} aria-label="Send reply" className="text-cyan-200 disabled:opacity-30">
              <Send size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyingTo(null);
                setReplyDraft('');
              }}
              aria-label="Cancel reply"
              className="text-white/40"
            >
              <X size={15} />
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <div className="no-scrollbar max-h-[45vh] space-y-3 overflow-y-auto overscroll-contain px-1 py-2">
        {loading && <p role="status" className="text-center text-xs text-white/40">Loading comments…</p>}
        {error && <p role="alert" className="text-center text-xs text-red-300">{error}</p>}
        {topLevelComments.map((comment) => (
          <div key={comment.id} className="space-y-3">
            {renderComment(comment)}
            {comments.filter((reply) => reply.parentId === comment.id).map((reply) => renderComment(reply, true))}
          </div>
        ))}
        {!loading && topLevelComments.length === 0 && (
          <p className="py-7 text-center text-sm text-white/35">No comments yet</p>
        )}
      </div>
      <form onSubmit={(event) => void send(event)} className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          disabled={loading}
          placeholder="Add a comment..."
          aria-label="Write a comment"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-green-400/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || loading}
          aria-label="Send comment"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white disabled:bg-white/5 disabled:text-white/30"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
