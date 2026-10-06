"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { name: string; state: "waiting" | "uploading" | "done" | "error"; message?: string };

export function Uploader({ usage = "gallery", category }: { usage?: "gallery" | "site"; category?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(files: FileList) {
    const list = Array.from(files);
    setItems(list.map((f) => ({ name: f.name, state: "waiting" })));
    for (const [i, f] of list.entries()) {
      setItems((s) => s.map((it, n) => (n === i ? { ...it, state: "uploading" } : it)));
      const body = new FormData();
      body.set("file", f);
      body.set("usage", usage);
      if (category) body.set("category", category);
      try {
        const res = await fetch("/api/admin/media", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        setItems((s) => s.map((it, n) => (n === i ? { ...it, state: res.ok ? "done" : "error", message: res.ok ? undefined : data.error } : it)));
      } catch {
        setItems((s) => s.map((it, n) => (n === i ? { ...it, state: "error", message: "Network error" } : it)));
      }
    }
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="border border-dashed border-line-strong bg-paper p-5">
      <label htmlFor="upload" className="font-medium">Upload images</label>
      <p className="mt-1 text-sm text-taupe">
        JPEG, PNG, WebP or HEIC, up to 15 MB each. Photos are resized, converted and stripped of location data. New uploads start unpublished.
        {usage === "site" && " You can also upload a short MP4 or WebM video (up to 40 MB) for the homepage hero."}
      </p>
      <input
        ref={input}
        id="upload"
        type="file"
        multiple
        accept={usage === "site" ? "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/heic,image/heif"}
        className="mt-4 block text-sm file:mr-4 file:border file:border-ink file:bg-transparent file:px-4 file:py-2.5 file:text-sm"
        onChange={(e) => e.target.files?.length && upload(e.target.files)}
      />
      {items.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className={it.state === "error" ? "text-error" : it.state === "done" ? "text-success" : "text-taupe"}>
              {it.name}: {it.state === "error" ? it.message : it.state === "done" ? "uploaded" : it.state}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
