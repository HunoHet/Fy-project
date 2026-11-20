const REEL_VIDEO_SOURCES = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://media.w3.org/2010/05/bunny/trailer.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
  'https://media.w3.org/2010/05/video/movie_300.mp4',
  'https://media.w3.org/2010/05/bunny/movie.mp4',
  'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
];

export const getReelVideoSource = (reelId: number) =>
  REEL_VIDEO_SOURCES[(reelId - 1) % REEL_VIDEO_SOURCES.length];
