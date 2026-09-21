// Original instrumental demo clips; no third-party recording or music service.
// Rebuild with: node scripts/generate-demo-audio.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rate = 22050;
const duration = 24;
const directory = new URL("../public/audio/", import.meta.url);
mkdirSync(directory, { recursive: true });
const clips = [
  { file: "night-signal", root: 45, chords: [0, 5, 3, 7], steps: [0, 7, 12, 15, 7, 12, 19, 15] },
  { file: "glass-platform", root: 50, chords: [0, 3, 7, 5], steps: [12, 19, 24, 22, 19, 15, 12, 7] },
  { file: "evening-breeze", root: 43, chords: [0, 7, 5, 3], steps: [0, 3, 7, 10, 12, 10, 7, 3] },
  { file: "dawn-echo", root: 48, chords: [0, 5, 7, 3], steps: [12, 16, 19, 24, 19, 16, 7, 12] },
];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
for (const clip of clips) {
  const pcm = Buffer.alloc(rate * duration * 2);
  for (let sample = 0; sample < rate * duration; sample++) {
    const t = sample / rate;
    const chord = clip.root + clip.chords[Math.floor(t / 6)];
    const phrase = t % 6;
    const padEnvelope = Math.min(1, phrase / .4) * Math.min(1, (6 - phrase) / .5);
    let value = 0;
    for (const note of [0, 7, 15]) value += .045 * Math.sin(2 * Math.PI * hz(chord + note) * t) * padEnvelope;
    const beat = Math.floor(t / .375);
    const age = t % .375;
    const note = chord + clip.steps[beat % clip.steps.length];
    const envelope = Math.min(1, age / .012) * Math.exp(-age * 8);
    value += (.13 * Math.sin(2 * Math.PI * hz(note) * age) + .025 * Math.sin(2 * Math.PI * hz(note) * 2 * age)) * envelope;
    const pulse = t % .75;
    value += .035 * Math.sin(2 * Math.PI * (55 * pulse + 18 * (1 - Math.exp(-pulse * 20)))) * Math.exp(-pulse * 12);
    value *= Math.min(1, t / .3, (duration - t) / .8);
    pcm.writeInt16LE(Math.round(Math.max(-.7, Math.min(.7, value)) * 32767), sample * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  const target = new URL(`${clip.file}.wav`, directory);
  writeFileSync(target, Buffer.concat([header, pcm]));
  console.log(`${fileURLToPath(target)} · ${duration}s`);
}
