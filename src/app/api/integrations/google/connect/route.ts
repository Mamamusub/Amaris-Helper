import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { appOrigin, callbackUrl, googleScopes, checkOrigin, cookieOptions, failure, googleConfigured, IntegrationError, stateCookie } from "@/lib/integration-server";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!googleConfigured()) throw new IntegrationError("Set up Google Calendar in .env.local first.", 503);
    const state = randomBytes(32).toString("base64url");
    (await cookies()).set(stateCookie, state, { ...cookieOptions(request), maxAge: 600 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(request), response_type: "code", scope: googleScopes, access_type: "offline", prompt: "consent select_account", state }).toString();
    return Response.json({ url: url.toString(), returnTo: appOrigin(request) });
  } catch (error) { return failure(error); }
}
