import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { afterEach, expect, jest, test } from "@jest/globals";
import { useMediaKind } from "../src/features/inventory/media";

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
function MediaProbe({ uri }: { uri: string }) {
  const media = useMediaKind(uri);
  return <Text>{media.loading ? "loading" : media.kind}</Text>;
}

test("database PDF URLs inspect headers without downloading the file or sending cookies", async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/pdf" }) } as Response);
  global.fetch = fetchMock;
  await render(<MediaProbe uri="https://example.test/uploads/assets/id" />);
  await waitFor(() => expect(screen.getByText("pdf")).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith("https://example.test/uploads/assets/id", expect.objectContaining({ method: "HEAD", credentials: "omit" }));
});

test("known image extensions do not require a metadata request", async () => {
  const fetchMock = jest.fn<typeof fetch>(); global.fetch = fetchMock;
  await render(<MediaProbe uri="https://example.test/photo.png" />);
  expect(screen.getByText("image")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("failed MIME detection leaves a document fallback rather than guessing an image", async () => {
  global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
  await render(<MediaProbe uri="https://example.test/uploads/assets/id" />);
  await waitFor(() => expect(screen.getByText("unknown")).toBeTruthy());
});
