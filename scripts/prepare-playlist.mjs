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

// Cover palettes drive the app backdrop. Text colours are checked against the
// base they sit on so a new cover cannot ship unreadable secondary text.
const HEX = /^#[0-9a-f]{6}$/i;
const THEMES = { dark: { base: "#121416", ink: "#f4f5f6", mutedAlpha: .54 }, light: { base: "#f4f5f6", ink: "#16191c", mutedAlpha: .66 } };
const MIN_CONTRAST = 4.5;
const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const toHex = channels => `#${channels.map(value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")).join("")}`;
const mix = (from, to, amount) => toHex(rgb(from).map((value, index) => value + (rgb(to)[index] - value) * amount));
const luminance = hex => {
  const [r, g, b] = rgb(hex).map(value => { value /= 255; return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b;
};
export const contrast = (a, b) => { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + .05) / (dark + .05); };

function readableAccent(accent, base, towards) {
  for (let step = 0; step <= 20; step += 1) { const candidate = mix(accent, towards, step / 20); if (contrast(candidate, base) >= MIN_CONTRAST) return candidate; }
  return towards;
}

export function coverPalette(input, accent, id) {
  const palette = {};
  for (const [theme, fallback] of Object.entries(THEMES)) {
    const value = input?.[theme];
    const colours = value === undefined
      ? { base: fallback.base, ink: fallback.ink, accent: readableAccent(accent, fallback.base, theme === "dark" ? "#ffffff" : "#000000") }
      : value;
    if (!colours || typeof colours !== "object" || !["base", "accent", "ink"].every(key => HEX.test(colours[key] ?? ""))) throw new Error(`${id} palette.${theme} 需包含六位十六进制的 base、accent、ink`);
    const { base, ink } = colours;
    const color = colours.accent;
    if (contrast(ink, base) < MIN_CONTRAST || contrast(color, base) < MIN_CONTRAST || contrast(mix(base, ink, fallback.mutedAlpha), base) < MIN_CONTRAST) throw new Error(`${id} palette.${theme} 文字或强调色与底色对比度不足 ${MIN_CONTRAST}:1`);
    palette[theme] = { base: base.toLowerCase(), accent: color.toLowerCase(), ink: ink.toLowerCase() };
  }
  return palette;
}

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
    if (input.palette !== undefined && (!input.palette || typeof input.palette !== "object")) throw new Error(`${id} palette 配置无效`);
    const palette = coverPalette(input.palette, accent, id);
    tracks.push({ id, track, artist, audioUrl: `${audio.url}?v=${revision}`, ...(coverUrl ? { coverUrl } : {}), accent, palette, source: input.source ? text(input.source, `${id} source`) : "自备模拟歌单", duration, mimeType, byteLength: audio.size, revision, available: true });
  }
  // Retain names and IDs when removed from the active playlist. No old favorite
  // is silently deleted or reassigned to a different track.
  const retired = [...new Map([...previous.retired, ...previous.tracks].filter(track => !seen.has(track.id)).map(track => [track.id, { ...track, available: false }])).values()];
  // Palettes are presentation only; changing them must not invalidate live rooms.
  const manifest = { version: 1, catalogVersion: hash(JSON.stringify(tracks.map(track => { const identity = { ...track }; delete identity.palette; return identity; }))).slice(0, 16), tracks, retired };
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
