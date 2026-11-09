from fastapi import APIRouter, Depends

from app.clients.inventory import InventoryClient
from app.events import EventBus
from app.repositories.orders import OrderRepository
from app.schemas import Order, OrderCreate

router = APIRouter(prefix="/internal/orders")


@router.post("", response_model=Order)
async def create_order(
    payload: OrderCreate,
    inventory: InventoryClient = Depends(),
    repository: OrderRepository = Depends(),
    events: EventBus = Depends(),
) -> Order:
    """Reserve stock, persist the order, then announce it."""
    reservation = await inventory.reserve(
        order_id=payload.order_id,
        sku_quantities=payload.sku_quantities,
    )

    order = await repository.save(payload, reservation)
    await events.publish("order.created", order)
    return order
