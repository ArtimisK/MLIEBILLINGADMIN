// Google Calendar integration (blueprint §3/§5.1). Read-only.
// OAuth2 with a stored refresh token; gated entirely on env vars so the rest of
// the app compiles and runs without Google configured.

import { google } from "googleapis";

export interface RawCalendarEvent {
  id: string; // google event id
  title: string;
  start: Date;
  end: Date;
  /** confirmation signal derived from a calendar tag/color, if any (§12) */
  confirmed?: boolean;
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
}

/** Consent URL for the one-time OAuth flow (calendar read-only scope). */
export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

/** Fetch events for [start, end) from one calendar. Throws if not configured. */
export async function fetchEvents(
  calendarId: string,
  start: Date,
  end: Date,
): Promise<RawCalendarEvent[]> {
  if (!isGoogleConfigured()) {
    throw new Error(
      "Google Calendar is not configured. Fill GOOGLE_* values in .env (see .env.example).",
    );
  }

  const auth = getOAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const out: RawCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });

    for (const item of res.data.items ?? []) {
      const startStr = item.start?.dateTime ?? item.start?.date;
      const endStr = item.end?.dateTime ?? item.end?.date;
      if (!item.id || !startStr || !endStr) continue;
      out.push({
        id: item.id,
        title: item.summary ?? "",
        start: new Date(startStr),
        end: new Date(endStr),
        // colorId is a common confirmation convention; treat a set color as confirmed.
        confirmed: Boolean(item.colorId),
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}
