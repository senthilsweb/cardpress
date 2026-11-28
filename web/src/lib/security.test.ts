import { describe, expect, it } from "vitest";
import { minutesLabel, securityProblem, withValue, type SecuritySettings } from "./security";

const OK: SecuritySettings = { signupOpen: true, defaultRole: "editor", idleMinutes: 20, maxMinutes: 720, minPassword: 10, attempts: 5, pauseMinutes: 15 };

describe("security settings", () => {
  it("says times in words", () => {
    expect([20, 60, 720, 1440, 10080].map(minutesLabel)).toEqual(["20 minutes", "1 hour", "12 hours", "24 hours", "7 days"]);
  });
  it("keeps a configured time among the choices", () => {
    expect(withValue([5, 20], 12)).toEqual([5, 12, 20]);
    expect(withValue([5, 20], 20)).toEqual([5, 20]);
  });
  it("explains what cannot be saved", () => {
    expect(securityProblem(OK)).toBeNull();
    expect(securityProblem({ ...OK, minPassword: 8 })).toMatch(/shortest password/);
    expect(securityProblem({ ...OK, attempts: Number.NaN })).toMatch(/Failed sign-ins/);
    expect(securityProblem({ ...OK, maxMinutes: 15 })).toMatch(/longest sign-in/);
  });
});
