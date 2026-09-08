import { cookies } from "next/headers";
import { appOrigin, callbackUrl, calendarScope, calendarReadScope, cookieOptions, googleCookie, googleToken, seal, stateCookie } from "@/lib/integration-server";

export async function GET(request: Request) {
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const expected = jar.get(stateCookie)?.value;
  jar.delete(stateCookie);
  const destination = new URL("/", appOrigin(request));
  let result = "failed";
  if (expected && params.get("state") === expected) {
    if (params.has("error")) result = "cancelled";
    else if (params.get("code")) {
      try {
        const token = await googleToken({ grant_type: "authorization_code", code: params.get("code")!, redirect_uri: callbackUrl(request) });
        if (token.refresh_token && token.scope?.split(" ").some((scope) => scope === calendarScope || scope === calendarReadScope)) {
          jar.set(googleCookie, seal(token.refresh_token), cookieOptions(request));
          result = "connected";
        }
      } catch { /* Report a generic outcome without putting credentials in the URL. */ }
    }
  }
  destination.searchParams.set("calendar", result);
  return Response.redirect(destination, 303);
}
