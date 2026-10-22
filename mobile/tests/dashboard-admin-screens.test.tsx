import { afterEach, expect, jest, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import Home from "../src/app/home";
import { DirectoryRoute, EmployeeListRoute } from "../src/features/admin/screens";
import { mount, resetScreens, reply, stats, employee, unexpected } from "./screen-fixtures";
jest.mock("../src/auth/AuthProvider", () => ({ ...jest.requireActual<typeof import("../src/auth/AuthProvider")>("../src/auth/AuthProvider"), useAuth: jest.fn() }));
afterEach(resetScreens);

test("dashboard API failure is visible and refresh fetches validated statistics", async () => {
  let failed = true;
  const { send } = await mount(<Home />, url => { expect(url.pathname).toBe("/api/stats"); return reply(failed ? null : stats, failed ? 500 : 200); });
  await screen.findByRole("button", { name: "Retry" }); failed = false;
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("4 leads · 3 customer records"); expect(send).toHaveBeenCalledTimes(2);
});
test("dashboard rejects malformed statistics rather than displaying invalid counters", async () => {
  await mount(<Home />, () => reply({ ...stats, plots: "not a number" }));
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByText("4 leads · 3 customer records")).toBeNull();
});
test.each(["CUSTOMER", "AGENT"] as const)("dashboard does not request staff statistics for %s", async role => {
  const { send } = await mount(<Home />, unexpected, role);
  expect(screen.queryByText("Total plots")).toBeNull(); expect(send).not.toHaveBeenCalled();
});
test("employee directory handles API failure, refresh and response validation", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ kind: "employees" });
  let data: unknown = null; let status = 500;
  const { send } = await mount(<DirectoryRoute />, url => { expect(url.pathname).toBe("/api/employees"); return reply(data, status); });
  await screen.findByRole("button", { name: "Retry" });
  data = [{ ...employee, role: "ADMIN" }]; status = 200;
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByRole("button", { name: employee.displayName })).toBeNull();
  data = [employee];
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("button", { name: employee.displayName }); expect(send).toHaveBeenCalledTimes(3);
});
test.each(["EMPLOYEE", "CUSTOMER", "AGENT"] as const)("%s cannot fetch employee administration", async role => {
  const { send } = await mount(<EmployeeListRoute />, unexpected, role);
  expect(await screen.findByText("You do not have access to this screen.")).toBeTruthy(); expect(send).not.toHaveBeenCalled();
});
test("employee administration rejects malformed accounts and refreshes after an API failure", async () => {
  let data: unknown = null; let status = 500;
  const { send } = await mount(<EmployeeListRoute />, url => { expect(url.pathname).toBe("/api/employee-access/employees"); return reply(data, status); });
  await screen.findByRole("button", { name: "Retry" });
  status = 200; data = [{ ...employee, id: "invalid-id" }];
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByRole("button", { name: employee.displayName })).toBeNull();
  data = [employee];
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("button", { name: employee.displayName }); expect(send).toHaveBeenCalledTimes(3);
});
test("employee cannot fetch the administrator directory", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ kind: "admins" });
  const { send } = await mount(<DirectoryRoute />, unexpected, "EMPLOYEE");
  expect(await screen.findByText("You do not have access to this screen.")).toBeTruthy(); expect(send).not.toHaveBeenCalled();
});
