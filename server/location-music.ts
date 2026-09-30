import { audioTracks } from "../lib/resonance/demo-data";
import { UUID_PATTERN } from "../lib/resonance/room-protocol";
import { PLACE_IMAGE_MAX_LENGTH, PLACE_RADIUS_METERS, placeContentTypes, validCoordinates, placeDistance, type MusicPlace, type PlaceNote, type PlaceContentType, type PlaceType } from "../lib/resonance/place-protocol";

type Place = Omit<MusicPlace, "count">;
type Note = Omit<PlaceNote, "mine"> & { owner: string; withdrawn?: boolean };
type Wall = { seeded: boolean; places: Place[]; notes: Note[] };
const validText = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const validImage = (value: unknown) => typeof value === "string" && value.length <= PLACE_IMAGE_MAX_LENGTH && (/^\/assets\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|webp)$/i.test(value) || /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
function noteContent(body: Record<string, unknown>) {
  const contentType = (body.contentType ?? "text") as PlaceContentType;
  if (!placeContentTypes.includes(contentType)) return null;
  if (!validText(body.title, 40)) return null;
  if (contentType === "text") return validText(body.message, 600) ? { contentType, message: (body.message as string).trim(), imageUrl: undefined } : null;
  return validImage(body.imageUrl) ? { contentType, message: "", imageUrl: body.imageUrl as string } : null;
}

// NearbyArea serializes operations; separate object names isolate shared and solo place walls.
export async function locationMusic(request: Request, ctx: DurableObjectState): Promise<Response> {
  const actor = request.headers.get("X-Account-Id")!, url = new URL(request.url);
  const action = url.pathname.split("/").pop();
  const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const fail = (error: string, status = 409) => reply({ error }, status);
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try { body = await request.json(); } catch { return fail("INVALID_BODY", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || (action !== "nearby" && (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)))) return fail("INVALID_BODY", 400);
  }
  if (!validCoordinates(body.latitude, body.longitude) || typeof body.accuracy !== "number" || !Number.isFinite(body.accuracy) || body.accuracy < 0 || body.accuracy > PLACE_RADIUS_METERS || typeof body.timestamp !== "number" || !Number.isFinite(body.timestamp) || Math.abs(Date.now() - body.timestamp) > 120_000) return fail("LOCATION_REQUIRED", 400);
  const location = { latitude: body.latitude as number, longitude: body.longitude as number };
  const wall = await ctx.storage.get<Wall>("location-music") ?? { seeded: false, places: [], notes: [] };
  if (request.headers.get("X-Bottle-Demo") === "true" && !wall.seeded) {
    wall.seeded = true;
    const examples: { name: string; type: PlaceType; latitude: number; longitude: number; message: string }[] = [
      { name: "一号地铁站", type: "metro", latitude: 28.201, longitude: 112.976, message: "等下一班车的时候，刚好听到这首。留给也在赶路的你。" },
      { name: "湖畔公园", type: "park", latitude: 28.214, longitude: 112.971, message: "在长椅上坐了一会儿，风和这首歌都很温柔。" },
      { name: "旧街转角", type: "street", latitude: 28.207, longitude: 112.99, message: "如果你也经过这里，就让这首歌陪你再走一段。" },
    ];
    examples.forEach((example, index) => {
      const id = crypto.randomUUID();
      const { message, ...place } = example;
      wall.places.push({ id, ...place });
      if (audioTracks[index % audioTracks.length]) wall.notes.push({ id: crypto.randomUUID(), placeId: id, trackId: audioTracks[index % audioTracks.length].id, title: "留给路过的你", contentType: "text", message, createdAt: Date.now(), owner: "experience-listener" });
    });
  }
  let placeId: string | null = null;
  const nearbyPlaces = () => wall.places.filter(place => placeDistance(place, location) <= PLACE_RADIUS_METERS).sort((a, b) => placeDistance(a, location) - placeDistance(b, location));
  const snapshot = () => {
    const nearby = nearbyPlaces(), ids = new Set(nearby.map(place => place.id));
    return {
    places: nearby.map(place => ({ ...place, count: wall.notes.filter(note => note.placeId === place.id && !note.withdrawn).length })),
    placeId,
      notes: wall.notes.filter(note => ids.has(note.placeId) && !note.withdrawn).slice().reverse().map(note => ({ id: note.id, placeId: note.placeId, trackId: note.trackId, title: note.title, contentType: note.contentType ?? "text", message: note.message ?? "", ...(note.imageUrl ? { imageUrl: note.imageUrl } : {}), createdAt: note.createdAt, mine: note.owner === actor })),
    };
  };
  const save = async () => { await ctx.storage.put("location-music", wall); return reply(snapshot()); };
  if (action === "nearby") return save();
  if (action === "leave") {
    const content = noteContent(body);
    if (!audioTracks.some(track => track.id === body.trackId) || !content) return fail("INVALID_NOTE", 400);
    const previous = wall.notes.find(item => item.id === body.id);
    if (previous) return previous.owner === actor && previous.trackId === body.trackId && previous.title === (body.title as string).trim() && (previous.contentType ?? "text") === content.contentType && previous.message === content.message && previous.imageUrl === content.imageUrl ? save() : fail("REQUEST_CONFLICT");
    let anchor = nearbyPlaces().find(place => placeDistance(place, location) <= 150);
    if (!anchor) {
      if (wall.places.length >= 100) return fail("PLACE_LIMIT", 429);
      anchor = { id: crypto.randomUUID(), name: "附近留声", type: "other", latitude: Number(location.latitude.toFixed(3)), longitude: Number(location.longitude.toFixed(3)) };
      wall.places.push(anchor);
    }
    placeId = anchor.id;
    const note: Note = { id: body.id as string, placeId, owner: actor, trackId: body.trackId as string, title: (body.title as string).trim(), ...content, createdAt: Date.now() };
    if (wall.notes.length >= 1000 || wall.notes.filter(item => item.placeId === placeId && !item.withdrawn).length >= 100) return fail("NOTE_LIMIT", 429);
    if (wall.notes.some(item => item.owner === actor && Date.now() - item.createdAt < 30_000)) return fail("LEAVE_COOLDOWN", 429);
    wall.notes.push(note); return save();
  }
  if (action === "withdraw") {
    const note = wall.notes.find(item => item.id === body.id && item.owner === actor);
    if (!note) return fail("NOTE_NOT_FOUND", 404);
    note.withdrawn = true; placeId = note.placeId; return save();
  }
  return fail("NOT_FOUND", 404);
}
