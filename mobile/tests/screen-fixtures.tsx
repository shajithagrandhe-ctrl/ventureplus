import type { ReactElement } from "react";
import { render, cleanup } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { jest } from "@jest/globals";
import { useAuth } from "../src/auth/AuthProvider";
import { createApiClient } from "../../shared/api-client";
import { locationSchema, ventureSchema, plotSchema, favoriteSchema } from "../src/features/inventory/contracts";
import { recordSchema } from "../src/features/crm/contracts";
import { directoryUserSchema } from "../src/features/admin/contracts";

export const id = (n: number) => n.toString(16).padStart(24, "0");
export const user = { id: id(900), email: "synthetic@example.test", displayName: "Synthetic Admin", fullName: "Synthetic Admin", role: "ADMIN" as const };
export const location = locationSchema.parse({ id: id(1), name: "Synthetic Location", ventures: [], availablePlots: 1 });
export const venture = ventureSchema.parse({ id: id(2), name: "Synthetic Venture", locationId: location.id, location });
export const plot = plotSchema.parse({ id: id(3), ventureId: venture.id, plotNumber: "P-1", status: "AVAILABLE", area: 100, pricePerSqYard: 200, venture });
export const favorite = favoriteSchema.parse({ id: id(4), plotId: plot.id, plot });
export const customer = recordSchema.parse({ id: id(5), contactName: "Synthetic Customer", contactNumber: "1234567890", location: location.name,
  budget: "100", interested: false, status: "FOLLOWING_UP", recordOwner: user.fullName, leadName: user.fullName, notes: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
export const employee = directoryUserSchema.parse({ id: id(6), email: "employee@example.test", displayName: "Synthetic Employee", fullName: "Synthetic Employee",
  role: "EMPLOYEE", department: null, position: null, employeeId: null, phoneNumber: null, address: null,
  createdAt: "2026-01-01T00:00:00.000Z", lastLogin: null, employeeProfile: null });
export const stats = { locations: 1, plots: 7, employees: 2, customers: 3, leads: 4, plotsByStatus: { available: 5, advance: 1, sold: 1 } };
export const reply = (data: unknown, status = 200, pagination?: unknown) => ({ ok: status >= 200 && status < 300, status,
  json: async () => ({ success: status < 400, data, message: status < 400 ? "Fixture" : "Fixture API failure", ...(pagination ? { pagination } : {}) }) }) as Response;
export const page = (rows: unknown[], number = 1, size = 100, total = rows.length) => reply(rows, 200,
  { page: number, pageSize: size, total, pageCount: Math.ceil(total / size) });
type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const caches: QueryClient[] = [];
const originalFetch = global.fetch;
export async function mount(element: ReactElement, handler: Handler, role: "ADMIN" | "EMPLOYEE" | "CUSTOMER" | "AGENT" = "ADMIN") {
  global.fetch = jest.fn<typeof fetch>(() => { throw new Error("Unmocked network request forbidden"); });
  const send = jest.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "https://fixture.example") throw new Error("Non-fixture URL forbidden");
    return handler(url, init ?? {});
  });
  const api = createApiClient({ baseUrl: "https://fixture.example/api", getToken: async () => "fixture-token", onUnauthorized: jest.fn(async () => {}), fetch: send });
  jest.mocked(useAuth).mockReturnValue({ user: { ...user, role }, api, loading: false, error: null,
    login: jest.fn() as ReturnType<typeof useAuth>["login"], logout: jest.fn(async () => {}), clear: jest.fn(async () => {}), restore: jest.fn(async () => {}) });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  const tree = <QueryClientProvider client={cache}>{element}</QueryClientProvider>;
  const view = await render(tree);
  return { ...view, send, cache };
}
export async function resetScreens() {
  await cleanup();
  caches.splice(0).forEach(cache => cache.clear());
  global.fetch = originalFetch;
  jest.restoreAllMocks();
}
export function unexpected(url: URL): never { throw new Error("Unexpected fixture request: " + url.pathname); }
