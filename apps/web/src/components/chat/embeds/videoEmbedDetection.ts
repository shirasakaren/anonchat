export interface VideoEmbedInfo {
  platform: "youtube" | "vimeo";
  embedUrl: string;
}

// Only platforms with a stable, no-auth, iframe-embeddable URL pattern -
// no fetch, no oEmbed lookup, purely client-side pattern matching. This is
// deliberately narrow: TikTok/Instagram/X don't have an equivalent (their
// real embeds require executing a remote script widget, which this app
// isn't willing to add to script-src - see the generic link-preview card
// for how those platforms are handled instead).
const YOUTUBE_PATTERNS: RegExp[] = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})/i,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/i,
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([\w-]{11})/i,
  /^https?:\/\/(?:www\.)?youtu\.be\/([\w-]{11})/i,
];

const VIMEO_PATTERN = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i;

export function detectVideoEmbed(url: string): VideoEmbedInfo | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = pattern.exec(url);
    if (match) {
      // youtube-nocookie.com (not youtube.com/embed) - avoids setting
      // YouTube's ordinary tracking cookies for a video someone merely
      // shared and hasn't necessarily chosen to play yet.
      return { platform: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${match[1]}` };
    }
  }
  const vimeoMatch = VIMEO_PATTERN.exec(url);
  if (vimeoMatch) {
    return { platform: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }
  return null;
}
