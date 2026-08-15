"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile, uploadImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/messages";

const MAX_MB = 15;

/** Manages a composer's pending (already-uploaded) attachments. */
export function useAttachments() {
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_MB * 1024 * 1024) {
          setError(`Files must be under ${MAX_MB}MB.`);
          continue;
        }
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        const isAudio = file.type.startsWith("audio/");
        // Images get resized client-side; everything else (incl. voice notes) uploads as-is.
        const url = isImage ? await uploadImage(file, "messages", 1400) : await uploadFile(file, "messages");
        setPending((prev) => [
          ...prev,
          {
            url,
            name: file.name || (isImage ? "image" : isAudio ? "voice note" : "file"),
            contentType: file.type || "application/octet-stream",
            kind: isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "file",
          },
        ]);
      }
    } catch {
      setError("Couldn't upload that file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const remove = (i: number) => setPending((prev) => prev.filter((_, idx) => idx !== i));
  const clear = () => {
    setPending([]);
    setError(null);
  };

  return { pending, uploading, error, addFiles, remove, clear };
}

/** Paperclip button that opens the file picker — sits inside the composer row. */
export function AttachButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          if (e.currentTarget.files?.length) onFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label="Attach a photo or file"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-forest-100 bg-cream-50 text-ink-muted transition-colors hover:bg-cream-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PaperclipIcon className="h-5 w-5" />
      </button>
    </>
  );
}

/** The row of pending attachments shown above the composer before sending. */
export function AttachmentPreviews({
  pending,
  uploading,
  error,
  onRemove,
}: {
  pending: Attachment[];
  uploading: boolean;
  error: string | null;
  onRemove: (i: number) => void;
}) {
  if (pending.length === 0 && !uploading && !error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      {pending.map((a, i) => (
        <div key={i} className="relative">
          {a.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt={a.name} className="h-14 w-14 rounded-md border border-forest-100 object-cover" />
          ) : a.kind === "audio" ? (
            <div className="flex h-14 items-center gap-1.5 rounded-md border border-forest-100 bg-cream-100 px-2.5 text-xs text-ink">
              <MicIcon className="h-4 w-4 shrink-0 text-forest-500" />
              <span>Voice note</span>
            </div>
          ) : (
            <div className="flex h-14 max-w-[10rem] items-center gap-1.5 rounded-md border border-forest-100 bg-cream-100 px-2.5 text-xs text-ink">
              <FileIcon className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="truncate">{a.name}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${a.name}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-cream-50 shadow"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </div>
      ))}
      {uploading && <span className="text-xs text-ink-soft">Uploading…</span>}
      {error && <span className="text-xs text-terracotta-600">{error}</span>}
    </div>
  );
}

/** Renders a received message's attachments (in a chat bubble column). */
export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  if (!attachments?.length) return null;
  const images = attachments.filter((a) => a.kind === "image");
  const others = attachments.filter((a) => a.kind !== "image");

  return (
    <div className="flex w-60 max-w-full flex-col gap-1.5">
      {images.length > 0 && (
        <div className={cn("grid gap-1.5", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-forest-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name} className={cn("w-full object-cover", images.length === 1 ? "max-h-64" : "h-28")} />
            </a>
          ))}
        </div>
      )}
      {others.map((a, i) =>
        a.kind === "video" ? (
          <video key={i} src={a.url} controls className="w-full rounded-lg border border-forest-100" />
        ) : a.kind === "audio" ? (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-forest-100 bg-cream-100 px-2 py-1.5">
            <MicIcon className="h-4 w-4 shrink-0 text-forest-500" />
            <audio src={a.url} controls className="h-8 w-full min-w-0" />
          </div>
        ) : (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download
            className="flex items-center gap-2 rounded-lg border border-forest-100 bg-cream-100 px-3 py-2 text-sm text-ink hover:bg-cream-200"
          >
            <FileIcon className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
            <DownloadIcon className="h-4 w-4 shrink-0 text-ink-muted" />
          </a>
        ),
      )}
    </div>
  );
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Records a voice note from the mic (MediaRecorder) and hands the finished
 * clip to `onFile` as an audio File — which the composer uploads through the
 * same attachment path. Idle shows a mic button; while recording it shows a
 * timer with stop (attach) and cancel (discard).
 */
export function VoiceRecorderButton({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setSeconds(0);
  };

  useEffect(() => cleanup, []);

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const send = !cancelledRef.current && blob.size > 0;
        cleanup();
        if (send) onFile(new File([blob], `voice-note.${ext}`, { type }));
      };
      mr.start();
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Mic access was blocked.");
      cleanup();
    }
  };

  const stop = () => {
    cancelledRef.current = false;
    recorderRef.current?.stop();
  };
  const cancel = () => {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  };

  if (recording) {
    return (
      <div className="flex h-11 shrink-0 items-center gap-2 rounded-md border border-terracotta-200 bg-terracotta-50 px-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-terracotta-500" />
        <span className="text-sm tabular-nums text-terracotta-700">{fmtDuration(seconds)}</span>
        <button type="button" onClick={cancel} aria-label="Discard recording" className="text-ink-muted hover:text-ink">
          <XIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={stop}
          aria-label="Stop and attach voice note"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-500 text-cream-50"
        >
          <StopIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={start}
      aria-label="Record a voice note"
      title={error ?? "Record a voice note"}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-forest-100 bg-cream-50 transition-colors hover:bg-cream-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60",
        error ? "text-terracotta-500" : "text-ink-muted",
      )}
    >
      <MicIcon className="h-5 w-5" />
    </button>
  );
}

function PaperclipIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.25 3.25 0 0 1 4.6 4.6L8.9 16.9a1.5 1.5 0 0 1-2.1-2.1l7.4-7.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M6 3.5h7L18 8v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M13 3.5V8h4.5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 17.5V21M9 21h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function DownloadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3.5v11m0 0l-3.5-3.5M12 14.5l3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}
