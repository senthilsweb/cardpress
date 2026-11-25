package service

import "sync"

// Event tells an open studio that something of a brand changed.
type Event struct {
	Type      string `json:"type"` // "draft"
	ProfileID string `json:"profileId"`
	DraftID   string `json:"draftId"`
	Revision  int    `json:"revision"`
}

const maxSubscribers = 200

// Hub passes events to the studios that are open, inside this one server process. A studio that falls behind misses
// events rather than holding up a write; it reads the server again when it reconnects.
type Hub struct {
	mu     sync.Mutex
	subs   map[chan Event]string // channel -> brand
	closed bool
}

// NewHub returns a Hub.
func NewHub() *Hub { return &Hub{subs: map[chan Event]string{}} }

// Subscribe returns a channel of a brand's events and the function that ends the subscription. The channel is closed
// when the hub closes. ok is false when no more can listen.
func (h *Hub) Subscribe(profileID string) (events <-chan Event, cancel func(), ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed || len(h.subs) >= maxSubscribers {
		return nil, func() {}, false
	}
	c := make(chan Event, 32)
	h.subs[c] = profileID
	return c, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if _, here := h.subs[c]; here {
			delete(h.subs, c)
			close(c)
		}
	}, true
}

// Publish sends an event to everyone listening for its brand. It never blocks. A nil hub does nothing.
func (h *Hub) Publish(e Event) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for c, brand := range h.subs {
		if brand == e.ProfileID {
			select {
			case c <- e:
			default:
			}
		}
	}
}

// Close ends every subscription, so the server can stop.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	for c := range h.subs {
		delete(h.subs, c)
		close(c)
	}
}
