import type { Response } from "express";
import { createLead, deleteLead, listLeads, updateLead } from "../services/lead.service.js";
import { publishEvent } from "../realtime/events.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export const getLeadsByPlot = async (req: AuthenticatedRequest, res: Response) => {
  const result = await listLeads({
    plotId: req.params.plotId,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    requester: { role: req.user?.role, email: req.user?.email }
  });

  return res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    message: `Found ${result.data.length} leads`
  });
};

export const getLeads = async (req: AuthenticatedRequest, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
  const result = await listLeads({
    page,
    pageSize,
    requester: { role: req.user?.role, email: req.user?.email }
  });

  return res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    message: "Leads fetched"
  });
};

export const createLeadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const body = { ...(req.body || {}) };
  if (!body.agentId && req.user?.sub) body.agentId = req.user.sub;

  const lead = await createLead(body);
  await publishEvent("lead.created", { lead });
  await publishEvent("plot.updated", { plotId: lead.plotId });

  return res.status(201).json({
    success: true,
    data: lead,
    message: "Lead created successfully"
  });
};

export const updateLeadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const lead = await updateLead(req.params.leadId, req.body);
  await publishEvent("lead.updated", { lead });
  await publishEvent("plot.updated", { plotId: lead.plotId });

  return res.json({
    success: true,
    data: lead,
    message: "Lead updated successfully"
  });
};

export const deleteLeadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const lead = await deleteLead(req.params.leadId);
  await publishEvent("lead.deleted", { leadId: lead.id });
  await publishEvent("plot.updated", { plotId: lead.plotId });

  return res.json({
    success: true,
    message: "Lead deleted successfully"
  });
};
