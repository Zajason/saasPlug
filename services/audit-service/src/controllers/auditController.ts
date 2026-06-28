import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../prisma/client.ts";

const listAuditSchema = z.object({
  eventType: z.string().optional(),
  routingKey: z.string().optional(),
  providerId: z.coerce.number().int().positive().optional(),
  actorUserId: z.coerce.number().int().positive().optional(),
  entityType: z.string().optional(),
  entityId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function serializeAuditEvent(event: any) {
  return {
    id: event.id,
    eventId: event.eventId,
    routingKey: event.routingKey,
    eventType: event.eventType,
    sourceService: event.sourceService,
    actorUserId: event.actorUserId ?? null,
    providerId: event.providerId ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    payloadJson: event.payloadJson,
    metadata: event.metadata ?? null,
    occurredAt: event.occurredAt.toISOString(),
    receivedAt: event.receivedAt.toISOString(),
  };
}

export const listAuditEvents = async (req: Request, res: Response) => {
  const parsed = listAuditSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

  try {
    const events = await prisma.auditEvent.findMany({
      where: {
        ...(parsed.data.eventType ? { eventType: parsed.data.eventType } : {}),
        ...(parsed.data.routingKey ? { routingKey: parsed.data.routingKey } : {}),
        ...(parsed.data.providerId ? { providerId: parsed.data.providerId } : {}),
        ...(parsed.data.actorUserId ? { actorUserId: parsed.data.actorUserId } : {}),
        ...(parsed.data.entityType ? { entityType: parsed.data.entityType } : {}),
        ...(parsed.data.entityId ? { entityId: parsed.data.entityId } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: parsed.data.limit,
    });

    return res.json({ auditEvents: events.map(serializeAuditEvent) });
  } catch (error) {
    console.error("listAuditEvents error:", error);
    return res.status(500).json({ error: "Failed to load audit events" });
  }
};
