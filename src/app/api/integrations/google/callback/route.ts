import { cookies } from "next/headers";
import { appOrigin, calendarOwner, unseal, callbackUrl, googleScopes, cookieOptions, googleCookie, googleToken, googleEmail, saveGoogleDataConnection, seal, stateCookie, authConfigured, IntegrationError } from "@/lib/integration-server";

export async function GET(request: Request) {
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const expected = jar.get(stateCookie)?.value;
  jar.delete(stateCookie);
  const expectedOwner = unseal(jar.get("pai-google-owner")?.value);
  jar.delete("pai-google-owner");
  const destination = new URL("/", appOrigin(request));
  let result = "failed";
  let reason = "unknown";
  if (expected && params.get("state") === expected) {
    if (params.has("error")) { result = "cancelled"; reason = "consent"; }
    else if (params.get("code")) {
      try {
        const owner = await calendarOwner();
        if (authConfigured() && !owner) { reason = "amaris-session"; throw new Error("Authentication required for Calendar authorization"); }
        if ((expectedOwner ?? "local") !== (owner ?? "local")) { reason = "account-changed"; throw new Error("Account changed during Calendar authorization"); }
        reason = "token";
        const token = await googleToken({ grant_type: "authorization_code", code: params.get("code")!, redirect_uri: callbackUrl(request) });
        if (!token.refresh_token) { reason = "refresh-token"; throw new Error("Google did not return offline access"); }
        const grantedScopes = token.scope?.split(" ").filter(Boolean) ?? [];
        const missingScopes = googleScopes.split(" ").filter(scope => !grantedScopes.includes(scope));
        if (missingScopes.length) {
          reason = "scopes";
          console.error("Google OAuth returned incomplete scopes", { missingScopes, grantedCount: grantedScopes.length });
          throw new Error("Google returned incomplete scopes");
        }
        {
          if (owner) {
            reason = "google-email";
            const email = await googleEmail(token.access_token);
            reason = "database";
            await saveGoogleDataConnection(email, token.refresh_token, token.scope!.split(" "));
          } else jar.set(googleCookie, seal(token.refresh_token), cookieOptions(request));
          result = "connected";
        }
      } catch (error) {
        if (error instanceof IntegrationError && error.status === 401) reason = "authorization";
        console.error("Google OAuth callback failed", { reason, status: error instanceof IntegrationError ? error.status : 500 });
      }
    }
  } else reason = "state";
  destination.searchParams.set("calendar", result);
  if (result !== "connected") destination.searchParams.set("calendar_error", reason);
  return Response.redirect(destination, 303);
}
