import { useEffect, useState, type DragEvent } from "react";
import { useBlocker } from "react-router-dom";
import clsx from "clsx";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import type { ProfileMediaDto, SiteSettingsDto } from "@anonchat/shared";
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
  uploadProfileMedia,
  deleteProfileMedia,
  reorderProfileMedia,
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
import { useToast } from "../../context/ToastContext.js";
import { ProfileMediaTile } from "../../components/common/ProfileMediaTile.js";
import { ImageLightbox } from "../../components/chat/preview/ImageLightbox.js";
import { VideoLightbox } from "../../components/chat/preview/VideoLightbox.js";
import { UnsavedMediaOrderModal } from "../../components/admin/UnsavedMediaOrderModal.js";
import { mediaOrdersEqual, moveMediaOrder, reconcileMediaOrder } from "./profileMediaOrder.js";

function NumberControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
        />
        {suffix && <span className="shrink-0 text-xs font-normal text-[var(--text-muted)]">{suffix}</span>}
      </span>
    </label>
  );
}

export default function SettingsPage({ view = "system" }: { view?: "profile" | "system" }) {
  const { showToast } = useToast();
  const { admin, refreshAdmin } = useAdminSession();
  const { isSoundEnabled, setSoundEnabled, requestPermission } = useAdminNotifications();
  const { site, refresh: refreshSite } = useSite();
  const { theme: currentTheme, setTheme: applyTheme } = useTheme();
  const [soundOn, setSoundOn] = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [settings, setSettings] = useState<SiteSettingsDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [siteTitle, setSiteTitle] = useState("Anonchat");
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
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [openMediaImage, setOpenMediaImage] = useState<ProfileMediaDto | null>(null);
  const [openMediaVideo, setOpenMediaVideo] = useState<ProfileMediaDto | null>(null);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [mediaDropTargetId, setMediaDropTargetId] = useState<string | null>(null);
  const [profileMediaOrder, setProfileMediaOrder] = useState<string[]>([]);
  const [savedProfileMediaOrder, setSavedProfileMediaOrder] = useState<string[]>([]);
  // Media added this session: shown as local previews in the grid and
  // uploaded only when the admin clicks Save changes - adding no longer
  // saves-and-refreshes by itself.
  const [pendingMediaFiles, setPendingMediaFiles] = useState<
    { id: string; file: File; previewUrl: string; kind: "image" | "video" }[]
  >([]);
  const [digestEmail, setDigestEmail] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestInterval, setDigestInterval] = useState(15);
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [giphyApiKey, setGiphyApiKey] = useState("");
  const [klipyApiKey, setKlipyApiKey] = useState("");
  const [gifKeysSaving, setGifKeysSaving] = useState(false);
  const [gifKeysSaved, setGifKeysSaved] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const [insightsRetentionDays, setInsightsRetentionDays] = useState(30);
  const [storeIpAddresses, setStoreIpAddresses] = useState(false);
  const [visitorGeolocationEnabled, setVisitorGeolocationEnabled] = useState(false);
  const [insightsSaving, setInsightsSaving] = useState(false);
  const [insightsSaved, setInsightsSaved] = useState(false);
  const [runtime, setRuntime] = useState({
    maxMessageLength: 100_000,
    maxAttachmentsPerMessage: 5,
    messageEditWindowMinutes: 15,
    maxAttachmentSizeMb: 100,
    maxImageAttachmentSizeMb: 20,
    maxVideoAttachmentSizeMb: 100,
    maxAudioAttachmentSizeMb: 30,
    maxDocumentAttachmentSizeMb: 50,
    maxOtherAttachmentSizeMb: 25,
    rateLimitMessagesPerMinute: 20,
    rateLimitRegistrationsPerHour: 10,
    rateLimitLinkPreviewsPerMinute: 20,
    linkPreviewsEnabled: true,
    adminDigestMinIntervalMinutes: 5,
    replyEmailMinIntervalMinutes: 2,
  });
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeSaved, setRuntimeSaved] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => {
      const mediaIds = s.profileMedia.map(({ id }) => id);
      setSettings(s);
      setProfileMediaOrder(mediaIds);
      setSavedProfileMediaOrder(mediaIds);
      setDisplayName(s.displayName);
      setSiteTitle(s.siteTitle);
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
      setGiphyApiKey(s.giphyApiKey ?? "");
      setKlipyApiKey(s.klipyApiKey ?? "");
      setInsightsEnabled(s.visitorInsightsEnabled);
      setInsightsRetentionDays(s.visitorInsightsRetentionDays);
      setStoreIpAddresses(s.storeIpAddresses);
      setVisitorGeolocationEnabled(s.visitorGeolocationEnabled);
      setRuntime({
        maxMessageLength: s.limits.maxMessageLength,
        maxAttachmentsPerMessage: s.limits.maxAttachmentsPerMessage,
        messageEditWindowMinutes: s.limits.messageEditWindowMinutes,
        maxAttachmentSizeMb: s.limits.attachmentSize.globalMb,
        maxImageAttachmentSizeMb: s.limits.attachmentSize.imageMb,
        maxVideoAttachmentSizeMb: s.limits.attachmentSize.videoMb,
        maxAudioAttachmentSizeMb: s.limits.attachmentSize.audioMb,
        maxDocumentAttachmentSizeMb: s.limits.attachmentSize.documentMb,
        maxOtherAttachmentSizeMb: s.limits.attachmentSize.otherMb,
        rateLimitMessagesPerMinute: s.rateLimitMessagesPerMinute,
        rateLimitRegistrationsPerHour: s.rateLimitRegistrationsPerHour,
        rateLimitLinkPreviewsPerMinute: s.rateLimitLinkPreviewsPerMinute,
        linkPreviewsEnabled: s.linkPreviewsEnabled,
        adminDigestMinIntervalMinutes: s.adminDigestMinIntervalMinutes,
        replyEmailMinIntervalMinutes: s.replyEmailMinIntervalMinutes,
      });
    });
    setSoundOn(isSoundEnabled());
    if ("Notification" in window) setNotifPermission(Notification.permission);
    else setNotifPermission("unsupported");
    void getExistingPushSubscription().then((sub) => setPushSubscribed(sub !== null));
  }, [isSoundEnabled]);

  const mediaOrderDirty = !mediaOrdersEqual(profileMediaOrder, savedProfileMediaOrder);

  // Revoke the local preview object URLs this page created.
  useEffect(() => {
    const current = pendingMediaFiles;
    return () => {
      for (const pending of current) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pendingMediaFiles]);
  const navigationBlocker = useBlocker(view === "profile" && (mediaOrderDirty || pendingMediaFiles.length > 0));

  useEffect(() => {
    if (!mediaOrderDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [mediaOrderDirty]);

  if (!settings) return <FullScreenLoader />;

  function notifyError(title: string, error: unknown) {
    showToast({
      title,
      message: error instanceof Error ? error.message : "Please try again.",
    });
  }

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
    } catch (error) {
      // Revert on failure.
      applyTheme(currentTheme);
      setThemeState(currentTheme);
      notifyError("Theme could not be saved", error);
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

  async function handleSaveProfile(): Promise<boolean> {
    setSaving(true);
    setSaved(false);
    try {
      let updated = await updateSettings({
        displayName,
        bio,
        contactLinks,
        pgpPublicKey,
      });
      // Upload any newly added media now - this is the explicit save the
      // grid has been previewing for. Keep partial progress on failure so
      // already-uploaded files aren't re-queued on the next attempt.
      const previousIds = new Set(savedProfileMediaOrder);
      let uploadedCount = 0;
      try {
        for (const pending of pendingMediaFiles) {
          updated = await uploadProfileMedia(pending.file);
          uploadedCount += 1;
        }
      } catch (error) {
        setPendingMediaFiles((current) => {
          const drop = current.slice(0, uploadedCount);
          for (const pending of drop) URL.revokeObjectURL(pending.previewUrl);
          return current.slice(uploadedCount);
        });
        notifyError("Some profile media could not be uploaded", error);
        return false;
      }
      const uploadedIds = updated.profileMedia.map(({ id }) => id).filter((id) => !previousIds.has(id));
      if (mediaOrderDirty) {
        updated = await reorderProfileMedia([...profileMediaOrder, ...uploadedIds]);
      }
      for (const pending of pendingMediaFiles) URL.revokeObjectURL(pending.previewUrl);
      setPendingMediaFiles([]);
      const savedOrder = updated.profileMedia.map(({ id }) => id);
      setSettings(updated);
      setProfileMediaOrder(savedOrder);
      setSavedProfileMediaOrder(savedOrder);
      await refreshSite();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (error) {
      notifyError("Profile could not be saved", error);
      return false;
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
      await refreshSite();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      notifyError("Messaging settings could not be saved", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBranding() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings({ siteTitle });
      setSettings(updated);
      await refreshSite();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      notifyError("Branding could not be saved", error);
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
    } catch (error) {
      notifyError("Email settings could not be saved", error);
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
      showToast({ title: "Push notifications could not be enabled", message: "Please try again." });
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
      showToast({ title: "Push notifications could not be disabled", message: "Please try again." });
    } finally {
      setPushBusy(false);
    }
  }

  async function handlePushEnabledToggle(enabled: boolean) {
    const previous = pushEnabled;
    setPushEnabled(enabled);
    try {
      const updated = await updateSettings({ adminPushEnabled: enabled });
      setSettings(updated);
    } catch (error) {
      setPushEnabled(previous);
      notifyError("Push preference could not be saved", error);
    }
  }

  async function handleSaveVisitorInsights() {
    setInsightsSaving(true);
    setInsightsSaved(false);
    try {
      const updated = await updateSettings({
        visitorInsightsEnabled: insightsEnabled,
        visitorInsightsRetentionDays: insightsRetentionDays,
        storeIpAddresses,
        visitorGeolocationEnabled,
      });
      setSettings(updated);
      setInsightsSaved(true);
      setTimeout(() => setInsightsSaved(false), 2000);
    } catch (error) {
      notifyError("Privacy settings could not be saved", error);
    } finally {
      setInsightsSaving(false);
    }
  }

  async function handleSaveRuntime() {
    setRuntimeSaving(true);
    setRuntimeSaved(false);
    try {
      const updated = await updateSettings(runtime);
      setSettings(updated);
      await refreshSite();
      setRuntimeSaved(true);
      setTimeout(() => setRuntimeSaved(false), 2000);
    } catch (error) {
      notifyError("Runtime limits could not be saved", error);
    } finally {
      setRuntimeSaving(false);
    }
  }

  async function handleSaveGifKeys() {
    setGifKeysSaving(true);
    setGifKeysSaved(false);
    try {
      const updated = await updateSettings({ giphyApiKey, klipyApiKey });
      setSettings(updated);
      await refreshSite();
      setGifKeysSaved(true);
      setTimeout(() => setGifKeysSaved(false), 2000);
    } catch (error) {
      notifyError("GIF provider keys could not be saved", error);
    } finally {
      setGifKeysSaving(false);
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
      await refreshSite();
    } catch (error) {
      notifyError("Avatar upload failed", error);
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
      await refreshSite();
      setGravatarOpen(false);
      setGravatarEmail("");
    } catch (err) {
      setGravatarError(err instanceof ApiError ? err.message : "Could not import that Gravatar.");
      notifyError("Gravatar import failed", err);
    } finally {
      setGravatarBusy(false);
    }
  }

  function handleProfileMediaUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !settings || !site) return;
    setMediaError(null);
    const total = settings.profileMedia.length + pendingMediaFiles.length;
    if (total >= 8) {
      setMediaError("You can add up to 8 profile media items.");
      return;
    }
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      setMediaError("Media must be an image, animated GIF, or video (PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, OGG, MOV).");
      return;
    }
    const limitMb = isVideo ? site.limits.attachmentSize.videoMb : site.limits.attachmentSize.imageMb;
    if (file.size > limitMb * 1024 * 1024) {
      setMediaError(`The ${isVideo ? "video" : "image"} upload limit is ${limitMb} MB.`);
      return;
    }
    // Queue only: the grid shows a local preview immediately, and the file
    // reaches the server when the admin clicks Save changes - no more
    // auto-save + page refresh on every add.
    setPendingMediaFiles((current) => [
      ...current,
      {
        id: `pending-${Date.now()}-${current.length}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind: isVideo ? "video" : "image",
      },
    ]);
  }

  function removePendingMedia(id: string) {
    setPendingMediaFiles((current) => {
      const target = current.find((pending) => pending.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((pending) => pending.id !== id);
    });
  }

  async function handleProfileMediaDelete(id: string) {
    setMediaBusy(true);
    setMediaError(null);
    try {
      await deleteProfileMedia(id);
      const updated = await getSettings();
      const serverOrder = updated.profileMedia.map(({ id: mediaId }) => mediaId);
      setSettings(updated);
      setSavedProfileMediaOrder(serverOrder);
      setProfileMediaOrder((current) => reconcileMediaOrder(current, serverOrder));
      await refreshSite();
    } catch (error) {
      setMediaError(error instanceof ApiError ? error.message : "Could not remove that media file.");
      notifyError("Profile media could not be removed", error);
    } finally {
      setMediaBusy(false);
    }
  }

  function handleProfileMediaDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggedMediaId(id);
  }

  function handleProfileMediaDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedMediaId;
    setDraggedMediaId(null);
    setMediaDropTargetId(null);
    if (!sourceId) return;
    setProfileMediaOrder((current) => moveMediaOrder(current, sourceId, targetId));
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

  const mediaById = new Map(settings.profileMedia.map((media) => [media.id, media]));
  const orderedProfileMedia = profileMediaOrder.flatMap((id) => {
    const media = mediaById.get(id);
    return media ? [media] : [];
  });

  async function saveBeforeLeaving() {
    if ((await handleSaveProfile()) && navigationBlocker.state === "blocked") navigationBlocker.proceed();
  }

  function discardBeforeLeaving() {
    setProfileMediaOrder(savedProfileMediaOrder);
    if (navigationBlocker.state === "blocked") navigationBlocker.proceed();
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Profile media</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Add up to 8 images, animated GIFs, or videos. Upload limits follow System settings.
                  </p>
                </div>
                <label
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold",
                    mediaBusy || settings.profileMedia.length + pendingMediaFiles.length >= 8
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer",
                  )}
                >
                  <Plus size={14} aria-hidden />
                  {mediaBusy ? "Working…" : "Add media"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/ogg,video/quicktime"
                    disabled={mediaBusy || settings.profileMedia.length + pendingMediaFiles.length >= 8}
                    onChange={handleProfileMediaUpload}
                    className="hidden"
                  />
                </label>
              </div>
              {pendingMediaFiles.length > 0 && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  {pendingMediaFiles.length} new {pendingMediaFiles.length === 1 ? "file" : "files"} ready to
                  upload - select Save changes to publish.
                </p>
              )}
              {(orderedProfileMedia.length > 0 || pendingMediaFiles.length > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {orderedProfileMedia.map((media, index) => (
                    <div
                      key={media.id}
                      draggable={!mediaBusy}
                      title="Drag to reorder"
                      onDragStart={(event) => handleProfileMediaDragStart(event, media.id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (draggedMediaId !== media.id) setMediaDropTargetId(media.id);
                      }}
                      onDrop={(event) => handleProfileMediaDrop(event, media.id)}
                      onDragEnd={() => {
                        setDraggedMediaId(null);
                        setMediaDropTargetId(null);
                      }}
                      className={clsx(
                        "group relative aspect-[4/3] cursor-grab overflow-hidden rounded-xl active:cursor-grabbing",
                        draggedMediaId === media.id && "opacity-50",
                        mediaDropTargetId === media.id &&
                          draggedMediaId !== media.id &&
                          "ring-2 ring-[var(--color-accent-500)] ring-offset-2 ring-offset-[var(--surface)]",
                      )}
                    >
                      <ProfileMediaTile
                        media={media}
                        alt={`Profile ${media.kind} ${index + 1}`}
                        className="h-full w-full"
                        onImageOpen={setOpenMediaImage}
                        onVideoOpen={setOpenMediaVideo}
                      />
                      <span
                        className="pointer-events-none absolute left-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      >
                        <GripVertical size={15} />
                      </span>
                      <button
                        type="button"
                        disabled={mediaBusy}
                        onClick={() => void handleProfileMediaDelete(media.id)}
                        aria-label={`Remove ${media.filename}`}
                        className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white hover:bg-black disabled:opacity-50"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                  {pendingMediaFiles.map((pending) => (
                    <div key={pending.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl">
                      <ProfileMediaTile
                        media={{
                          id: pending.id,
                          kind: pending.kind === "video" ? "video" : "image",
                          mimetype: pending.file.type,
                          filename: pending.file.name,
                          sizeBytes: pending.file.size,
                          url: pending.previewUrl,
                        }}
                        alt={`New ${pending.kind} awaiting save`}
                        className="h-full w-full opacity-80"
                        onImageOpen={() => undefined}
                        onVideoOpen={() => undefined}
                      />
                      <span
                        className="pointer-events-none absolute left-2 top-2 rounded-full bg-[var(--btn-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--btn-fg)]"
                        aria-hidden
                      >
                        New
                      </span>
                      <button
                        type="button"
                        disabled={mediaBusy}
                        onClick={() => removePendingMedia(pending.id)}
                        aria-label={`Remove new file ${pending.file.name}`}
                        className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white hover:bg-black disabled:opacity-50"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {mediaOrderDirty && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning-fg)]">
                  <span>Media order changed. Select Save changes to publish it.</span>
                  <button
                    type="button"
                    onClick={() => setProfileMediaOrder(savedProfileMediaOrder)}
                    className="shrink-0 font-semibold underline"
                  >
                    Discard order
                  </button>
                </div>
              )}
              {mediaError && <p className="mt-2 text-xs text-[var(--danger-fg)]">{mediaError}</p>}
            </div>

            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving || mediaBusy}
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
              <h2 className="mb-1 text-sm font-semibold">Branding</h2>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                Set the browser tab title. The favicon always uses your profile picture and is changed from Profile.
              </p>
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] p-3">
                {settings.avatarUrl ? (
                  <img src={settings.avatarUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <DefaultAvatar name={displayName || "Site Owner"} className="h-10 w-10 rounded-lg text-sm" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{siteTitle || "Anonchat"}</p>
                  <p className="text-xs text-[var(--text-muted)]">Browser tab preview</p>
                </div>
              </div>
              <label className="mb-4 block text-sm font-medium">
                Site title
                <input
                  value={siteTitle}
                  maxLength={100}
                  onChange={(event) => setSiteTitle(event.target.value)}
                  placeholder="Anonchat"
                  className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSaveBranding()}
                disabled={saving || !siteTitle.trim()}
                className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                {saving ? "Saving…" : saved ? "Saved!" : "Save branding"}
              </button>
            </section>
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
              <h2 className="mb-1 text-sm font-semibold">Messaging and upload limits</h2>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                These settings apply immediately without a server restart. The global upload size is the final ceiling
                for every file category.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberControl
                  label="Message length"
                  value={runtime.maxMessageLength}
                  min={1_000}
                  max={100_000}
                  suffix="characters"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxMessageLength: value }))}
                />
                <NumberControl
                  label="Files per message"
                  value={runtime.maxAttachmentsPerMessage}
                  min={1}
                  max={20}
                  suffix="files"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxAttachmentsPerMessage: value }))}
                />
                <NumberControl
                  label="Message edit window"
                  value={runtime.messageEditWindowMinutes}
                  min={1}
                  max={10_080}
                  suffix="minutes"
                  onChange={(value) => setRuntime((current) => ({ ...current, messageEditWindowMinutes: value }))}
                />
                <NumberControl
                  label="Global file limit"
                  value={runtime.maxAttachmentSizeMb}
                  min={1}
                  max={250}
                  suffix="MB"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxAttachmentSizeMb: value }))}
                />
                <NumberControl
                  label="Images"
                  value={runtime.maxImageAttachmentSizeMb}
                  min={1}
                  max={250}
                  suffix="MB"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxImageAttachmentSizeMb: value }))}
                />
                <NumberControl
                  label="Videos"
                  value={runtime.maxVideoAttachmentSizeMb}
                  min={1}
                  max={250}
                  suffix="MB"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxVideoAttachmentSizeMb: value }))}
                />
                <NumberControl
                  label="Audio"
                  value={runtime.maxAudioAttachmentSizeMb}
                  min={1}
                  max={250}
                  suffix="MB"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxAudioAttachmentSizeMb: value }))}
                />
                <NumberControl
                  label="Documents and code"
                  value={runtime.maxDocumentAttachmentSizeMb}
                  min={1}
                  max={250}
                  suffix="MB"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxDocumentAttachmentSizeMb: value }))}
                />
                <NumberControl
                  label="Other files"
                  value={runtime.maxOtherAttachmentSizeMb}
                  min={1}
                  max={250}
                  suffix="MB"
                  onChange={(value) => setRuntime((current) => ({ ...current, maxOtherAttachmentSizeMb: value }))}
                />
              </div>

              <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Traffic controls
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberControl
                  label="Messages"
                  value={runtime.rateLimitMessagesPerMinute}
                  min={1}
                  max={1_000}
                  suffix="per minute"
                  onChange={(value) => setRuntime((current) => ({ ...current, rateLimitMessagesPerMinute: value }))}
                />
                <NumberControl
                  label="New identities"
                  value={runtime.rateLimitRegistrationsPerHour}
                  min={1}
                  max={10_000}
                  suffix="per hour"
                  onChange={(value) => setRuntime((current) => ({ ...current, rateLimitRegistrationsPerHour: value }))}
                />
                <NumberControl
                  label="Link previews"
                  value={runtime.rateLimitLinkPreviewsPerMinute}
                  min={1}
                  max={1_000}
                  suffix="per minute"
                  onChange={(value) => setRuntime((current) => ({ ...current, rateLimitLinkPreviewsPerMinute: value }))}
                />
                <NumberControl
                  label="Admin digest minimum"
                  value={runtime.adminDigestMinIntervalMinutes}
                  min={1}
                  max={1_440}
                  suffix="minutes"
                  onChange={(value) => setRuntime((current) => ({ ...current, adminDigestMinIntervalMinutes: value }))}
                />
                <NumberControl
                  label="Visitor reply email minimum"
                  value={runtime.replyEmailMinIntervalMinutes}
                  min={1}
                  max={1_440}
                  suffix="minutes"
                  onChange={(value) => setRuntime((current) => ({ ...current, replyEmailMinIntervalMinutes: value }))}
                />
              </div>
              <label className="my-4 flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={runtime.linkPreviewsEnabled}
                  onChange={(event) =>
                    setRuntime((current) => ({ ...current, linkPreviewsEnabled: event.target.checked }))
                  }
                  className="mt-0.5 accent-[var(--color-accent-500)]"
                />
                <span>
                  Generate rich link previews
                  <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
                    The server fetches shared URLs through its protected preview service when this is enabled.
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => void handleSaveRuntime()}
                disabled={runtimeSaving}
                className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                {runtimeSaving ? "Saving..." : runtimeSaved ? "Saved!" : "Save limits"}
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
              <h2 className="mb-1 text-sm font-semibold">GIF picker</h2>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                Add a GIPHY or KLIPY API key to enable the GIF picker in the chat composer for you and your
                visitors. Keys stay on the server - the browser only ever talks to this app.
              </p>
              <label className="mb-3 block text-sm font-medium">
                GIPHY API key
                <input
                  type="password"
                  value={giphyApiKey}
                  onChange={(event) => setGiphyApiKey(event.target.value)}
                  placeholder="Create one at developers.giphy.com"
                  className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="mb-4 block text-sm font-medium">
                KLIPY API key
                <input
                  type="password"
                  value={klipyApiKey}
                  onChange={(event) => setKlipyApiKey(event.target.value)}
                  placeholder="Create one at partner.klipy.com"
                  className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-xs"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSaveGifKeys()}
                disabled={gifKeysSaving}
                className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                {gifKeysSaving ? "Saving..." : gifKeysSaved ? "Saved!" : "Save GIF settings"}
              </button>
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
                An instant notification for each new message, even when this tab (or browser) is closed - unlike the
                email digest below, which batches instead of firing per-message.
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
                A periodic summary email ("N new messages") instead of one email per message - message content is
                end-to-end encrypted, so it can never be included.
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
                Ask visitors to explicitly share limited device and network diagnostics. This is off by default and
                never includes exact GPS, fingerprinting, browsing history, or decrypted message content.
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
              <div className="mb-4 space-y-3 rounded-lg bg-[var(--surface-muted)] p-3">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={storeIpAddresses}
                    onChange={(event) => setStoreIpAddresses(event.target.checked)}
                    className="mt-0.5 accent-[var(--color-accent-500)]"
                  />
                  <span>
                    Store visitor IP addresses
                    <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
                      Applies to future identities, sessions, and consented diagnostics. Keep this off unless you need
                      it for abuse handling and disclose it in your privacy policy.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={visitorGeolocationEnabled}
                    disabled={!insightsEnabled}
                    onChange={(event) => setVisitorGeolocationEnabled(event.target.checked)}
                    className="mt-0.5 accent-[var(--color-accent-500)] disabled:opacity-50"
                  />
                  <span>
                    Add coarse IP geolocation
                    <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
                      After visitor consent, the server sends the IP to ipwho.is for approximate city and network
                      details. Exact GPS is never requested.
                    </span>
                  </span>
                </label>
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
      {openMediaImage && (
        <ImageLightbox
          url={openMediaImage.url}
          filename={openMediaImage.filename}
          onClose={() => setOpenMediaImage(null)}
        />
      )}
      {openMediaVideo && (
        <VideoLightbox
          url={openMediaVideo.url}
          filename={openMediaVideo.filename}
          onClose={() => setOpenMediaVideo(null)}
        />
      )}
      {navigationBlocker.state === "blocked" && (
        <UnsavedMediaOrderModal
          saving={saving}
          onSave={() => void saveBeforeLeaving()}
          onDiscard={discardBeforeLeaving}
          onKeepEditing={navigationBlocker.reset}
        />
      )}
    </div>
  );
}
