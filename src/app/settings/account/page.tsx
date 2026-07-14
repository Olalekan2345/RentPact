"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, CardContent, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { fetchProfile, updateProfile, type UserProfile } from "@/lib/profile";
import { resizeImageToDataUrl } from "@/lib/image";

export default function AccountSettingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [photoInput, setPhotoInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchProfile(session.email).then((p) => {
      setProfile(p);
      setNameInput(p?.name ?? "");
      setPhotoInput(p?.photoUrl ?? "");
    });
  }, [session]);

  if (isLoading || !session) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateProfile(session.email, {
        name: nameInput.trim() || null,
        photoUrl: photoInput.trim() || null,
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    setPhotoUploadError(null);
    if (file.size > 5 * 1024 * 1024) {
      setPhotoUploadError("Image must be under 5MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setPhotoInput(dataUrl);
    } catch {
      setPhotoUploadError("Could not read that image. Try a different file.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest-50 text-lg font-semibold text-forest-500">
              {photoInput ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoInput} alt="" className="h-full w-full object-cover" />
              ) : (
                session.email.slice(0, 2).toUpperCase()
              )}
            </div>
            {profile === null ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <p className="text-sm text-ink-soft">
                Member since {profile ? formatDate(new Date(profile.memberSince)) : "…"}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-muted">Display name</label>
            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="h-11 rounded-md border border-forest-100 bg-cream-50 px-4 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-muted">Profile photo</label>
            {!photoInput && (
              <label className="w-fit cursor-pointer text-sm font-medium text-forest-500 underline">
                {uploadingPhoto ? "Uploading…" : "Upload a photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={handlePhotoUpload}
                />
              </label>
            )}
            {photoUploadError && <p className="text-xs text-terracotta-500">{photoUploadError}</p>}
            {photoInput && (
              <button
                type="button"
                onClick={() => setPhotoInput("")}
                className="w-fit text-xs font-medium text-terracotta-500 underline"
              >
                Remove photo
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {saved && <span className="text-sm text-forest-500">Saved</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <p className="text-sm font-medium text-ink-muted">Email</p>
            <p className="mt-1 text-sm text-ink">{session.email}</p>
            <p className="mt-1 text-xs text-ink-soft">
              This is tied to your Circle wallet identity and can&apos;t be changed here.
            </p>
          </div>
          <div className="border-t border-forest-100 pt-3">
            <p className="text-sm font-medium text-ink-muted">Password / PIN</p>
            <p className="mt-1 text-xs text-ink-soft">
              RentPact has no password — your wallet is secured by a PIN you set through Circle&apos;s hosted
              signing panel on every transaction. There&apos;s nothing to manage here.
            </p>
          </div>
          <div className="border-t border-forest-100 pt-3">
            <p className="text-sm font-medium text-ink-muted">Phone number</p>
            <p className="mt-1 text-xs text-ink-soft">Not collected yet — sign-in is email-only for now.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
