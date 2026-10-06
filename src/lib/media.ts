/** Client-safe media description. Storage keys are opaque, app-generated paths. */
export type Media = {
  id: number;
  key: string;
  width: number;
  height: number;
  variants: number[];
  alt: string;
  caption: string | null;
  focalX: number;
  focalY: number;
  isExample: boolean;
};

export function mediaUrl(m: Pick<Media, "key">, width: number) {
  return `/media/${m.key}/${width}.webp`;
}

export function srcSet(m: Pick<Media, "key" | "variants">) {
  return m.variants.map((w) => `${mediaUrl(m, w)} ${w}w`).join(", ");
}

export function bestVariant(m: Pick<Media, "variants">, target: number) {
  return m.variants.find((w) => w >= target) ?? m.variants[m.variants.length - 1];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMedia(r: any, prefix = ""): Media | null {
  const p = (k: string) => r[`${prefix}${k}`];
  if (!p("id")) return null;
  return {
    id: p("id"),
    key: p("storage_key"),
    width: p("width"),
    height: p("height"),
    variants: (p("variants") as number[]).map(Number),
    alt: p("alt_text") ?? "",
    caption: p("caption") ?? null,
    focalX: p("focal_x") ?? 50,
    focalY: p("focal_y") ?? 50,
    isExample: !!p("is_example"),
  };
}
