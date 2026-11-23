// Package source fetches an article from a URL for the chat to work from.
//
// The server makes the request on a user's behalf, so it must never be usable to reach internal addresses (cloud
// metadata services, the local network, localhost). The check is made on the address actually dialled, after DNS, for
// every connection including each redirect, so a hostname that resolves to a private address, or one that changes its
// answer between lookups, is refused.
package source

import (
	"fmt"
	"net"
	"net/netip"
	"syscall"
)

// blockedPrefixes are address ranges that are not the public internet.
var blockedPrefixes = func() []netip.Prefix {
	var out []netip.Prefix
	for _, s := range []string{
		// IPv4
		"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
		"192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
		"203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
		// IPv6
		"::/128", "::1/128", "64:ff9b::/96", "64:ff9b:1::/48", "100::/64", "2001::/32", "2001:db8::/32", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8",
	} {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}()

// blockedReason says why an address may not be fetched, or "" if it may.
func blockedReason(a netip.Addr) string {
	a = a.Unmap() // ::ffff:127.0.0.1 is 127.0.0.1
	if !a.IsValid() {
		return "not a valid address"
	}
	for _, p := range blockedPrefixes {
		if p.Contains(a) {
			switch {
			case a.IsLoopback():
				return "a loopback address"
			case a.IsLinkLocalUnicast():
				return "a link-local address (such as a cloud metadata service)"
			default:
				return "a private or reserved address"
			}
		}
	}
	return ""
}

// allowedPort reports whether a port may be used: only the web's own.
func allowedPort(port string) bool { return port == "" || port == "80" || port == "443" }

// control is a net.Dialer Control hook. It sees the resolved address just before the connection is made.
func control(allowPrivate bool) func(network, address string, c syscall.RawConn) error {
	return func(network, address string, _ syscall.RawConn) error {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return fmt.Errorf("unreadable address %q", address)
		}
		if allowPrivate {
			return nil // tests against a local server only
		}
		if !allowedPort(port) {
			return fmt.Errorf("port %s is not allowed (only 80 and 443)", port)
		}
		a, err := netip.ParseAddr(host)
		if err != nil {
			return fmt.Errorf("unreadable address %q", host)
		}
		if why := blockedReason(a); why != "" {
			return fmt.Errorf("%s is %s", host, why)
		}
		return nil
	}
}
