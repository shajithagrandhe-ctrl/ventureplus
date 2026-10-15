import type { Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { issueCsrfToken } from "../utils/csrf.js";
import { changeOwnPassword, createCustomerCredentials, loginUser, registerUser } from "../services/auth.service.js";
import { getUserById } from "../services/user.service.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/events.js";

const accessCookieOptions = {
  httpOnly: true,
  sameSite: env.cookieSameSite,
  secure: env.nodeEnv === "production",
  path: "/",
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
};

const loginFailure = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (["Invalid email or password", "Invalid admin code"].includes(message)) {
    return res.status(401).json({ success: false, message });
  }
  if (message === "Employee account is frozen") {
    return res.status(403).json({ success: false, message });
  }
  return res.status(500).json({ success: false, message: "Unable to sign in. Please try again later." });
};

export const getCsrfToken = (_req: Request, res: Response) => {
  const token = issueCsrfToken(res);
  return res.json({
    success: true,
    data: { token },
    message: "CSRF token issued"
  });
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, adminCode } = req.body;
    const { user, token } = await loginUser(email, password, adminCode);

    res.cookie(env.accessTokenCookieName, token, accessCookieOptions);
    issueCsrfToken(res);

    return res.json({
      success: true,
      data: { user },
      message: "Login successful"
    });
  } catch (error: unknown) {
    return loginFailure(res, error);
  }
};

export const nativeLogin = async (req: Request, res: Response) => {
  try {
    const { email, password, adminCode } = req.body;
    const { user, token } = await loginUser(email, password, adminCode);

    return res.json({
      success: true,
      data: { user, token },
      message: "Login successful"
    });
  } catch (error: unknown) {
    return loginFailure(res, error);
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, displayName, fullName, role, department, position, employeeId, phoneNumber, address } = req.body;

    const { user, token } = await registerUser({
      email,
      password,
      displayName,
      fullName,
      role: role as UserRole,
      department,
      position,
      employeeId,
      phoneNumber,
      address
    });

    res.cookie(env.accessTokenCookieName, token, accessCookieOptions);
    issueCsrfToken(res);
    await publishEvent("user.registered", { user });

    return res.status(201).json({
      success: true,
      data: { user },
      message: "Registration successful"
    });
  } catch (error: any) {
    const message = error?.message || "Registration failed";
    const status = message.toLowerCase().includes("email") ? 409 : 500;
    return res.status(status).json({
      success: false,
      message
    });
  }
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie(env.accessTokenCookieName, { path: "/" });
  res.clearCookie(env.csrfCookieName, { path: "/" });

  return res.json({
    success: true,
    message: "Logged out"
  });
};

export const me = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  const user = await getUserById(userId);

  return res.json({
    success: true,
    data: { user },
    message: "User profile"
  });
};

export const createCustomerAccount = async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user;
  if (!actor) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  try {
    const { email, password, displayName, fullName, phoneNumber, address } = req.body;
    const user = await createCustomerCredentials({
      email,
      password,
      displayName,
      fullName,
      phoneNumber,
      address
    });

    await publishEvent("user.registered", { user, createdBy: actor.sub });

    return res.status(201).json({
      success: true,
      data: { user },
      message: "Customer credentials created successfully"
    });
  } catch (error: any) {
    const message = error?.message || "Failed to create customer credentials";
    const status = message.toLowerCase().includes("email") ? 409 : 400;
    return res.status(status).json({
      success: false,
      message
    });
  }
};

export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  try {
    await changeOwnPassword({
      userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword
    });

    return res.json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error: any) {
    const message = error?.message || "Failed to change password";
    const normalized = message.toLowerCase();
    const status = normalized.includes("incorrect") || normalized.includes("not found") ? 400 : 500;
    return res.status(status).json({
      success: false,
      message
    });
  }
};
