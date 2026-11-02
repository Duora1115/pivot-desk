export type PopupMessage = { source: "grok-auth-popup"; token: string | null; error?: string };

type PopupEvent = { origin: string; source: unknown; data: unknown };

export function isPopupMessageFor(event: PopupEvent, origin: string, popup: Window): boolean {
  if (event.origin !== origin || event.source !== popup) return false;
  if (!event.data || typeof event.data !== "object") return false;
  const data = event.data as Partial<PopupMessage>;
  return data.source === "grok-auth-popup" && (typeof data.token === "string" || data.token === null);
}
