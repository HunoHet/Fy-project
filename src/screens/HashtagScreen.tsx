import { useMemo, useState } from 'react';
import { ArrowLeft, Clapperboard, Image as ImageIcon } from 'lucide-react';
import type { PublishedContent } from '@/components/ContentPublisher';
import { toFeedPost, toReel } from '@/lib/socialContent';
import type { FeedPost, Reel } from '@/types';

type SelectedContent =
  | { type: 'post'; content: FeedPost }
  | { type: 'reel'; content: Reel };

function normalizeTag(tag: string) {
  return tag.replace(/^#/, '').toLowerCase();
}

export default function HashtagScreen({
  tag,
  onBack,
  openCreator,
  content,
}: {
  tag: string;
  onBack: () => void;
  openCreator: (handle: string) => void;
  content: PublishedContent[];
}) {
  const normalizedTag = normalizeTag(tag);
  const [selectedContent, setSelectedContent] = useState<SelectedContent | null>(null);
  const results = useMemo(() => {
    return content
      .filter((item) => item.tags.some((itemTag) => normalizeTag(itemTag) === normalizedTag))
      .map((item): SelectedContent => item.media_type === 'post'
        ? { type: 'post', content: toFeedPost(item) }
        : { type: 'reel', content: toReel(item) });
  }, [content, normalizedTag]);

  if (selectedContent) {
    const { content, type } = selectedContent;
    return (
      <div className="absolute inset-0 z-50 flex h-full flex-col overflow-hidden bg-black">
        <header className="z-10 flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/85 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setSelectedContent(null)}
            aria-label="Back to hashtag results"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-zinc-300">#{normalizedTag}</h1>
        </header>

        {type === 'post' ? (
          <article className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
            <button
              type="button"
              onClick={() => openCreator(content.handle)}
              className="flex w-full shrink-0 items-center gap-2 px-4 py-3 text-left"
            >
              <img src={content.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              <span className="text-sm font-semibold text-white">{content.username}</span>
              <span className="text-xs text-white/40">@{content.handle}</span>
            </button>
            <img
              src={content.image}
              alt={content.caption}
              className="max-h-full min-h-0 w-full flex-1 object-contain"
            />
            <div className="w-full shrink-0 px-4 py-3">
              <p className="text-sm text-white">
                <span className="font-semibold">{content.username}</span> {content.caption}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{content.tags.join(' ')}</p>
            </div>
          </article>
        ) : (
          <article className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <video
              key={content.id}
              src={content.mediaUrl ?? ''}
              muted
              loop
              playsInline
              autoPlay
              controls
              preload="metadata"
              className="absolute inset-0 h-full w-full object-contain"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-8 pt-20">
              <button
                type="button"
                onClick={() => openCreator(content.handle)}
                className="pointer-events-auto text-left"
              >
                <span className="block text-sm font-bold text-white">{content.username}</span>
                <span className="mt-1 block text-sm text-white/80">{content.caption}</span>
                <span className="mt-2 block text-xs text-zinc-400">{content.tags.join(' ')}</span>
              </button>
            </div>
          </article>
        )}
      </div>
    );
  }

  return (
    <div className="animate-overlay-in h-full overflow-y-auto bg-black pb-24">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-black/85 px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-base font-bold text-zinc-300">#{normalizedTag}</h1>
          <p className="text-xs text-white/40">{results.length} posts and reels</p>
        </div>
      </header>

      {results.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-semibold text-white/70">No posts or reels found for this hashtag yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {results.map((result) => {
            const { type, content } = result;
            return (
              <button
                key={`${type}-${content.id}`}
                type="button"
                onClick={() => setSelectedContent(result)}
                aria-label={`Open ${content.username}'s ${type}`}
                className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 text-left"
              >
                {result.type === 'post' ? (
                  <img
                    src={result.content.image}
                    alt={content.caption}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <video
                    src={result.content.mediaUrl ?? ''}
                    muted
                    loop
                    playsInline
                    autoPlay
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/20" />
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                  {type === 'post' ? <ImageIcon size={12} /> : <Clapperboard size={12} />}
                  {type === 'post' ? 'Post' : 'Reel'}
                </span>
                <span className="absolute inset-x-0 bottom-0 p-2.5">
                  <span className="block truncate text-xs font-bold text-white">{content.username}</span>
                  <span className="mt-1 block line-clamp-2 text-[10px] leading-snug text-white/75">{content.caption}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
