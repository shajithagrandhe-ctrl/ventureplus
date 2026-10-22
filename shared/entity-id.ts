import { z } from "zod";

// MySQL records use UUIDs; imported Mongo records retain their ObjectId strings.
// Neither format allows path traversal or a reserved endpoint name.
export const entityIdSchema = z.union([z.string().uuid(), z.string().regex(/^[a-fA-F0-9]{24}$/)]);
