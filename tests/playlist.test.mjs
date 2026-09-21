import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePlaylist } from "../scripts/prepare-playlist.mjs";
import { toneWav } from "./playlist-test-helpers.mjs";

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "resonance-playlist-"));
  await Promise.all(["config", "public/audio", "public/covers"].map(path => mkdir(join(root, path), { recursive: true })));
  await writeFile(join(root, "public/audio/长音频.wav"), toneWav());
  await copyFile(new URL("./fixtures/playlist-tone.mp3", import.meta.url), join(root, "public/audio/tone.mp3"));
  await writeFile(join(root, "public/covers/test.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#6feee1"/></svg>');
  return root;
}
const wav = { id: "long-tone", title: "长音频", artist: "测试音源", audio: "/audio/长音频.wav", cover: "/covers/test.svg" };
const mp3 = { id: "mp3-tone", title: "MP3 测试", artist: "测试音源", audio: "/audio/tone.mp3" };
async function configure(root, tracks) { await writeFile(join(root, "config/playlist.json"), JSON.stringify({ version: 1, tracks })); }
test("WAV/MP3 metadata, covers and version hashes are derived from the actual files", async () => {
  const root = await workspace(); await configure(root, [wav, mp3]);
  const first = await preparePlaylist(root);
  assert.equal(first.tracks[0].duration, 35.25); assert.equal(first.tracks[0].mimeType, "audio/wav");
  assert.equal(first.tracks[1].mimeType, "audio/mpeg"); assert.ok(first.tracks[1].duration >= 2 && first.tracks[1].duration < 2.3);
  assert.match(first.tracks[0].audioUrl, /%E9%95%BF/); assert.match(first.tracks[0].coverUrl, /^\/covers\/test.svg\?v=/);
  assert.deepEqual(await preparePlaylist(root), first);
  await writeFile(join(root, "public/audio/长音频.wav"), toneWav(41.5));
  const second = await preparePlaylist(root);
  assert.equal(second.tracks[0].duration, 41.5); assert.notEqual(second.tracks[0].revision, first.tracks[0].revision);
  assert.notEqual(second.catalogVersion, first.catalogVersion); assert.equal(second.tracks[0].id, first.tracks[0].id);
});
test("removed tracks retain identity and metadata; empty, single and restored catalogs are valid", async () => {
  const root = await workspace(); await configure(root, [wav, mp3]); await preparePlaylist(root);
  await configure(root, [mp3]); const one = await preparePlaylist(root);
  assert.equal(one.tracks.length, 1); assert.equal(one.retired[0].id, wav.id); assert.equal(one.retired[0].track, wav.title); assert.equal(one.retired[0].available, false);
  await configure(root, []); const empty = await preparePlaylist(root);
  assert.equal(empty.tracks.length, 0); assert.equal(empty.retired.length, 2);
  await configure(root, [wav]); const restored = await preparePlaylist(root);
  assert.equal(restored.tracks[0].available, true); assert.deepEqual(restored.retired.map(track => track.id), [mp3.id]);
});
test("invalid IDs, missing assets, corrupt audio and escaped paths do not overwrite the last manifest", async () => {
  const root = await workspace(); await configure(root, [wav]); await preparePlaylist(root);
  const before = await readFile(join(root, "lib/resonance/catalog.generated.json"), "utf8");
  await writeFile(join(root, "public/audio/bad.wav"), "not audio");
  for (const entries of [[wav, wav], [{ ...wav, id: "__proto__" }], [{ ...wav, audio: "/audio/missing.wav" }], [{ ...wav, audio: "/audio/%2e%2e/%2e%2e/config/playlist.json" }], [{ ...wav, audio: "https://example.invalid/song.mp3" }], [{ ...wav, audio: "/audio/bad.wav" }], [{ ...wav, cover: "/covers/no.png" }]]) {
    await configure(root, entries); await assert.rejects(preparePlaylist(root));
    assert.equal(await readFile(join(root, "lib/resonance/catalog.generated.json"), "utf8"), before);
  }
});
