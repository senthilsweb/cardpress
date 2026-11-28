package service

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// commonPasswords are long enough to pass the length rule and are among the first an attacker tries. Compared without
// case, and without the digits and punctuation people add at the end.
var commonPasswords = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`password passwordpassword password1password p@ssword p@ssw0rd passw0rd qwertyuiop qwerty1234 qwertyqwerty
		1q2w3e4r5t 1qaz2wsx3edc asdfghjkl zxcvbnm123 iloveyou ilovemyself welcome welcome123 letmein letmein123 admin
		administrator adminadmin changeme changeme123 trustno1 sunshine princess football baseball superman starwars
		whatever computer internet monkey123 dragon123 abc123456 abcd1234 abcdefghij cardpress linkedin secret
		secretpassword mypassword newpassword default123 test123456 testtesttest`) {
		commonPasswords[w] = true
	}
}

// weakPassword says why a password is too easy to guess, or "".
func weakPassword(pw, email string) string {
	low := strings.ToLower(pw)
	base := strings.TrimRight(low, "0123456789!@#$%^&*()-_=+.?")
	switch {
	case commonPasswords[low] || commonPasswords[base]:
		return "that password is one of the common ones; choose another"
	case repeats(low):
		return "that password repeats itself; choose another"
	case sequence(low):
		return "that password is a simple sequence; choose another"
	}
	if name, _, ok := strings.Cut(strings.ToLower(email), "@"); ok && utf8.RuneCountInString(name) >= 4 && strings.Contains(low, name) {
		return "the password must not contain your email name"
	}
	return ""
}

// repeats reports a short piece written over and over, such as "aaaaaaaaaa" or "abcabcabcabc".
func repeats(s string) bool {
	r := []rune(s)
	for size := 1; size <= 4 && size*2 <= len(r); size++ {
		same := true
		for i := size; i < len(r); i++ {
			if r[i] != r[i-size] {
				same = false
				break
			}
		}
		if same {
			return true
		}
	}
	return false
}

// sequence reports a run of digits or letters, such as "1234567890" or "abcdefghijk".
func sequence(s string) bool {
	for _, run := range []string{strings.Repeat("1234567890", 4), strings.Repeat("0987654321", 4), "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba"} {
		if strings.Contains(run, s) {
			return true
		}
	}
	return false
}

func checkNewPassword(pw, email string, min int) error {
	n := utf8.RuneCountInString(pw)
	if n < min {
		return invalid("the password needs at least %d characters", min)
	}
	if n > maxPassword {
		return invalid("the password is too long (at most %d characters)", maxPassword)
	}
	if why := weakPassword(pw, email); why != "" {
		return invalid("%s", why)
	}
	return nil
}

// cheaper reports a stored hash made with less work than new ones are.
func cheaper(hash string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 {
		return false
	}
	var m, t, p uint32
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	return m < argonMemory || t < argonTime
}
