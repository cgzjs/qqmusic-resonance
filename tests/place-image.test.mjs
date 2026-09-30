import test from "node:test";
import assert from "node:assert/strict";
import { buildPlaceImagePrompt } from "../server/place-image.ts";

test("place image prompt is grounded in song context without precise location or user data", () => {
  const prompt = buildPlaceImagePrompt("又三郎", "ヨルシカ", "留给路过的你");
  assert.match(prompt, /又三郎/);
  assert.match(prompt, /ヨルシカ/);
  assert.match(prompt, /声音明信片/);
  assert.match(prompt, /人物、文字、歌词/);
  assert.match(prompt, /不要同心圆、螺旋/);
  assert.doesNotMatch(prompt, /28\.214|112\.971|account|token/i);
});
