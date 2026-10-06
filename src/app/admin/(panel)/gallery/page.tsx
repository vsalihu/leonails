import type { Metadata } from "next";
import { sql } from "@/lib/server/db";
import { PageHeader, ExampleFlag, Empty } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { Uploader } from "@/components/admin/uploader";
import { FocalPicker } from "@/components/admin/focal-picker";
import { GALLERY_CATEGORIES } from "@/lib/server/public-content";
import { bestVariant, mediaUrl } from "@/lib/media";
import { deleteMediaAction, moveMediaAction, saveMediaAction } from "./actions";

export const metadata: Metadata = { title: "Gallery" };

const SLOT_LABELS: Record<string, string> = { "home.hero": "Homepage hero", "home.intro": "Homepage introduction", "about.portrait": "About page portrait", "visit.studio": "Studio photo" };
const VIDEO_SLOT_LABELS: Record<string, string> = { "home.hero.video": "Homepage hero video" };

export default async function GalleryAdmin({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const db = sql();
  const usage = show === "site" ? "site" : "gallery";
  const [media, treatments, slots] = await Promise.all([
    db`SELECT * FROM media_assets WHERE usage = ${usage} ORDER BY sort_order, id`,
    db`SELECT id, name FROM treatments WHERE status <> 'archived' ORDER BY sort_order`,
    db`SELECT slot, media_id FROM site_images`,
  ]);
  return (
    <>
      <PageHeader title="Gallery">
        <a href="?" className={`btn min-h-11 ${usage === "gallery" ? "btn-primary" : "btn-outline"}`} aria-current={usage === "gallery" ? "page" : undefined}>Gallery images</a>
        <a href="?show=site" className={`btn min-h-11 ${usage === "site" ? "btn-primary" : "btn-outline"}`} aria-current={usage === "site" ? "page" : undefined}>Website images</a>
      </PageHeader>
      <Uploader usage={usage} />
      {usage === "site" && <p className="mt-4 text-sm text-taupe">Website images fill fixed places on the site. Choose where each one goes with &quot;Use on website as&quot;.</p>}

      {media.length === 0 ? <div className="mt-8"><Empty>No images yet. Upload some above.</Empty></div> : (
        <ul className="mt-8 grid gap-6 lg:grid-cols-2">
          {media.map((m) => {
            const usedIn = slots.filter((s) => s.media_id === m.id).map((s) => SLOT_LABELS[s.slot] ?? VIDEO_SLOT_LABELS[s.slot]);
            const isVideo = m.kind === "video";
            return (
              <li key={m.id} className="border border-line bg-paper p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className={m.is_published ? "text-success" : "text-taupe"}>{m.is_published ? "Published" : "Not published"}</span>
                  {m.is_featured && <span>· Featured</span>}
                  <ExampleFlag show={m.is_example} />
                  {usedIn.length > 0 && <span className="text-taupe">· Used as {usedIn.join(", ")}</span>}
                </div>
                <ActionForm action={saveMediaAction} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <input type="hidden" name="id" value={m.id} />
                  {isVideo ? (
                    <div>
                      <video src={`/media/${m.storage_key}/video.${m.mime === "video/webm" ? "webm" : "mp4"}`} controls muted playsInline preload="metadata" className="w-full bg-night" />
                      <p className="mt-1 text-xs text-taupe">{m.mime}, {(m.byte_size / 1024 / 1024).toFixed(1)} MB. Plays muted on a loop; visitors who prefer reduced motion see the homepage hero image instead.</p>
                    </div>
                  ) : (
                    <FocalPicker src={mediaUrl({ key: m.storage_key }, bestVariant({ variants: m.variants }, 480))} x={m.focal_x} y={m.focal_y} alt={m.alt_text || "Uploaded image"} />
                  )}
                  <div className="grid content-start gap-3">
                    <AField name="alt" label="Description (alt text)" help={isVideo ? "What the video shows, for screen readers." : "What's in the photo, for screen readers."}><input name="alt" defaultValue={m.alt_text} className="input" /></AField>
                    <AField name="caption" label="Caption (optional)"><input name="caption" defaultValue={m.caption ?? ""} className="input" /></AField>
                    {usage === "gallery" && (
                      <>
                        <AField name="category" label="Style">
                          <select name="category" defaultValue={m.category ?? ""} className="input"><option value="">None</option>{GALLERY_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select>
                        </AField>
                        <AField name="treatmentId" label="Related treatment (optional)">
                          <select name="treatmentId" defaultValue={m.related_treatment_id ?? ""} className="input"><option value="">None</option>{treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                        </AField>
                      </>
                    )}
                    <AField name="slot" label="Use on website as (optional)">
                      <select name="slot" defaultValue="" className="input">
                        <option value="">No change</option>
                        {Object.entries(isVideo ? VIDEO_SLOT_LABELS : SLOT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        {isVideo && usedIn.length > 0 && <option value="none:home.hero.video">Stop using as homepage hero video</option>}
                      </select>
                    </AField>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={m.is_published} className="accent-[var(--color-ink)]" /> Published</label>
                    {usage === "gallery" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={m.is_featured} className="accent-[var(--color-ink)]" /> Feature on the homepage</label>}
                    {m.provenance && <p className="text-xs text-taupe">Source: {m.provenance}</p>}
                  </div>
                </ActionForm>
                <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
                  {usage === "gallery" && (["up", "down"] as const).map((dir) => (
                    <ActionForm key={dir} action={moveMediaAction} submitLabel={dir === "up" ? "Move earlier" : "Move later"} submitClassName="btn btn-outline min-h-9 px-3 text-xs" className="[&>div]:mt-0">
                      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="dir" value={dir} />
                    </ActionForm>
                  ))}
                  <ActionForm action={deleteMediaAction} submitLabel="Delete" pendingLabel="Deleting" submitClassName="btn btn-outline min-h-9 border-error px-3 text-xs text-error" confirm="Delete this image permanently? It will be removed from the website." className="ml-auto [&>div]:mt-0">
                    <input type="hidden" name="id" value={m.id} />
                  </ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
