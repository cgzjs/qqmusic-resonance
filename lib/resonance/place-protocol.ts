export const placeTypes = { metro: "地铁站", park: "公园", campus: "校园", street: "街角", other: "其他" } as const;
export type PlaceType = keyof typeof placeTypes;
export const placeContentTypes = ["text", "drawing", "ai"] as const;
export type PlaceContentType = (typeof placeContentTypes)[number];
export type MusicPlace = { id: string; name: string; type: PlaceType; latitude: number; longitude: number; count: number };
export type PlaceNote = { id: string; placeId: string; trackId: string; title: string; contentType: PlaceContentType; message: string; imageUrl?: string; createdAt: number; mine: boolean };
export type PlaceSnapshot = { places: MusicPlace[]; notes: PlaceNote[]; placeId: string | null };
export type PlaceCommand = { action: "leave" | "withdraw"; body: { id: string; trackId?: string; title?: string; contentType?: PlaceContentType; message?: string; imageUrl?: string } };
export type LocationFix = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export const PLACE_RADIUS_METERS = 500;
export const PLACE_IMAGE_MAX_LENGTH = 320_000;
export const DEMO_PLACE_LOCATION = { latitude: 28.214, longitude: 112.971, accuracy: 20 };
export const validCoordinates = (latitude: unknown, longitude: unknown) => typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 85 && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
export function placeDistance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}
