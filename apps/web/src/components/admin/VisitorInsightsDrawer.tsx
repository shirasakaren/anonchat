import { useEffect, useRef, useState, type ReactNode } from "react";
import { Languages, MapPin, Monitor, ShieldCheck, Smartphone, Tablet, Wifi, X } from "lucide-react";
import type { VisitorInsightDto } from "@anonchat/shared";
import { getConversationVisitorInsight } from "../../api/admin.js";

interface Props {
  conversationId: string;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b border-[var(--border)] py-2 last:border-0">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-xs">{value}</dd>
    </div>
  );
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone size={17} aria-hidden />;
  if (type === "tablet") return <Tablet size={17} aria-hidden />;
  return <Monitor size={17} aria-hidden />;
}

function CoarseLocationMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const x = longitude + 180;
  const y = 90 - latitude;
  return (
    <svg
      viewBox="0 0 360 180"
      role="img"
      aria-label={`Approximate IP location at latitude ${latitude.toFixed(2)}, longitude ${longitude.toFixed(2)}`}
      className="h-40 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]"
    >
      <g fill="none" stroke="var(--border-strong)" strokeWidth="0.7" opacity="0.7">
        {[60, 120, 180, 240, 300].map((line) => (
          <path key={`v${line}`} d={`M${line} 0V180`} />
        ))}
        {[45, 90, 135].map((line) => (
          <path key={`h${line}`} d={`M0 ${line}H360`} />
        ))}
      </g>
      <g fill="var(--surface-raised)" stroke="var(--border-strong)" strokeWidth="1.2">
        <path d="M18 35 48 18 88 23 115 48 98 70 72 67 57 87 35 73Z" />
        <path d="M92 93 117 101 126 132 110 164 94 131Z" />
        <path d="M145 31 177 20 206 35 222 28 254 38 281 61 266 82 231 78 215 63 192 72 171 59 150 62Z" />
        <path d="M170 74 206 74 222 103 205 149 181 128 163 96Z" />
        <path d="M274 113 309 105 330 124 317 149 286 145Z" />
      </g>
      <circle cx={x} cy={y} r="7" fill="var(--color-accent-500)" opacity="0.22" />
      <circle cx={x} cy={y} r="3" fill="var(--color-accent-500)" />
    </svg>
  );
}

export function VisitorInsightsDrawer({ conversationId, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [insight, setInsight] = useState<VisitorInsightDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    void getConversationVisitorInsight(conversationId)
      .then((response) => setInsight(response.insight))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [conversationId]);

  const deviceLabel = [insight?.browserName, insight?.browserVersion].filter(Boolean).join(" ");
  const osLabel = [insight?.osName, insight?.osVersion].filter(Boolean).join(" ");
  const locationLabel = [insight?.geoCity, insight?.geoRegion, insight?.geoCountry].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-40 bg-black/35" onMouseDown={onClose} role="presentation">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="visitor-insights-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-[var(--border)] p-4">
          <div>
            <h2 id="visitor-insights-title" className="text-sm font-semibold">
              Visitor insights
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Consented diagnostics reported by this visitor's browser.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close visitor insights"
            className="rounded-lg p-1.5 hover:bg-[var(--surface-muted)]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading insights…</p>
          ) : error ? (
            <p className="text-sm text-[var(--danger-fg)]">Couldn't load visitor insights.</p>
          ) : !insight ? (
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
              This visitor has not shared diagnostics, the feature is disabled, or their retained data has expired.
            </div>
          ) : (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <DeviceIcon type={insight.deviceType} /> Device
                </h3>
                <dl>
                  <Row label="Device class" value={insight.deviceType} />
                  <Row label="Browser" value={deviceLabel} />
                  <Row label="Operating system" value={osLabel} />
                  <Row label="Platform" value={insight.platform} />
                  <Row
                    label="Screen"
                    value={
                      insight.screenWidth && insight.screenHeight
                        ? `${insight.screenWidth} × ${insight.screenHeight} px`
                        : null
                    }
                  />
                  <Row
                    label="Viewport"
                    value={
                      insight.viewportWidth && insight.viewportHeight
                        ? `${insight.viewportWidth} × ${insight.viewportHeight} px`
                        : null
                    }
                  />
                  <Row label="Pixel ratio" value={insight.pixelRatio} />
                  <Row label="Touch points" value={insight.touchPoints} />
                  <Row label="CPU threads" value={insight.hardwareConcurrency} />
                  <Row label="Device memory" value={insight.deviceMemoryGb ? `${insight.deviceMemoryGb} GB` : null} />
                  <Row label="User agent" value={insight.userAgent} />
                </dl>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Languages size={17} aria-hidden /> Locale
                </h3>
                <dl>
                  <Row label="Language" value={insight.language} />
                  <Row label="Languages" value={insight.languages.join(", ")} />
                  <Row label="Timezone" value={insight.timezone} />
                  <Row label="Referrer origin" value={insight.referrerOrigin} />
                </dl>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Wifi size={17} aria-hidden /> Network
                </h3>
                <dl>
                  <Row label="IP address" value={insight.ipAddress} />
                  <Row label="Connection" value={insight.connectionEffectiveType ?? insight.connectionType} />
                  <Row
                    label="Downlink"
                    value={insight.connectionDownlinkMbps !== null ? `${insight.connectionDownlinkMbps} Mbps` : null}
                  />
                  <Row
                    label="Estimated RTT"
                    value={insight.connectionRttMs !== null ? `${insight.connectionRttMs} ms` : null}
                  />
                  <Row
                    label="Data saver"
                    value={insight.connectionSaveData === null ? null : insight.connectionSaveData ? "On" : "Off"}
                  />
                  <Row label="ASN" value={insight.networkAsn ? `AS${insight.networkAsn}` : null} />
                  <Row label="Organization" value={insight.networkOrg} />
                  <Row label="ISP" value={insight.networkIsp} />
                </dl>
              </section>

              {(locationLabel || (insight.geoLatitude !== null && insight.geoLongitude !== null)) && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MapPin size={17} aria-hidden /> Approximate IP location
                  </h3>
                  {insight.geoLatitude !== null && insight.geoLongitude !== null && (
                    <CoarseLocationMap latitude={insight.geoLatitude} longitude={insight.geoLongitude} />
                  )}
                  <dl className="mt-2">
                    <Row label="Location" value={locationLabel} />
                    <Row label="Postal code" value={insight.geoPostalCode} />
                    <Row label="Geo timezone" value={insight.geoTimezone} />
                    <Row label="Country code" value={insight.geoCountryCode} />
                  </dl>
                </section>
              )}

              <section className="rounded-xl bg-[var(--surface-muted)] p-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold">
                  <ShieldCheck size={16} aria-hidden /> Privacy and retention
                </h3>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Shared {new Date(insight.consentedAt).toLocaleString()}; automatically expires{" "}
                  {new Date(insight.expiresAt).toLocaleString()}. Values can be incomplete or inaccurate and must not be
                  treated as identity proof.
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
