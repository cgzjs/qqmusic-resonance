import { generatePlaceCopySuggestions, placeCopyStyles, type PlaceCopyStyle } from "../lib/resonance/place-copy";
import type { AccountEnv } from "./host-api";

type AiBinding = { run: (model: string, input: unknown) => Promise<unknown> };
type PlaceCopyEnv = AccountEnv & { AI?: AiBinding; AI_MODEL?: string };

const MAX_TEXT = 600;
const DEFAULT_MODEL = "@cf/qwen/qwen1.5-14b-chat-awq";

function validText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function parseModelSuggestions(result: unknown) {
  const response = typeof result === "string" ? result : result && typeof result === "object" && "response" in result && typeof result.response === "string" ? result.response : "";
  if (!response) return null;
  const json = response.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? response;
  try {
    const parsed = JSON.parse(json) as unknown;
    const suggestions = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "suggestions" in parsed ? parsed.suggestions : null;
    if (!Array.isArray(suggestions)) return null;
    const clean = suggestions.flatMap(item => {
      if (!item || typeof item !== "object" || !("title" in item) || !("message" in item)) return [];
      const title = item.title, message = item.message;
      return validText(title, 40) && validText(message, MAX_TEXT) ? [{ title: title.trim(), message: message.trim() }] : [];
    });
    return clean.length >= 1 ? clean.slice(0, 3) : null;
  } catch {
    return null;
  }
}

export async function placeCopyApi(request: Request, env: PlaceCopyEnv) {
  let body: { track?: { track?: unknown; artist?: unknown }; style?: unknown; draft?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "INVALID_BODY" }, { status: 400 }); }
  const track = body?.track;
  const style = body?.style;
  if (!track || !validText(track.track, 120) || !validText(track.artist, 120) || !placeCopyStyles.includes(style as PlaceCopyStyle) || (body.draft !== undefined && typeof body.draft !== "string")) {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const input = { track: { track: track.track.trim(), artist: track.artist.trim() }, style: style as PlaceCopyStyle };
  if (env.AI) {
    try {
      const result = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
        messages: [
          { role: "system", content: "你是音乐地点留声的文案助手。只输出 JSON，格式为 {\"suggestions\":[{\"title\":\"不超过40字\",\"message\":\"不超过600字\"}]}。生成三条中文短文案，不写精确地址、联系方式、歌词，不虚构听众身份，不使用夸张营销语。" },
          { role: "user", content: JSON.stringify({ song: input.track.track, artist: input.track.artist, style: input.style, draft: typeof body.draft === "string" ? body.draft.slice(0, MAX_TEXT) : "" }) },
        ],
      });
      const suggestions = parseModelSuggestions(result);
      if (suggestions) return Response.json({ source: "ai", suggestions });
    } catch {
      // The local/template path keeps the experience usable when the optional AI binding is unavailable.
    }
  }
  return Response.json({ source: "template", suggestions: generatePlaceCopySuggestions(input) });
}
