package service

import (
	"slices"
	"sync"
	"time"
)

// What every signed-in request needs (the session, the person and their roles, and how long a sign-in lasts) is kept in
// memory for a short time, so that it is not read from the database for each request.
//
// Anything that changes it forgets everything kept: such changes are rare, and forgetting too much only costs a few
// reads. The short life bounds how long a change made by another process (the command line, or a second server) can go
// unseen. The idle and longest times are still applied to every request.
const (
	// DefaultSessionCache is how long what was read is kept.
	DefaultSessionCache = 30 * time.Second
	maxCachedSessions   = 5000
)

type cachedSession struct {
	user        User
	began, last time.Time // last is the time of use as it is written in the database
	until       time.Time
}

type sessionCache struct {
	ttl time.Duration // 0: nothing is kept

	mu sync.Mutex
	// generation changes when everything is forgotten, so that a read begun before then is not kept.
	generation uint64
	sessions   map[string]cachedSession
	idle, max  time.Duration
	limitsTill time.Time
}

// mark is taken before reading the database, and handed back to keep what was read.
func (c *sessionCache) mark() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.generation
}

func (c *sessionCache) get(key string, now time.Time) (cachedSession, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.sessions[key]
	if !ok || !now.Before(e.until) {
		delete(c.sessions, key)
		return cachedSession{}, false
	}
	e.user = e.user.copy()
	return e, true
}

func (c *sessionCache) put(mark uint64, key string, e cachedSession, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ttl <= 0 || mark != c.generation {
		return
	}
	if c.sessions == nil || len(c.sessions) >= maxCachedSessions {
		c.sessions = map[string]cachedSession{}
	}
	e.user, e.until = e.user.copy(), now.Add(c.ttl)
	c.sessions[key] = e
}

// used records that the time of use has been written.
func (c *sessionCache) used(key string, at time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.sessions[key]; ok {
		e.last = at
		c.sessions[key] = e
	}
}

func (c *sessionCache) drop(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.sessions, key)
}

func (c *sessionCache) limits(now time.Time) (idle, max time.Duration, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.idle, c.max, now.Before(c.limitsTill)
}

func (c *sessionCache) keepLimits(mark uint64, idle, max time.Duration, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ttl > 0 && mark == c.generation {
		c.idle, c.max, c.limitsTill = idle, max, now.Add(c.ttl)
	}
}

func (c *sessionCache) forget() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.generation++
	c.sessions, c.limitsTill = nil, time.Time{}
}

// copy is the person with nothing shared with what is kept.
func (u User) copy() User {
	u.Roles = slices.Clone(u.Roles)
	return u
}
