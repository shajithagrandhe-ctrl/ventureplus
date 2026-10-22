import { useState } from "react";
import { Pressable, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import * as SecureStore from "expo-secure-store";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";

const a = { id: "fixture-a", email: "a@example.test", displayName: "Account A", fullName: "Account A", role: "EMPLOYEE" };
const b = { ...a, id: "fixture-b", email: "b@example.test", displayName: "Account B", fullName: "Account B" };
const send = jest.fn<typeof fetch>(); const originalFetch = global.fetch;
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ success: status < 400, data, message: "Fixture" }) }) as Response;
let stored: string | null; let cache: QueryClient;
function Probe() {
  const auth = useAuth(); const [failure, setFailure] = useState("");
  const run = (work: () => Promise<unknown>) => { setFailure(""); void work().catch(error => setFailure(error.message)); };
  return <><Text>{auth.loading ? "Restoring" : auth.user?.displayName ?? "Signed out"}</Text>
    <Text testID="auth-error">{auth.error}</Text><Text testID="action-error">{failure}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Sign in A" onPress={() => run(() => auth.login({ email: a.email, password: "fixture-password", expectedRole: "EMPLOYEE" }))}><Text>Sign in A</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Sign in B" onPress={() => run(() => auth.login({ email: b.email, password: "fixture-password", expectedRole: "EMPLOYEE" }))}><Text>Sign in B</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Restore" onPress={() => run(auth.restore)}><Text>Restore</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Logout" onPress={() => run(auth.logout)}><Text>Logout</Text></Pressable></>;
}
async function mount() {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
}
beforeEach(() => {
  stored = null; send.mockReset(); global.fetch = send;
  jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async () => stored);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async (_key, token) => { stored = token; });
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockImplementation(async () => { stored = null; });
});
afterEach(async () => { await cleanup(); cache?.clear(); global.fetch = originalFetch; });

test.each([{}, { user: { ...a, role: "UNSUPPORTED" } }, { user: { ...a, email: "invalid" } }])("malformed /auth/me cannot restore a signed-in identity: %j", async data => {
  stored = "fixture-stored"; send.mockResolvedValue(response(data));
  await mount(); await screen.findByText("Signed out");
  expect(screen.getByTestId("auth-error").props.children).toBeTruthy();
  expect(screen.queryByText(a.displayName)).toBeNull();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(send.mock.calls[0][0]).toBe("https://fixture.example/api/auth/me");
});
test("Secure Store read failure is reported without sending an HTTP request", async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("Fixture storage read failed"));
  await mount(); await screen.findByText("Signed out");
  expect(screen.getByTestId("auth-error").props.children).toBe("Fixture storage read failed"); expect(send).not.toHaveBeenCalled();
});
test("Secure Store write failure prevents a successful-login identity from becoming active", async () => {
  send.mockResolvedValue(response({ user: a, token: "fixture-a-token" }));
  jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error("Fixture storage write failed"));
  await mount(); await screen.findByText("Signed out");
  await fireEvent.press(screen.getByRole("button", { name: "Sign in A" }));
  await screen.findByText("Fixture storage write failed"); expect(screen.queryByText(a.displayName)).toBeNull(); expect(stored).toBeNull();
});
test("token removal failure clears active identity but reports that persistent cleanup failed", async () => {
  stored = "fixture-a-token"; send.mockResolvedValue(response({ user: a }));
  await mount(); await screen.findByText(a.displayName);
  cache.setQueryData(["business", a.id, "private"], ["fixture-data"]);
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error("Fixture token removal failed"));
  await fireEvent.press(screen.getByRole("button", { name: "Logout" }));
  await screen.findByText("Fixture token removal failed"); expect(screen.getByText("Signed out")).toBeTruthy();
  expect(cache.getQueryData(["business", a.id, "private"])).toBeUndefined();
  // A failed OS write cannot prove deletion. Retain this limitation explicitly.
  expect(stored).toBe("fixture-a-token"); expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
});
test("expired session with failed token removal remains signed out and reports failure", async () => {
  stored = "fixture-expired"; send.mockResolvedValue(response(null, 401));
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error("Fixture expired-token removal failed"));
  await mount(); await screen.findByText("Signed out");
  // Existing limitation: the API client's catch normalizes onUnauthorized errors.
  // Do not mistake this message for proof that Secure Store deletion succeeded.
  expect(screen.getByTestId("auth-error").props.children).toBeTruthy();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled(); expect(stored).toBe("fixture-expired");
});
test("switching A to B replaces the token, clears A's data and ignores a late A profile response", async () => {
  let resolveProfile!: (value: Response) => void;
  send.mockImplementation(async (url, init) => {
    if (String(url).endsWith("/auth/me")) return new Promise<Response>(resolve => { resolveProfile = resolve; });
    const body = JSON.parse(init!.body as string);
    const next = body.email === a.email ? a : b;
    return response({ user: next, token: next.id + "-token" });
  });
  await mount(); await screen.findByText("Signed out");
  await fireEvent.press(screen.getByRole("button", { name: "Sign in A" })); await screen.findByText(a.displayName);
  cache.setQueryData(["business", a.id], ["private-a"]);
  await fireEvent.press(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(resolveProfile).toBeDefined());
  await fireEvent.press(screen.getByRole("button", { name: "Sign in B" }));
  await waitFor(() => expect(stored).toBe(b.id + "-token"));
  resolveProfile(response({ user: a })); await screen.findByText(b.displayName);
  expect(screen.queryByText(a.displayName)).toBeNull(); expect(cache.getQueryData(["business", a.id])).toBeUndefined();
  const loginCalls = send.mock.calls.filter(([url]) => String(url).endsWith("/auth/native/login"));
  expect(loginCalls).toHaveLength(2);
  expect(loginCalls[1][1]?.headers).not.toHaveProperty("Authorization");
});
