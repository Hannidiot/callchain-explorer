import { Router, type Request, type Response } from "express";

import { orderClient } from "../clients/orderClient";
import { rateLimit } from "../middleware/rateLimit";
import { validateOrderPayload } from "../validation/orderSchema";

export const ordersRouter = Router();

/**
 * Edge handler: validates the public payload, then forwards it to the
 * internal order service. The browser never reaches order-service directly.
 */
async function createOrderHandler(req: Request, res: Response) {
  const payload = validateOrderPayload(req.body);

  try {
    const order = await orderClient.createOrder(payload);
    res.status(201).json(order);
  } catch (error) {
    req.log.error({ err: error }, "order creation failed");
    res.status(502).json({ error: "order_service_unavailable" });
  }
}

ordersRouter.post(
  "/orders",
  rateLimit({ limit: 20, windowMs: 60_000 }),
  createOrderHandler,
);
