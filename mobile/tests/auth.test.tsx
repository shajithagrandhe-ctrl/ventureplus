import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text, Pressable } from "react-native";
import * as SecureStore from "expo-secure-store";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import Login from "../src/app/login";

const user = { id: "fixture", email: "employee@example.test", fullName: "Fixture Employee", displayName: "Employee", role: "EMPLOYEE" };
const originalFetch = global.fetch;
const send = jest.fn<typeof fetch>();
const reply = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status,
  json: async () => data }) as Response;

function Probe() {
  const auth = useAuth();
  return <><Text>{auth.loading ? "restoring" : auth.user ? `session:${auth.user.role}` : "signed-out"}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => { void auth.logout(); }}><Text>Log out</Text></Pressable>
  </>;
}
async function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={cache}><AuthProvider><Login /><Probe /></AuthProvider></QueryClientProvider>);
  return cache;
}
beforeEach(() => {
  send.mockReset(); global.fetch = send;
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockClear();
  jest.mocked(SecureStore.deleteItemAsync).mockClear();
});
afterEach(async () => { await cleanup(); global.fetch = originalFetch; });

async function fill() {
  await screen.findByText("signed-out");
  await fireEvent.changeText(screen.getByLabelText("Email address"), user.email);
  await fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
}

// React Native loads several native view modules lazily on the first render.
// Keep the cold-transform allowance local to this test, with all assertions intact.
test("real login form sends production-contract portal data and securely stores a successful session", async () => {
  send.mockResolvedValue(reply(200, { success: true, data: { user, token: "fixture-session" } }));
  await mount(); await fill();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in as Employee" }));
  await screen.findByText("session:EMPLOYEE");
  const [url, options] = send.mock.calls[0];
  expect(url).toBe("https://fixture.example/api/auth/native/login");
  expect(options?.credentials).toBe("omit");
  expect(JSON.parse(options?.body as string).expectedRole).toBe("EMPLOYEE");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("venture-plus-access-token", "fixture-session", { keychainAccessible: 1 });
  expect(screen.getByRole("button", { name: "Sign in as Employee" }).props.accessibilityState.disabled).toBe(false);
}, 30_000);

test("wrong password ends loading and never creates a session", async () => {
  send.mockResolvedValue(reply(401, { success: false, message: "Invalid email or password" }));
  await mount(); await fill();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in as Employee" }));
  await screen.findByText("Invalid email or password");
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sign in as Employee" }).props.accessibilityState.disabled).toBe(false);
});

test("network failure is readable, ends loading and allows another attempt", async () => {
  send.mockRejectedValue(new TypeError("Network request failed"));
  await mount(); await fill();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in as Employee" }));
  await screen.findByText("Cannot reach the server. Check your connection.");
  expect(screen.getByRole("button", { name: "Sign in as Employee" }).props.accessibilityState.disabled).toBe(false);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

test("a mismatched server role is rejected before persisting credentials", async () => {
  send.mockResolvedValue(reply(200, { success: true, data: { user: { ...user, role: "ADMIN" }, token: "fixture-session" } }));
  await mount(); await fill();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in as Employee" }));
  await screen.findByText(/Select the matching role/);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

test("restart restores only a server-validated session and offline logout still clears it", async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("restored-session");
  send.mockResolvedValueOnce(reply(200, { success: true, data: { user } }));
  await mount(); await screen.findByText("session:EMPLOYEE");
  expect(send.mock.calls[0][0]).toBe("https://fixture.example/api/auth/me");
  send.mockRejectedValueOnce(new TypeError("offline"));
  await fireEvent.press(screen.getByRole("button", { name: "Log out" }));
  await screen.findByText("signed-out");
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("venture-plus-access-token");
});

test("expired restored session is removed from secure storage", async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("expired-session");
  send.mockResolvedValue(reply(401, { success: false, message: "Invalid or expired token" }));
  await mount(); await screen.findByText("signed-out");
  await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("venture-plus-access-token"));
});
