import type { VideoEmbedInfo } from "./videoEmbedDetection.js";

/** A locked 16:9 iframe for a YouTube/Vimeo link - rendered as soon as the
 *  URL pattern matches, no click-to-load step, matching how Slack/Discord
 *  inline-embed these. Needs apps/server/src/app.ts's CSP `frameSrc` to
 *  allow youtube-nocookie.com/player.vimeo.com specifically - no other
 *  origin is embeddable this way. Some uploaders disable embedding on
 *  individual videos (YouTube then shows its own "Video unavailable"
 *  screen inside the frame), so a direct open-on-platform link stays
 *  available underneath the player as a fallback. */
export function VideoEmbed({ embed }: { embed: VideoEmbedInfo }) {
  return (
    <div className="w-full max-w-sm">
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-[var(--border)]">
        <iframe
          src={embed.embedUrl}
          title={`Embedded ${embed.platform} video`}
          className="h-full w-full"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <a
        href={embed.watchUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-1 inline-block text-xs underline opacity-75 hover:opacity-100"
      >
        Open on {embed.platform === "youtube" ? "YouTube" : "Vimeo"}
      </a>
    </div>
  );
}
