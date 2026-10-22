import { afterEach, expect, jest, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { InventoryIndex, VentureDetail, PlotDetail, CreateVenture, Favorites, InventoryGate } from "../src/features/inventory/screens";
import { mount, resetScreens, reply, page, location, venture, plot, favorite, id, unexpected } from "./screen-fixtures";
jest.mock("../src/auth/AuthProvider", () => ({ ...jest.requireActual<typeof import("../src/auth/AuthProvider")>("../src/auth/AuthProvider"), useAuth: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
afterEach(resetScreens);

// Match the existing login test's cold native-view transform allowance.
test("inventory shows loading until its HTTP fixture resolves, then renders validated records", async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(done => { resolve = done; });
  const { send } = await mount(<InventoryIndex />, () => pending);
  expect(screen.getByLabelText("Loading records")).toBeTruthy();
  resolve(reply([location]));
  expect(await screen.findByRole("button", { name: location.name })).toBeTruthy();
  expect(send.mock.calls[0][0]).toBe("https://fixture.example/api/locations");
}, 30_000);
test("empty inventory has no invented location records", async () => {
  await mount(<InventoryIndex />, () => reply([]));
  expect(await screen.findByText("No records available.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: location.name })).toBeNull();
});
test("inventory API failure offers retry and fetches the recovered response", async () => {
  let failed = true;
  const { send } = await mount(<InventoryIndex />, () => reply(failed ? null : [location], failed ? 500 : 200));
  await screen.findByRole("button", { name: "Retry" }); failed = false;
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("button", { name: location.name }); expect(send).toHaveBeenCalledTimes(2);
});
test("venture detail fetches its ID and paginates plots through server query parameters", async () => {
  const { send } = await mount(<VentureDetail id={venture.id} />, url => {
    if (url.pathname === `/api/ventures/${venture.id}`) return reply(venture);
    if (url.pathname === "/api/plots") {
      const number = Number(url.searchParams.get("page"));
      const rows = Array.from({ length: number === 1 ? 30 : 1 }, (_, n) => ({ ...plot,
        id: id(number * 100 + n), plotNumber: `Page ${number}-${n + 1}` }));
      return page(rows, number, 30, 31);
    }
    return unexpected(url);
  });
  await screen.findByRole("button", { name: "Open plot Page 1-1" });
  await fireEvent.press(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("button", { name: "Open plot Page 2-1" });
  expect(send.mock.calls.some(([url]) => String(url).includes(`ventureId=${venture.id}`) && String(url).includes("page=2"))).toBe(true);
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
});
test("plot update sends the supported fields and refreshes its detail after success", async () => {
  let row = { ...plot }; let reads = 0; let body: unknown;
  await mount(<PlotDetail id={plot.id} />, (url, init) => {
    if (url.pathname === "/api/favorites") return reply([]);
    if (url.pathname.endsWith("/leads")) return page([], 1, 30);
    if (url.pathname === `/api/plots/${plot.id}`) {
      if (init.method === "PUT") { body = JSON.parse(init.body as string); row = { ...row, ...(body as object) }; return reply(row); }
      reads++; return reply(row);
    }
    return unexpected(url);
  });
  await screen.findByLabelText("Area (sq yd)");
  await fireEvent.changeText(screen.getByLabelText("Area (sq yd)"), "250");
  await fireEvent.press(screen.getByRole("button", { name: "Save plot changes" }));
  await screen.findByText("Plot saved.");
  expect(body).toEqual({ plotNumber: "P-1", area: 250, pricePerSqYard: 200, status: "AVAILABLE" });
  await waitFor(() => expect(reads).toBeGreaterThan(1));
  expect(await screen.findByText("250 sq yd")).toBeTruthy();
});
test("venture creation posts validated numeric inputs to the existing endpoint", async () => {
  let body: unknown;
  await mount(<CreateVenture />, (url, init) => { expect(url.pathname).toBe("/api/ventures"); expect(init.method).toBe("POST"); body = JSON.parse(init.body as string); return reply(venture); });
  for (const [label, value] of [["Venture name", "Synthetic Venture"], ["Location name", location.name], ["Default area (sq yd)", "100"], ["Default price per sq yd", "200"]]) await fireEvent.changeText(screen.getByLabelText(label), value);
  await fireEvent.press(screen.getByRole("button", { name: "Create venture" }));
  await screen.findByText("Venture created");
  expect(body).toEqual(expect.objectContaining({ name: venture.name, defaultArea: 100, defaultPricePerSqYard: 200, plotCount: 1 }));
});
test("removing a saved plot uses DELETE and refetches the shortlist", async () => {
  let rows = [favorite]; let reads = 0;
  await mount(<Favorites />, (url, init) => {
    if (init.method === "DELETE") { expect(url.pathname).toBe(`/api/favorites/${plot.id}`); rows = []; return reply(null); }
    expect(url.pathname).toBe("/api/favorites"); reads++; return reply(rows);
  });
  await fireEvent.press(await screen.findByRole("button", { name: "Remove P-1" }));
  await screen.findByText("No records available."); expect(reads).toBeGreaterThan(1);
});
test("non-admin inventory gate never mounts venture creation or makes a request", async () => {
  const { send } = await mount(<InventoryGate admin><CreateVenture /></InventoryGate>, unexpected, "EMPLOYEE");
  expect(await screen.findByText("Administrator access required.")).toBeTruthy(); expect(send).not.toHaveBeenCalled();
});
test("failed saved-plot deletion preserves the visible record and does not refetch", async () => {
  let reads = 0;
  await mount(<Favorites />, (_url, init) => { if (init.method === "DELETE") return reply(null, 500); reads++; return reply([favorite]); });
  await fireEvent.press(await screen.findByRole("button", { name: "Remove P-1" }));
  await screen.findByText("Request failed. Please try again.");
  expect(screen.getByRole("button", { name: "Remove P-1" })).toBeTruthy(); expect(reads).toBe(1);
});
