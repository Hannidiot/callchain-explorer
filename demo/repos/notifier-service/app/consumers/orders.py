import logging

from app.clients.customers import CustomerClient
from app.mailer import Mailer
from app.schemas import OrderCreatedEvent

logger = logging.getLogger(__name__)


async def handle_order_created(message) -> None:
    """Consumer entry point for the order.created topic."""
    event = OrderCreatedEvent.parse(message.value)
    customer = await CustomerClient.get(event.customer_id)

    if customer is None:
        logger.warning(
            "unknown customer %s for order %s",
            event.customer_id,
            event.order_id,
        )
        return

    await Mailer.send_order_confirmation(customer, event)
    logger.info("confirmation sent for order %s", event.order_id)
