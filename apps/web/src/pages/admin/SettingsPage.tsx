import { useEffect, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import type { SiteSettingsDto } from "@anonchat/shared";
import {
  getSettings,
  updateSettings,
  uploadAvatar,
  beginTotpSetup,
  verifyTotpSetup,
  disableTotp,
} from "../../api/admin.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useAdminNotifications } from "../../hooks/useAdminNotifications.js";
import { useTheme } from "../../context/ThemeContext.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import { ThemePicker } from "../../components/common/ThemePicker.js";
import { AvatarCropper } from "../../components/common/AvatarCropper.js";

export default function SettingsPage() {
  const { admin, refreshAdmin } = useAdminSession();
  const { isSoundEnabled, setSoundEnabled, requestPermission } = useAdminNotifications();
  const { theme: currentTheme, setTheme: applyTheme } = useTheme();
  const [soundOn, setSoundOn] = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [settings, setSettings] = useState<SiteSettingsDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [contactLinks, setContactLinks] = useState<{ label: string; url: string }[]>([]);
  const [pgpPublicKey, setPgpPublicKey] = useState("");
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

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setDisplayName(s.displayName);
      setBio(s.bio);
      setContactLinks(s.contactLinks);
      setPgpPublicKey(s.pgpPublicKey ?? "");
      setPresenceEnabled(s.presenceEnabled);
      setThemeState(s.theme);
    });
    setSoundOn(isSoundEnabled());
    if ("Notification" in window) setNotifPermission(Notification.permission);
    else setNotifPermission("unsupported");
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

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings({ displayName, bio, contactLinks, pgpPublicKey, presenceEnabled });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
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
    <div className="mx-auto max-w-2xl overflow-y-auto p-6">
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>

      <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Profile</h2>
        <div className="mb-3 flex items-center gap-3">
          {settings.avatarUrl && (
            <img src={settings.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          )}
          <label
            className={clsx(
              "text-sm text-[var(--color-accent-600)]",
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
        </div>
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
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="mb-3 block text-sm font-medium">
          Bio
          <textarea
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="mb-3 block text-sm font-medium">
          PGP public key
          <textarea
            rows={3}
            value={pgpPublicKey}
            onChange={(e) => setPgpPublicKey(e.target.value)}
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="mb-3 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={presenceEnabled} onChange={(e) => setPresenceEnabled(e.target.checked)} />
          Show online status to visitors
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
              className="w-1/3 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
            />
            <input
              value={link.url}
              onChange={(e) =>
                setContactLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))
              }
              placeholder="https://…"
              className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
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
          className="block text-xs text-[var(--color-accent-600)]"
        >
          + Add link
        </button>

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Theme</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Changes apply instantly for both you and your visitors.</p>
        <ThemePicker value={theme} onChange={handleThemeChange} />
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {themeSaving ? "Saving…" : themeSaved ? "Theme saved!" : ""}
        </p>
      </section>

      <section className="mb-8 rounded-xl border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Notifications</h2>
        <label className="mb-3 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={soundOn} onChange={(e) => handleSoundToggle(e.target.checked)} />
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

      <section className="rounded-xl border border-[var(--border)] p-4">
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
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            {totpError && <p className="text-sm text-[var(--danger-fg)]">{totpError}</p>}
            <button
              type="button"
              onClick={handleVerifyTotp}
              className="rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
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
    </div>
  );
}
