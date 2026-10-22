import { z } from "zod";
import { USER_ROLES } from "./contracts.ts";

export const userSchema = z.object({ id: z.string().min(1), email: z.string().email(),
  displayName: z.string(), fullName: z.string(), role: z.enum(USER_ROLES) }).passthrough();
export const nativeSessionSchema = z.object({ user: userSchema, token: z.string().min(1) });
