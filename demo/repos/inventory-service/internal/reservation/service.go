package reservation

import (
	"context"
	"fmt"
	"time"

	"github.com/example/inventory/internal/store"
)

// Service owns stock reservation: it checks availability and writes a
// reservation row inside one database transaction.
type Service struct {
	store *store.Store
	ttl   time.Duration
}

func (s *Service) Reserve(ctx context.Context, items []store.Item) (*store.Reservation, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("reserve: no items")
	}

	expiresAt := time.Now().Add(s.ttl)

	reservation, err := s.store.WithTx(ctx, func(tx *store.Tx) (*store.Reservation, error) {
		if err := tx.LockStock(ctx, items); err != nil {
			return nil, fmt.Errorf("lock stock: %w", err)
		}

		available, err := tx.Available(ctx, items)
		if err != nil {
			return nil, fmt.Errorf("check availability: %w", err)
		}
		if !available {
			return nil, store.ErrOutOfStock
		}

		return tx.InsertReservation(ctx, items, expiresAt)
	})

	if err != nil {
		return nil, fmt.Errorf("reserve: %w", err)
	}
	return reservation, nil
}
