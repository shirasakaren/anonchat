import { useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

interface Props {
  url: string;
  filename: string;
}

export function ThemedAudioPlayer({ url, filename }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousVolumeRef = useRef(1);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [error, setError] = useState(false);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setError(true);
      }
    } else {
      audio.pause();
    }
  }

  function setVolume(next: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const normalized = Math.min(1, Math.max(0, next));
    audio.volume = normalized;
    setVolumeState(normalized);
    if (normalized > 0) previousVolumeRef.current = normalized;
  }

  function toggleMute() {
    setVolume(volume > 0 ? 0 : previousVolumeRef.current || 1);
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-[var(--text)]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true);
          setError(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          aria-label={playing ? `Pause ${filename}` : `Play ${filename}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--btn-bg)] text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
        >
          {playing ? (
            <Pause size={17} fill="currentColor" aria-hidden />
          ) : (
            <Play size={17} fill="currentColor" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{filename}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="w-9 text-right text-[10px] tabular-nums text-[var(--text-muted)]">
              {formatMediaTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (audioRef.current) audioRef.current.currentTime = next;
                setCurrentTime(next);
              }}
              aria-label={`Seek ${filename}`}
              className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, var(--color-accent-500) ${progress}%, var(--border) ${progress}%)`,
                accentColor: "var(--color-accent-500)",
              }}
            />
            <span className="w-9 text-[10px] tabular-nums text-[var(--text-muted)]">{formatMediaTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={volume > 0 ? "Mute audio" : "Unmute audio"}
          className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
        >
          {volume > 0 ? <Volume2 size={17} aria-hidden /> : <VolumeX size={17} aria-hidden />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="Audio volume"
          className="hidden w-16 accent-[var(--color-accent-500)] sm:block"
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-[var(--danger-fg)]" role="alert">
          This browser cannot play the audio codec. Download the file to open it in another player.
        </p>
      )}
    </div>
  );
}
