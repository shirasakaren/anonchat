import type { VideoEmbedInfo } from "./videoEmbedDetection.js";

/** A locked 16:9 iframe for a YouTube/Vimeo link - rendered as soon as the
 *  URL pattern matches, no click-to-load step, matching how Slack/Discord
 *  inline-embed these. Needs apps/server/src/app.ts's CSP `frameSrc` to
 *  allow youtube-nocookie.com/player.vimeo.com specifically - no other
 *  origin is embeddable this way. */
export function VideoEmbed({ embed }: { embed: VideoEmbedInfo }) {
  return (
    <div className="aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-[var(--border)]">
      <iframe
        src={embed.embedUrl}
        title={`Embedded ${embed.platform} video`}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
