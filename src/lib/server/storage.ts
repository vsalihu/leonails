import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

/** Minimal object storage used for processed images. Keys are app-generated, never user input. */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  removePrefix(prefix: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/;
function check(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    check(key);
    return path.join(this.root, key);
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }
  async removePrefix(prefix: string) {
    check(prefix);
    await rm(path.join(this.root, prefix), { recursive: true, force: true });
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string) {
    const e = env();
    this.client = new S3Client({
      region: e.S3_REGION ?? "auto",
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: !!e.S3_ENDPOINT,
      credentials: e.S3_ACCESS_KEY_ID ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    check(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
  }
  async get(key: string) {
    check(key);
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch {
      return null;
    }
  }
  async removePrefix(prefix: string) {
    check(prefix);
    const listed = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
    const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objects.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
  }
}

let instance: Storage | undefined;
export function storage(): Storage {
  if (!instance) {
    const e = env();
    if (e.STORAGE_DRIVER === "s3") {
      if (!e.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
      instance = new S3Storage(e.S3_BUCKET);
    } else {
      instance = new LocalStorage(path.resolve(e.STORAGE_DIR));
    }
  }
  return instance;
}
