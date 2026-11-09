import { http } from "../lib/http";
import { track } from "../lib/analytics";
import type { Cart, Order } from "../types";

const CHECKOUT_ENDPOINT = "/orders";

/**
 * Converts the current cart into an order and hands it to the gateway.
 * The checkout button stays disabled until this promise settles.
 */
export async function submitOrder(cart: Cart): Promise<Order> {
  if (cart.items.length === 0) {
    throw new Error("cannot submit an empty cart");
  }

  const payload = {
    items: cart.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
    })),
    shippingAddress: cart.shippingAddress,
    paymentToken: cart.paymentToken,
  };

  track("checkout_submitted", { itemCount: payload.items.length });

  const order = await http.post<Order>(CHECKOUT_ENDPOINT, payload);

  track("checkout_accepted", { orderId: order.id });
  return order;
}
