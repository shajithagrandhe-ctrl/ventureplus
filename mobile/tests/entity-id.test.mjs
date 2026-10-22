import assert from "node:assert/strict";
import { test } from "node:test";
import { entityIdSchema } from "../../shared/entity-id.ts";
import { idSchema } from "../src/features/inventory/contracts.ts";
import { uuid as crmId } from "../src/features/crm/contracts.ts";
import { uuid as adminId } from "../src/features/admin/contracts.ts";

test("all mobile feature contracts accept UUID and preserved Mongo ObjectId identifiers", () => {
  for (const schema of [entityIdSchema, idSchema, crmId, adminId]) {
    for (const id of ["d9428888-122b-4e7d-9ab7-a2b6edbb1234", "507f1f77bcf86cd799439011"]) assert.equal(schema.parse(id), id);
    for (const id of ["../plots", "%2fadmin", "coords", "", ["507f1f77bcf86cd799439011"], null]) assert.equal(schema.safeParse(id).success, false);
  }
});
