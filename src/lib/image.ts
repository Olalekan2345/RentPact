import { supabaseBrowser } from "@/lib/supabase/client";

const BUCKET = "photos";

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export function resizeImageToDataUrl(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image"));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unsupported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);/)?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadBlob(blob: Blob, folder: string, ext: string, contentType: string): Promise<string> {
  const supabase = supabaseBrowser();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    cacheControl: "31536000", // content-addressed by random path — safe to cache forever
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a data-URL image (already resized/encoded) to Supabase Storage and
 * returns its public URL. Used where the caller also needs the data URL
 * itself — e.g. evidence photos hash the content before upload.
 */
export function uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
  return uploadBlob(dataUrlToBlob(dataUrl), folder, "jpg", "image/jpeg");
}

/** Resize client-side, upload to Supabase Storage, return the public URL. */
export async function uploadImage(file: File, folder: string, maxDimension = 800): Promise<string> {
  const dataUrl = await resizeImageToDataUrl(file, maxDimension);
  return uploadDataUrl(dataUrl, folder);
}

/** Upload a raw file (e.g. a walkthrough video) without re-encoding. Goes
 * straight from the browser to Supabase Storage, so it isn't subject to any
 * serverless request-body limit. */
export function uploadFile(file: File, folder: string): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  return uploadBlob(file, folder, ext, file.type || "application/octet-stream");
}
