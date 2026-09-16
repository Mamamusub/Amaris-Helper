import { cookies } from "next/headers";
import { authConfigured, checkOrigin, deleteGoogleDataConnection, failure, googleCookie, remoteFetch, calendarRefresh } from "@/lib/integration-server";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const token = authConfigured() ? await deleteGoogleDataConnection() : await calendarRefresh();
    if (!authConfigured()) jar.delete(googleCookie);
    let revoked = !token;
    if (token) {
      try {
        const response = await remoteFetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token }) });
        revoked = response.ok;
      } catch { /* Local disconnect succeeds even if Google cannot be reached. */ }
    }
    return Response.json({ message: revoked ? "Google Calendar disconnected." : "Disconnected on this browser. Remove access in your Google Account to finish revoking permission." });
  } catch (error) { return failure(error); }
}
