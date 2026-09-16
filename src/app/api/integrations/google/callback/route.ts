import { cookies } from "next/headers";
import { appOrigin, calendarOwner, unseal, callbackUrl, googleScopes, cookieOptions, googleCookie, googleToken, googleEmail, saveGoogleDataConnection, seal, stateCookie, authConfigured } from "@/lib/integration-server";

export async function GET(request: Request) {
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const expected = jar.get(stateCookie)?.value;
  jar.delete(stateCookie);
  const expectedOwner = unseal(jar.get("pai-google-owner")?.value);
  jar.delete("pai-google-owner");
  const destination = new URL("/", appOrigin(request));
  let result = "failed";
  if (expected && params.get("state") === expected) {
    if (params.has("error")) result = "cancelled";
    else if (params.get("code")) {
      try {
        const owner = await calendarOwner();
        if (authConfigured() && !owner) throw new Error("Authentication required for Calendar authorization");
        if ((expectedOwner ?? "local") !== (owner ?? "local")) throw new Error("Account changed during Calendar authorization");
        const token = await googleToken({ grant_type: "authorization_code", code: params.get("code")!, redirect_uri: callbackUrl(request) });
        if (token.refresh_token && googleScopes.split(" ").every(scope => token.scope?.split(" ").includes(scope))) {
          if (owner) {
            const email = await googleEmail(token.access_token);
            await saveGoogleDataConnection(email, token.refresh_token, token.scope!.split(" "));
          } else jar.set(googleCookie, seal(token.refresh_token), cookieOptions(request));
          result = "connected";
        }
      } catch { /* Report a generic outcome without putting credentials in the URL. */ }
    }
  }
  destination.searchParams.set("calendar", result);
  return Response.redirect(destination, 303);
}
