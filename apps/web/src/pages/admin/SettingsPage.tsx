import { useEffect, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import type { SiteSettingsDto } from "@anonchat/shared";
import {
  getSettings,
  updateSettings,
  uploadAvatar,
  importGravatarAvatar,
  beginTotpSetup,
  verifyTotpSetup,
  disableTotp,
  subscribeAdminPush,
  unsubscribeAdminPush,
} from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useAdminNotifications } from "../../hooks/useAdminNotifications.js";
import { useSite } from "../../context/SiteContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { getExistingPushSubscription, subscribeToPush, unsubscribeFromPush } from "../../push/webPush.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import { ThemePicker } from "../../components/common/ThemePicker.js";
import { AvatarCropper } from "../../components/common/AvatarCropper.js";
import { DefaultAvatar } from "../../components/common/DefaultAvatar.js";

export default function SettingsPage({ view = "system" }: { view?: "profile" | "system" }) {
  const { admin, refreshAdmin } = useAdminSession();
  const { isSoundEnabled, setSoundEnabled, requestPermission } = useAdminNotifications();
  const { site } = useSite();
  const { theme: currentTheme, setTheme: applyTheme } = useTheme();
  const [soundOn, setSoundOn] = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [settings, setSettings] = useState<SiteSettingsDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [contactLinks, setContactLinks] = useState<{ label: string; url: string }[]>([]);
  const [pgpPublicKey, setPgpPublicKey] = useState("");
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("");
  const [presenceEnabled, setPresenceEnabled] = useState(true);
  const [theme, setThemeState] = useState(currentTheme);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [gravatarOpen, setGravatarOpen] = useState(false);
  const [gravatarEmail, setGravatarEmail] = useState("");
  const [gravatarBusy, setGravatarBusy] = useState(false);
  const [gravatarError, setGravatarError] = useState<string | null>(null);
  const [digestEmail, setDigestEmail] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestInterval, setDigestInterval] = useState(15);
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const [insightsRetentionDays, setInsightsRetentionDays] = useState(30);
  const [insightsSaving, setInsightsSaving] = useState(false);
  const [insightsSaved, setInsightsSaved] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      setDisplayName(s.displayName);
      setBio(s.bio);
      setWelcomeMessage(s.welcomeMessage);
      setContactLinks(s.contactLinks);
      setPgpPublicKey(s.pgpPublicKey ?? "");
      setPrivacyPolicyUrl(s.privacyPolicyUrl ?? "");
      setPresenceEnabled(s.presenceEnabled);
      setThemeState(s.theme);
      setDigestEmail(s.adminNotificationEmail ?? "");
      setDigestEnabled(s.adminEmailDigestEnabled);
      setDigestInterval(s.adminEmailDigestIntervalMinutes);
      setPushEnabled(s.adminPushEnabled);
      setInsightsEnabled(s.visitorInsightsEnabled);
      setInsightsRetentionDays(s.visitorInsightsRetentionDays);
    });
    setSoundOn(isSoundEnabled());
    if ("Notification" in window) setNotifPermission(Notification.permission);
    else setNotifPermission("unsupported");
    void getExistingPushSubscription().then((sub) => setPushSubscribed(sub !== null));
  }, [isSoundEnabled]);

  if (!settings) return <FullScreenLoader />;

  async function handleThemeChange(id: string) {
    setThemeState(id);
    setThemeSaving(true);
    setThemeSaved(false);
    try {
      // Apply locally immediately for instant feedback.
      applyTheme(id);
      // Persist to the server.
      const updated = await updateSettings({ theme: id });
      setSettings(updated);
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 2000);
    } catch {
      // Revert on failure.
      applyTheme(currentTheme);
      setThemeState(currentTheme);
    } finally {
      setThemeSaving(false);
    }
  }

  async function handleEnableNotifications() {
    const result = await requestPermission();
    setNotifPermission(result);
  }

  function handleSoundToggle(enabled: boolean) {
    setSoundOn(enabled);
    setSoundEnabled(enabled);
  }

  async function handleSaveProfile() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings({
        displayName,
        bio,
        contactLinks,
        pgpPublicKey,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSystem() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings({ welcomeMessage, privacyPolicyUrl, presenceEnabled });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDigest() {
    setDigestSaving(true);
    setDigestSaved(false);
    try {
      const updated = await updateSettings({
        adminNotificationEmail: digestEmail,
        adminEmailDigestEnabled: digestEnabled,
        adminEmailDigestIntervalMinutes: digestInterval,
      });
      setSettings(updated);
      setDigestSaved(true);
      setTimeout(() => setDigestSaved(false), 2000);
    } finally {
      setDigestSaving(false);
    }
  }

  async function handleSubscribePush() {
    if (!site?.vapidPublicKey) return;
    setPushBusy(true);
    setPushError(null);
    try {
      const subscription = await subscribeToPush(site.vapidPublicKey);
      if (!subscription) {
        setPushError("Push permission wasn't granted.");
        return;
      }
      await subscribeAdminPush(subscription);
      setPushSubscribed(true);
    } catch {
      setPushError("Couldn't enable push notifications. Please try again.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleUnsubscribePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      const existing = await getExistingPushSubscription();
      if (existing) {
        const result = await unsubscribeAdminPush(existing.endpoint);
        if (result.unsubscribeBrowser) await unsubscribeFromPush();
      }
      setPushSubscribed(false);
    } catch {
      setPushError("Couldn't disable push notifications. Please try again.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handlePushEnabledToggle(enabled: boolean) {
    setPushEnabled(enabled);
    const updated = await updateSettings({ adminPushEnabled: enabled });
    setSettings(updated);
  }

  async function handleSaveVisitorInsights() {
    setInsightsSaving(true);
    setInsightsSaved(false);
    try {
      const updated = await updateSettings({
        visitorInsightsEnabled: insightsEnabled,
        visitorInsightsRetentionDays: insightsRetentionDays,
      });
      setSettings(updated);
      setInsightsSaved(true);
      setTimeout(() => setInsightsSaved(false), 2000);
    } finally {
      setInsightsSaving(false);
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingAvatarFile(file);
  }

  async function handleAvatarCropped(blob: Blob) {
    setPendingAvatarFile(null);
    setAvatarUploading(true);
    try {
      const updated = await uploadAvatar(blob);
      setSettings(updated);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleImportGravatar(e: React.FormEvent) {
    e.preventDefault();
    setGravatarBusy(true);
    setGravatarError(null);
    try {
      const updated = await importGravatarAvatar(gravatarEmail.trim());
      setSettings(updated);
      setGravatarOpen(false);
      setGravatarEmail("");
    } catch (err) {
      setGravatarError(err instanceof ApiError ? err.message : "Could not import that Gravatar.");
    } finally {
      setGravatarBusy(false);
    }
  }

  async function handleEnableTotp() {
    const setup = await beginTotpSetup();
    setTotpSetup(setup);
  }

  async function handleVerifyTotp() {
    setTotpError(null);
    try {
      await verifyTotpSetup(totpCode);
      setTotpSetup(null);
      setTotpCode("");
      await refreshAdmin();
    } catch {
      setTotpError("Invalid code. Please try again.");
    }
  }

  async function handleDisableTotp() {
    if (!confirm("Disable two-factor authentication?")) return;
    await disableTotp();
    await refreshAdmin();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-1 text-xl font-semibold">{view === "profile" ? "Profile" : "System settings"}</h1>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          {view === "profile"
            ? "Manage the identity and public information visitors see."
            : "Configure messaging, appearance, notifications, privacy, and account security."}
        </p>

        {view === "profile" && (
        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Profile</h2>
          <div className="mb-3 flex items-center gap-3">
            {settings.avatarUrl ? (
              <img src={settings.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <DefaultAvatar name={displayName || "Site Owner"} className="h-14 w-14 text-lg" />
            )}
            <div className="flex flex-col items-start gap-1">
              <label
                className={clsx(
                  "text-sm text-[var(--link-fg)]",
                  avatarUploading ? "pointer-events-none opacity-50" : "cursor-pointer",
                )}
              >
                {avatarUploading ? "Uploading…" : "Change avatar"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={avatarUploading}
                  onChange={handleAvatarChange}
                />
              </label>
              <button
                type="button"
                onClick={() => setGravatarOpen((v) => !v)}
                className="text-sm text-[var(--link-fg)] hover:underline"
              >
                {gravatarOpen ? "Cancel Gravatar import" : "Import from Gravatar"}
              </button>
            </div>
          </div>
          {gravatarOpen && (
            <form
              onSubmit={handleImportGravatar}
              className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--border)] p-3"
            >
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  Gravatar email
                  <input
                    type="email"
                    required
                    autoFocus
                    value={gravatarEmail}
                    onChange={(e) => setGravatarEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Only the profile picture is imported - never your Gravatar name or bio.
                </p>
                {gravatarError && <p className="mt-1 text-xs text-[var(--danger-fg)]">{gravatarError}</p>}
              </div>
              <button
                type="submit"
                disabled={gravatarBusy}
                className="mt-5 rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                {gravatarBusy ? "Importing…" : "Import"}
              </button>
            </form>
          )}
          {pendingAvatarFile && (
            <AvatarCropper
              file={pendingAvatarFile}
              onCancel={() => setPendingAvatarFile(null)}
              onCropped={(blob) => void handleAvatarCropped(blob)}
            />
          )}
          <label className="mb-3 block text-sm font-medium">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="mb-3 block text-sm font-medium">
            Bio
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="mb-3 block text-sm font-medium">
            PGP public key
            <textarea
              rows={3}
              value={pgpPublicKey}
              onChange={(e) => setPgpPublicKey(e.target.value)}
              placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
              className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-xs"
            />
          </label>
          <p className="mb-2 text-sm font-medium">Contact links</p>
          {contactLinks.map((link, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input
                value={link.label}
                onChange={(e) =>
                  setContactLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, label: e.target.value } : l)))
                }
                placeholder="Label"
                className="w-1/3 rounded-lg border border-[var(--border-strong)] bg-transparent px-2 py-1.5 text-sm"
              />
              <input
                value={link.url}
                onChange={(e) =>
                  setContactLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))
                }
                placeholder="https://…"
                className="flex-1 rounded-lg border border-[var(--border-strong)] bg-transparent px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setContactLinks((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove link"
                className="px-2 text-[var(--danger-fg)]"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setContactLinks((prev) => [...prev, { label: "", url: "" }])}
            className="block text-xs text-[var(--link-fg)]"
          >
            + Add link
          </button>

          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={saving}
              className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
            </button>
          </div>
        </section>
        )}

        {view === "system" && (
          <>
        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-1 text-sm font-semibold">Messaging & public experience</h2>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Control what visitors see before and during a conversation.
          </p>
          <label className="mb-4 block text-sm font-medium">
            First-contact welcome message
            <textarea
              rows={4}
              maxLength={4000}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Welcome! Send a message below to start an anonymous, end-to-end encrypted conversation."
              className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">
              Shown after a visitor authenticates and before their first message. Markdown is supported.
            </span>
          </label>
          <label className="mb-4 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={presenceEnabled}
              onChange={(e) => setPresenceEnabled(e.target.checked)}
              className="accent-[var(--color-accent-500)]"
            />
            Show online status to visitors
          </label>
          <label className="mb-4 block text-sm font-medium">
            Privacy policy URL
            <input
              type="url"
              value={privacyPolicyUrl}
              onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
              placeholder="https://example.com/privacy"
              className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">
              Appears on the public landing page and inside chat.
            </span>
          </label>
          <button
            type="button"
            onClick={handleSaveSystem}
            disabled={saving}
            className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved!" : "Save messaging settings"}
          </button>
        </section>

        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Theme</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Changes apply instantly for both you and your visitors.
          </p>
          <ThemePicker value={theme} onChange={handleThemeChange} />
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {themeSaving ? "Saving…" : themeSaved ? "Theme saved!" : ""}
          </p>
        </section>

        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Notifications</h2>
          <label className="mb-3 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => handleSoundToggle(e.target.checked)}
              className="accent-[var(--color-accent-500)]"
            />
            Play a sound for new messages
          </label>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-muted)]">Browser notifications</span>
            {notifPermission === "granted" ? (
              <span className="text-[var(--text-muted)]">Enabled</span>
            ) : notifPermission === "unsupported" ? (
              <span className="text-[var(--text-muted)]">Not supported in this browser</span>
            ) : notifPermission === "denied" ? (
              <span className="text-[var(--text-muted)]">Blocked - enable in browser settings</span>
            ) : (
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
              >
                Enable
              </button>
            )}
          </div>
        </section>

        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Push notifications</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            An instant notification for each new message, even when this tab (or browser) is closed - unlike the email
            digest below, which batches instead of firing per-message.
          </p>
          {!settings.pushNotificationsAvailable ? (
            <p className="mb-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Not available yet - this server has no VAPID_* keys configured (see .env.example).
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">This device</span>
                <button
                  type="button"
                  onClick={pushSubscribed ? handleUnsubscribePush : handleSubscribePush}
                  disabled={pushBusy}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {pushBusy ? "Working…" : pushSubscribed ? "Disable" : "Enable"}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => void handlePushEnabledToggle(e.target.checked)}
                  className="accent-[var(--color-accent-500)]"
                />
                Send push notifications
              </label>
              {pushError && <p className="mt-2 text-xs text-[var(--danger-fg)]">{pushError}</p>}
            </>
          )}
        </section>

        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Email digest</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            A periodic summary email ("N new messages") instead of one email per message - message content is end-to-end
            encrypted, so it can never be included.
          </p>
          {!settings.emailNotificationsAvailable && (
            <p className="mb-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Not available yet - this server has no EMAIL_DRIVER configured (see .env.example).
            </p>
          )}
          <label className="mb-3 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={digestEnabled}
              disabled={!settings.emailNotificationsAvailable}
              onChange={(e) => setDigestEnabled(e.target.checked)}
              className="accent-[var(--color-accent-500)]"
            />
            Email me a digest of new messages
          </label>
          <label className="mb-3 block text-sm font-medium">
            Notification email
            <input
              type="email"
              value={digestEmail}
              disabled={!settings.emailNotificationsAvailable}
              onChange={(e) => setDigestEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="mb-3 block text-sm font-medium">
            Digest every
            <span className="ml-1 inline-flex items-center gap-1.5 align-middle">
              <input
                type="number"
                min={1}
                max={1440}
                value={digestInterval}
                disabled={!settings.emailNotificationsAvailable}
                onChange={(e) => setDigestInterval(Number(e.target.value))}
                className="w-20 rounded-lg border border-[var(--border-strong)] bg-transparent px-2 py-1 text-sm disabled:opacity-50"
              />
              minutes, at most
            </span>
          </label>
          <button
            type="button"
            onClick={handleSaveDigest}
            disabled={digestSaving || !settings.emailNotificationsAvailable}
            className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            {digestSaving ? "Saving…" : digestSaved ? "Saved!" : "Save"}
          </button>
        </section>

        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-2 text-sm font-semibold">Optional visitor insights</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Ask visitors to explicitly share limited device and network diagnostics. This is off by default and never
            includes exact GPS, fingerprinting, browsing history, or decrypted message content.
          </p>
          <label className="mb-3 flex items-start gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={insightsEnabled}
              onChange={(e) => setInsightsEnabled(e.target.checked)}
              className="mt-0.5 accent-[var(--color-accent-500)]"
            />
            <span>
              Ask visitors for consent
              <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
                Turning this off deletes every retained visitor-insight record immediately.
              </span>
            </span>
          </label>
          <label className="mb-3 block text-sm font-medium">
            Delete shared diagnostics after
            <span className="ml-2 inline-flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={365}
                value={insightsRetentionDays}
                onChange={(e) => setInsightsRetentionDays(Number(e.target.value))}
                className="w-20 rounded-lg border border-[var(--border-strong)] bg-transparent px-2 py-1 text-sm"
              />
              days
            </span>
          </label>
          <div className="mb-3 rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-muted)]">
            <p>
              IP storage:{" "}
              {settings.visitorIpStorageAvailable
                ? "available when a visitor consents"
                : "disabled by the server operator"}
            </p>
            <p className="mt-1">
              Coarse IP geolocation:{" "}
              {settings.visitorGeolocationAvailable
                ? "available when a visitor consents"
                : "disabled by the server operator"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveVisitorInsights()}
            disabled={insightsSaving}
            className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            {insightsSaving ? "Saving…" : insightsSaved ? "Saved!" : "Save privacy settings"}
          </button>
        </section>

        <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Two-factor authentication</h2>
          {admin?.totpEnabled ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">Enabled</p>
              <button
                type="button"
                onClick={handleDisableTotp}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Disable
              </button>
            </div>
          ) : totpSetup ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                Scan this in your authenticator app, or enter the secret manually:
              </p>
              <p className="select-all break-all rounded-lg bg-[var(--surface-muted)] p-2 font-mono text-xs">
                {totpSetup.secret}
              </p>
              <input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
              />
              {totpError && <p className="text-sm text-[var(--danger-fg)]">{totpError}</p>}
              <button
                type="button"
                onClick={handleVerifyTotp}
                className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
              >
                Verify and enable
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleEnableTotp}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Enable 2FA
            </button>
          )}
        </section>
          </>
        )}
      </div>
    </div>
  );
}
