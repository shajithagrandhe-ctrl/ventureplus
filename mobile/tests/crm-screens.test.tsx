import { afterEach, expect, jest, test } from "@jest/globals";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CustomersList, CustomerCreate, CustomerEdit, CustomerDetail, LeadsList, LeadEdit } from "../src/features/crm/screens";
import { leadSchema } from "../src/features/crm/contracts";
import { mount, resetScreens, reply, page, customer, plot, id, unexpected } from "./screen-fixtures";
jest.mock("../src/auth/AuthProvider", () => ({ ...jest.requireActual<typeof import("../src/auth/AuthProvider")>("../src/auth/AuthProvider"), useAuth: jest.fn() }));
jest.mock("../src/features/crm/files", () => ({ shareExport: jest.fn() }));
afterEach(resetScreens);
const lead = leadSchema.parse({ id: id(700), plotId: plot.id, customerName: "Synthetic Lead", email: "lead@example.test",
  contactNumber: "1234567890", location: customer.location, uniqueId: "synthetic-lead", pricePerSqYard: 200,
  status: "NEW", notes: null, photoUrl: null, agentId: null, createdAt: customer.createdAt, updatedAt: customer.updatedAt });

// Allow cold React Native lazy module transforms on the first full CRM render.
test("customer loading resolves to the actual validated list, including empty state", async () => {
  let resolve!: (response: Response) => void;
  await mount(<CustomersList />, () => new Promise<Response>(done => { resolve = done; }));
  expect(screen.getByLabelText("Loading records")).toBeTruthy();
  resolve(page([]));
  expect(await screen.findByText("No records available")).toBeTruthy();
}, 30_000);
test("customer API errors support explicit refresh and recover without fabricated data", async () => {
  let failed = true;
  const { send } = await mount(<CustomersList />, () => failed ? reply(null, 500) : page([customer]));
  await screen.findByRole("button", { name: "Retry" }); failed = false;
  await fireEvent.press(screen.getByRole("button", { name: "Refresh records" }));
  await screen.findByText(customer.contactName); expect(send).toHaveBeenCalledTimes(2);
});
test("customer list collects server pages then paginates its displayed records", async () => {
  const rows = Array.from({ length: 31 }, (_, n) => ({ ...customer, id: id(100 + n), contactName: `Customer ${n + 1}` }));
  const { send } = await mount(<CustomersList />, url => {
    expect(url.pathname).toBe("/api/total-data");
    const n = Number(url.searchParams.get("page"));
    return page(rows.slice((n - 1) * 20, n * 20), n, 20, 31);
  });
  await screen.findByText("Customer 1"); expect(screen.queryByText("Customer 31")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Customer 31"); expect(screen.queryByText("Customer 1")).toBeNull();
  expect(send.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true);
});
test("malformed customer responses are rejected before records render", async () => {
  await mount(<CustomersList />, () => page([{ ...customer, budget: 42 }]));
  await screen.findByRole("button", { name: "Retry" }); expect(screen.queryByText(customer.contactName)).toBeNull();
});
test.each(["CUSTOMER", "AGENT"] as const)("%s cannot mount customer creation or trigger a write", async role => {
  const { send } = await mount(<CustomerCreate />, unexpected, role);
  expect(await screen.findByText("You do not have permission to access this screen.")).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
});
test("customer create posts the existing contract and refetches the active list", async () => {
  let rows: typeof customer[] = []; let reads = 0; let body: Record<string, unknown> | undefined;
  await mount(<><CustomersList /><View testID="customer-form"><CustomerCreate /></View></>, (url, init) => {
    expect(url.pathname).toBe("/api/total-data");
    if (init.method === "POST") { body = JSON.parse(init.body as string); rows = [{ ...customer, ...body }]; return reply(rows[0]); }
    reads++; return page(rows);
  });
  await screen.findByText("No records available");
  const form = within(screen.getByTestId("customer-form"));
  for (const [label, value] of [["Customer name", customer.contactName], ["Contact number", customer.contactNumber], ["Location", customer.location], ["Budget", "100"]]) await fireEvent.changeText(form.getByLabelText(label), value);
  await fireEvent.press(form.getByRole("button", { name: "Create customer record" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/crm/customers/${customer.id}`));
  await screen.findByText(customer.contactName); expect(reads).toBeGreaterThan(1);
  expect(body).toEqual(expect.objectContaining({ contactName: customer.contactName, budget: "100", status: "FOLLOWING_UP" }));
});
test("customer edit uses PUT and refreshes the visible budget", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: customer.id });
  let row = { ...customer }; let reads = 0; let method: string | undefined;
  await mount(<><CustomersList /><View testID="customer-form"><CustomerEdit /></View></>, (_url, init) => {
    if (init.method === "PUT") { method = init.method; row = { ...row, ...JSON.parse(init.body as string) }; return reply(row); }
    reads++; return page([row]);
  });
  const form = within(screen.getByTestId("customer-form"));
  await form.findByLabelText("Budget");
  const before = reads;
  await fireEvent.changeText(form.getByLabelText("Budget"), "900");
  await fireEvent.press(form.getByRole("button", { name: "Save customer record" }));
  await waitFor(() => expect(row.budget).toBe("900"));
  await waitFor(() => expect(reads).toBeGreaterThan(before)); expect(method).toBe("PUT");
});
test("customer deletion requires confirmation, uses DELETE, then refreshes the list", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: customer.id });
  let rows = [customer]; let reads = 0; let deleted = false;
  const confirm = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await mount(<><CustomersList /><CustomerDetail /></>, (url, init) => {
    if (init.method === "DELETE") { expect(url.pathname).toBe(`/api/total-data/${customer.id}`); deleted = true; rows = []; return reply(null); }
    reads++; return page(rows);
  });
  await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
  expect(deleted).toBe(false);
  const before = reads;
  const buttons = confirm.mock.calls[0][2]; const action = buttons?.find(button => button.style === "destructive");
  expect(action).toBeDefined(); action!.onPress!();
  await waitFor(() => expect(deleted).toBe(true));
  await screen.findByText("No records available"); expect(reads).toBeGreaterThan(before);
});
test("failed customer mutation reports the API error and does not refresh as a success", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: customer.id });
  let reads = 0;
  await mount(<CustomerEdit />, (_url, init) => { if (init.method === "PUT") return reply(null, 500); reads++; return page([customer]); });
  await fireEvent.press(await screen.findByRole("button", { name: "Save customer record" }));
  await screen.findByText("Request failed. Please try again."); expect(reads).toBe(1);
});
test("lead list recovers from an API error using the existing paginated /leads contract", async () => {
  let failed = true;
  const { send } = await mount(<LeadsList />, url => {
    expect(url.pathname).toBe("/api/leads");
    return failed ? reply(null, 500) : page([lead]);
  });
  await screen.findByRole("button", { name: "Retry" }); failed = false;
  await fireEvent.press(screen.getByRole("button", { name: "Refresh records" }));
  await screen.findByText(lead.customerName); expect(send).toHaveBeenCalledTimes(2);
});
test("lead edit sends only supported update fields and refreshes the active query", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: lead.id });
  let row = { ...lead }; let body: Record<string, unknown> | undefined; let reads = 0;
  await mount(<LeadEdit />, (url, init) => {
    if (init.method === "PUT") {
      expect(url.pathname).toBe(`/api/leads/${lead.id}`);
      body = JSON.parse(init.body as string); row = { ...row, ...body }; return reply(row);
    }
    expect(url.pathname).toBe("/api/leads"); reads++; return page([row]);
  });
  await screen.findByLabelText("Notes"); const before = reads;
  await fireEvent.changeText(screen.getByLabelText("Notes"), "Updated synthetic lead");
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(reads).toBeGreaterThan(before));
  expect(body).toEqual({ contactNumber: lead.contactNumber, location: lead.location, uniqueId: lead.uniqueId,
    pricePerSqYard: 200, status: "NEW", notes: "Updated synthetic lead" });
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/crm/leads/${lead.id}`));
});
