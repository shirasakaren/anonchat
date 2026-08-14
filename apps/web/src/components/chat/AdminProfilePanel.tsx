import { useState } from "react";
import { Check, Copy, ExternalLink, PanelLeftClose } from "lucide-react";
import type { ProfileMediaDto, PublicSiteInfoDto } from "@anonchat/shared";
import { DefaultAvatar } from "../common/DefaultAvatar.js";
import { ProfileMediaTile } from "../common/ProfileMediaTile.js";
import { ImageLightbox } from "./preview/ImageLightbox.js";

interface Props {
  site: PublicSiteInfoDto;
  onClose: () => void;
}

export function AdminProfilePanel({ site, onClose }: Props) {
  const [keyCopied, setKeyCopied] = useState(false);
  const [openImage, setOpenImage] = useState<ProfileMediaDto | null>(null);

  async function copyPublicKey() {
    if (!site.pgpPublicKey) return;
    await navigator.clipboard.writeText(site.pgpPublicKey);
    setKeyCopied(true);
    window.setTimeout(() => setKeyCopied(false), 2000);
  }

  return (
    <>
      <aside className="flex h-full w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] sm:w-[clamp(16rem,24vw,22rem)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <p className="text-sm font-semibold">Profile</p>
          <button
            type="button"
            onClick={onClose}
            title="Hide profile"
            aria-label="Hide admin profile"
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <PanelLeftClose size={18} aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="text-center">
            {site.avatarUrl ? (
              <img
                src={site.avatarUrl}
                alt={site.displayName}
                className="mx-auto h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <DefaultAvatar name={site.displayName} className="mx-auto h-24 w-24 text-3xl" />
            )}
            <h2 className="mt-3 text-lg font-semibold">{site.displayName}</h2>
            {site.bio ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]">{site.bio}</p>
            ) : null}
          </div>

          {site.contactLinks.length > 0 && (
            <section className="mt-6 border-t border-[var(--border)] pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Links</h3>
              <div className="mt-2 space-y-1">
                {site.contactLinks.map((link) => (
                  <a
                    key={`${link.label}:${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-[var(--link-fg)] hover:bg-[var(--surface-muted)]"
                  >
                    <span className="min-w-0 truncate">{link.label}</span>
                    <ExternalLink size={14} className="shrink-0" aria-hidden />
                  </a>
                ))}
              </div>
            </section>
          )}

          {site.profileMedia.length > 0 && (
            <section className="mt-6 border-t border-[var(--border)] pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Media</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {site.profileMedia.map((media, index) => (
                  <ProfileMediaTile
                    key={media.id}
                    media={media}
                    alt={`${site.displayName} profile ${media.kind} ${index + 1}`}
                    className="aspect-square w-full rounded-xl"
                    onImageOpen={setOpenImage}
                  />
                ))}
              </div>
            </section>
          )}

          {site.pgpPublicKey && (
            <section className="mt-6 border-t border-[var(--border)] pt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Public key</h3>
                <button
                  type="button"
                  onClick={() => void copyPublicKey()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--link-fg)] hover:bg-[var(--surface-muted)]"
                >
                  {keyCopied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                  {keyCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[var(--surface-muted)] p-3 font-mono text-[10px] leading-relaxed text-[var(--text-muted)]">
                {site.pgpPublicKey}
              </pre>
            </section>
          )}
        </div>
      </aside>
      {openImage && (
        <ImageLightbox url={openImage.url} filename={openImage.filename} onClose={() => setOpenImage(null)} />
      )}
    </>
  );
}
