import type { IcalCalendarFeed } from "./calendarTypes";

export function buildIcalRequestHeaders(feed: IcalCalendarFeed): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "text/calendar, application/calendar+ics, text/plain;q=0.8, */*;q=0.5"
  };

  if (feed.etag) {
    headers["If-None-Match"] = feed.etag;
  }
  if (feed.lastModified) {
    headers["If-Modified-Since"] = feed.lastModified;
  }

  return headers;
}

export function getIcalResponseHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function decodeIcalResponseText(response: { text?: string; arrayBuffer?: ArrayBuffer }): string {
  const buffer = response.arrayBuffer;
  if (buffer?.byteLength) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  return response.text || "";
}

export function icalResponseByteLength(response: { text?: string; arrayBuffer?: ArrayBuffer }): number {
  if (response.arrayBuffer?.byteLength) {
    return response.arrayBuffer.byteLength;
  }

  return calendarTextByteLength(response.text || "");
}

export function buildIcalResponseDiagnostics(
  response: { status?: number; text?: string; arrayBuffer?: ArrayBuffer },
  decodedText: string,
  contentType = "",
  parseError?: unknown
): string {
  const text = response.text || "";
  const parserName = parseError && typeof parseError === "object" && "name" in parseError
    ? String((parseError as { name?: unknown }).name || "Error")
    : undefined;
  const parts = [
    `status ${response.status ?? "unknown"}`,
    `type ${safeContentType(contentType)}`,
    `text ${text.length}`,
    `bytes ${response.arrayBuffer?.byteLength || 0}`,
    `decoded ${decodedText.length}`,
    `BEGIN ${decodedText.indexOf("BEGIN:VCALENDAR")}`,
    `END ${decodedText.lastIndexOf("END:VCALENDAR")}`
  ];

  if (parserName) {
    parts.push(`parser ${safeDiagnosticToken(parserName)}`);
  }

  return `Diagnostics: ${parts.join(", ")}.`;
}

export function calendarTextByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }

  return value.length;
}

function safeContentType(value: string): string {
  return safeDiagnosticToken((value || "unknown").split(";")[0] || "unknown");
}

function safeDiagnosticToken(value: string): string {
  const token = value.trim().replace(/[^A-Za-z0-9._/-]/g, "");
  return token.slice(0, 48) || "unknown";
}
