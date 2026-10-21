type Options = {
  baseUrl: string;
  readCookie: () => string | null;
  fetch?: typeof fetch;
};

// Cookie-authenticated website requests. Native requests use bearer auth instead.
export function createCsrfFetch(options: Options) {
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  let pending: Promise<string> | undefined;
  let issuedToken: string | undefined;
  const acquire = (force = false): Promise<string> => {
    // All callers share the handshake so concurrent requests cannot rotate each
    // other's CSRF cookie before their mutations reach the server.
    if (pending) return pending;
    const current = options.readCookie() || issuedToken;
    if (!force && current) return Promise.resolve(current);
    pending = (async () => {
      const response = await send(`${options.baseUrl}/auth/csrf`, {
        credentials: "include", cache: "no-store"
      });
      if (!response.ok) throw new Error("Failed to obtain CSRF token");
      const payload = await response.json();
      const token = payload?.data?.token;
      if (payload?.success !== true || typeof token !== "string" || !token) {
        throw new Error("Invalid CSRF token response");
      }
      issuedToken = token;
      return token;
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
    const request = async (force = false) => {
      const headers = new Headers(init.headers);
      if (mutation) headers.set("x-csrf-token", await acquire(force));
      return send(`${options.baseUrl}${path}`, { ...init, headers, credentials: "include" });
    };
    const response = await request();
    if (mutation && response.status === 403) {
      let message: unknown;
      try { message = (await response.clone().json())?.message; } catch { /* Preserve non-JSON errors. */ }
      // This exact rejection occurs before the controller runs. Retry it once;
      // never replay a mutation rejected for role access or another failure.
      if (message === "Invalid CSRF token") return request(true);
    }
    return response;
  };
}
