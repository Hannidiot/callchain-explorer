import json
from datetime import datetime, timezone

from app.schemas import Order


class EventBus:
    """Thin wrapper around the Kafka producer with domain-event helpers."""

    def __init__(self, producer, metrics):
        self._producer = producer
        self._metrics = metrics

    async def publish(self, topic: str, order: Order) -> None:
        event = {
            "type": topic,
            "orderId": order.id,
            "customerId": order.customer_id,
            "total": str(order.total),
            "occurredAt": datetime.now(timezone.utc).isoformat(),
        }
        await self._producer.send(topic, key=order.id, value=json.dumps(event))
        self._metrics.increment("events.published", tags={"topic": topic})
