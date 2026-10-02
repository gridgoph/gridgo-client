import { readInvalidation } from "@/lib/live";

it("ignores staff desk resources the client app does not know", () => {
  expect(readInvalidation(JSON.stringify({ resource: "issue-reports" }))).toBeNull();
  expect(readInvalidation(JSON.stringify({ resource: "chat", id: "message-1" }))).toBeNull();
  expect(readInvalidation(JSON.stringify({ resource: "orders", id: "ord_1" }))).toEqual({
    resource: "orders",
    id: "ord_1",
  });
});
