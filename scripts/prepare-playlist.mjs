import { readFile, writeFile, mkdir, stat, realpath, rename } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseFile } from "music-metadata";

export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const mimeTypes = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".flac": "audio/flac" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const text = (value, label, max = 160) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} 必须是 1–${max} 个字符的文本`);
  return value.trim();
};

async function asset(root, value, folder) {
  const url = text(value, "素材路径", 500);
  let decoded;
  try { decoded = decodeURIComponent(url); } catch { throw new Error(`素材路径编码无效：${url}`); }
  if (!decoded.startsWith(`/${folder}/`) || /[\\?#\0]/.test(decoded) || decoded.split("/").some(part => part === "." || part === "..")) throw new Error(`素材必须位于 public/${folder}/：${url}`);
  const publicRoot = await realpath(resolve(root, "public"));
  const path = await realpath(resolve(publicRoot, decoded.slice(1)));
  if (!path.startsWith(publicRoot + sep)) throw new Error(`素材路径超出 public 目录：${url}`);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`素材不是文件：${url}`);
  return { path, url: encodeURI(decoded), size: info.size };
}

export async function preparePlaylist(root = fileURLToPath(new URL("../", import.meta.url)), { write = true } = {}) {
  root = resolve(root);
  const config = JSON.parse(await readFile(resolve(root, "config/playlist.json"), "utf8"));
  if (config?.version !== 1 || !Array.isArray(config.tracks) || config.tracks.length > 100) throw new Error("歌单需为 version: 1，tracks 数组最多 100 首");
  const target = resolve(root, "lib/resonance/catalog.generated.json");
  let previous = { tracks: [], retired: [] };
  try { previous = JSON.parse(await readFile(target, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw new Error(`旧歌单清单无法读取，请检查 ${target}`); }
  if (!Array.isArray(previous.tracks) || !Array.isArray(previous.retired)) throw new Error("旧歌单清单格式无效，不能覆盖历史资料");
  const seen = new Set();
  const tracks = [];
  for (const [index, input] of config.tracks.entries()) {
    const label = `第 ${index + 1} 首歌`;
    if (!input || typeof input !== "object") throw new Error(`${label} 配置无效`);
    const id = text(input.id, `${label} id`, 64);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ["constructor", "prototype"].includes(id) || seen.has(id)) throw new Error(`${label} id 无效或重复：${id}`);
    seen.add(id);
    const track = text(input.title, `${label} title`), artist = text(input.artist, `${label} artist`);
    const audio = await asset(root, input.audio, "audio");
    const mimeType = mimeTypes[extname(audio.path).toLowerCase()];
    if (!mimeType || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) throw new Error(`${id} 需为非空 WAV/MP3/OGG/M4A/FLAC，单首不超过 32 MiB`);
    const metadata = await parseFile(audio.path, { duration: true, skipCovers: true });
    const duration = metadata.format.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !metadata.format.numberOfChannels) throw new Error(`${id} 无法解析有效音频时长或音轨`);
    const accent = input.accent ?? "#6feee1";
    if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error(`${id} accent 必须是六位十六进制颜色`);
    const revision = hash(await readFile(audio.path)).slice(0, 16);
    let coverUrl;
    if (input.cover) {
      const cover = await asset(root, input.cover, "covers");
      if (![".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(extname(cover.path).toLowerCase()) || cover.size > 5 * 1024 * 1024) throw new Error(`${id} 封面格式不支持或超过 5 MiB`);
      coverUrl = `${cover.url}?v=${hash(await readFile(cover.path)).slice(0, 16)}`;
    }
    tracks.push({ id, track, artist, audioUrl: `${audio.url}?v=${revision}`, ...(coverUrl ? { coverUrl } : {}), accent, source: input.source ? text(input.source, `${id} source`) : "自备模拟歌单", duration, mimeType, byteLength: audio.size, revision, available: true });
  }
  // Retain names and IDs when removed from the active playlist. No old favorite
  // is silently deleted or reassigned to a different track.
  const retired = [...new Map([...previous.retired, ...previous.tracks].filter(track => !seen.has(track.id)).map(track => [track.id, { ...track, available: false }])).values()];
  const manifest = { version: 1, catalogVersion: hash(JSON.stringify(tracks)).slice(0, 16), tracks, retired };
  if (write) {
    await mkdir(dirname(target), { recursive: true });
    const output = JSON.stringify(manifest, null, 2) + "\n";
    let existing = ""; try { existing = await readFile(target, "utf8"); } catch { /* First preparation. */ }
    if (output !== existing) { const temporary = `${target}.${process.pid}.tmp`; await writeFile(temporary, output, "utf8"); await rename(temporary, target); }
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await preparePlaylist(); console.log(`歌单已准备：${result.tracks.length} 首可播放，${result.retired.length} 首历史资料。`); }
  catch (error) { console.error(`歌单配置错误：${error.message}`); process.exitCode = 1; }
}
