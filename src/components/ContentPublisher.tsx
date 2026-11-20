import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Search, Video, X } from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import { hashtagCategories } from '@/data/hashtagCategories';
import { supabase } from '@/lib/supabase';

type ContentType = 'post' | 'reel';

export interface PublishedContent {
  id: string;
  owner_id: string;
  media_type: ContentType;
  media_url: string;
  caption: string;
  tags: string[];
  created_at: string;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function ContentPublisher({
  userId,
  username,
  displayName,
  onPublished,
}: {
  userId: string | null;
  username: string;
  displayName: string;
  onPublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ContentType>('reel');
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tagLimit = 9;

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().replace(/^#/, '').toLowerCase();
    return hashtagCategories.filter((tag) => tag.includes(query));
  }, [tagSearch]);

  const close = () => {
    if (uploading) return;
    setOpen(false);
    setError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || !supabase) {
      setError('Sign in with a configured Supabase project to upload content.');
      return;
    }
    if (!file) {
      setError(type === 'reel' ? 'Choose a video to upload.' : 'Choose an image to upload.');
      return;
    }
    if (selectedTags.length < 2 || selectedTags.length > tagLimit) {
      setError('Choose between 2 and 9 topic hashtags for your content.');
      return;
    }
    const correctType = type === 'reel' ? file.type.startsWith('video/') : file.type.startsWith('image/');
    if (!correctType) {
      setError(type === 'reel' ? 'A reel must be a video file.' : 'A post must be an image file.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('The maximum upload size is 100 MB.');
      return;
    }

    setUploading(true);
    setError('');
    const client = supabase;
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (type === 'reel' ? 'mp4' : 'jpg');
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await client.storage.from('social-media').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = client.storage.from('social-media').getPublicUrl(path);
      const { error: insertError } = await client.from('posts').insert({
        owner_id: userId,
        media_type: type,
        media_url: publicUrl.publicUrl,
        storage_path: path,
        caption: caption.trim(),
        tags: selectedTags,
      });
      if (insertError) {
        const { error: removeError } = await client.storage.from('social-media').remove([path]);
        if (removeError) console.error('Could not remove media after post creation failed.', removeError);
        throw insertError;
      }

      setFile(null);
      setCaption('');
      setSelectedTags([]);
      setTagSearch('');
      setOpen(false);
      onPublished();
    } catch (uploadError) {
      console.error('Could not publish content.', uploadError);
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Your posts & reels</h2>
            <p className="mt-1 text-[11px] text-white/40">Share with your followers and the community</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-green-400 to-cyan-400 px-3 py-2 text-xs font-extrabold text-black"
          >
            <ImagePlus size={15} /> Create
          </button>
        </div>
      </section>

      <BottomSheet open={open} onClose={close} title="Create content" showBackButton>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['reel', 'post'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={type === option}
                onClick={() => {
                  setType(option);
                  setFile(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold capitalize ${
                  type === option ? 'border-green-400/50 bg-green-500/15 text-green-200' : 'border-white/10 bg-white/5 text-white/55'
                }`}
              >
                {option === 'reel' ? <Video size={16} /> : <ImagePlus size={16} />}
                {option}
              </button>
            ))}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={type === 'reel' ? 'video/*' : 'image/*'}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-4 text-center"
          >
            {file ? (
              <>
                <span className="max-w-full truncate text-sm font-semibold text-white">{file.name}</span>
                <span className="mt-1 text-xs text-white/40">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : (
              <>
                {type === 'reel' ? <Video size={22} className="text-cyan-300" /> : <ImagePlus size={22} className="text-cyan-300" />}
                <span className="mt-2 text-sm font-semibold text-white">Choose {type === 'reel' ? 'a video' : 'an image'}</span>
                <span className="mt-1 text-[11px] text-white/40">Maximum size: 100 MB</span>
              </>
            )}
          </button>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Write a caption..."
            aria-label="Caption"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-400/40"
          />
          <div>
            <label className="mb-2 block text-xs font-semibold text-white/65">
              Topic hashtags <span className="text-white/35">({selectedTags.length}/9 · minimum 2)</span>
            </label>
            {selectedTags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTags((current) => current.filter((item) => item !== tag))}
                    className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300"
                  >
                    #{tag}<X size={11} />
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
              <Search size={15} className="text-white/40" />
              <input
                value={tagSearch}
                onChange={(event) => setTagSearch(event.target.value)}
                placeholder={`Search ${hashtagCategories.length} topics...`}
                aria-label="Search hashtag categories"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-white/35"
              />
            </label>
            <div className="mt-2 grid max-h-44 grid-cols-4 gap-x-2 gap-y-1 overflow-y-auto">
              {filteredTags.map((tag) => {
                const selected = selectedTags.includes(tag);
                const disabled = !selected && selectedTags.length >= tagLimit;
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => setSelectedTags((current) =>
                      selected
                        ? current.filter((item) => item !== tag)
                        : current.length < tagLimit ? [...current, tag] : current,
                    )}
                    className={`min-w-0 break-words py-0.5 text-left text-[11px] leading-tight ${
                      selected ? 'text-zinc-300' : 'text-white/50'
                    } disabled:opacity-30`}
                  >
                    #{tag}
                  </button>
                );
              })}
              {filteredTags.length === 0 && (
                <p className="col-span-4 py-3 text-center text-xs text-white/40">No matching topics.</p>
              )}
            </div>
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-xl bg-gradient-to-r from-green-400 to-cyan-400 py-3 text-sm font-extrabold text-black disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : `Share ${type}`}
          </button>
          <p className="text-center text-[10px] text-white/30">Shared by {displayName} · @{username}</p>
        </form>
      </BottomSheet>
    </>
  );
}
