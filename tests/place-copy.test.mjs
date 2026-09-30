import test from "node:test";
import assert from "node:assert/strict";
import { generatePlaceCopySuggestions, placeCopyStyles } from "../lib/resonance/place-copy.ts";

const track = { track: "又三郎", artist: "ヨルシカ" };

test("place copy suggestions stay grounded in the selected song and remain within form limits", () => {
  for (const style of placeCopyStyles) {
    const suggestions = generatePlaceCopySuggestions({ track, style });
    assert.equal(suggestions.length, 3);
    for (const suggestion of suggestions) {
      assert.ok(suggestion.title.length <= 40);
      assert.ok(suggestion.message.length <= 600);
      assert.match(`${suggestion.title}${suggestion.message}`, /又三郎|ヨルシカ/);
    }
  }
});

test("empty track metadata does not produce a fabricated suggestion", () => {
  assert.deepEqual(generatePlaceCopySuggestions({ track: { track: "", artist: "ヨルシカ" }, style: "gentle" }), []);
  assert.deepEqual(generatePlaceCopySuggestions({ track: { track: "又三郎", artist: "" }, style: "gentle" }), []);
});
