import { describe, expect, it } from "vitest";
import { RateLimiter, limiterKey } from "../src/room";

describe("RateLimiter bounds", () => {
  it("never tracks more than the cap under a flood of distinct IPs", () => {
    const now = 1000;
    const rl = new RateLimiter(() => now, 5, 60_000, 50);
    for (let i = 0; i < 2000; i++) rl.fail(`10.0.${i >> 8}.${i & 255}`);
    expect(rl.size).toBeLessThanOrEqual(50);
    // newest survive, oldest were evicted
    for (let i = 0; i < 6; i++) rl.fail("10.9.9.9");
    expect(rl.isBlocked("10.9.9.9")).toBe(true);
  });

  it("keys IPv6 by /64 and leaves IPv4 and mapped addresses alone", () => {
    expect(limiterKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(limiterKey("2001:DB8:1:2::1"));
    expect(limiterKey("2001:db8:1:2::1")).not.toBe(limiterKey("2001:db8:1:3::1"));
    expect(limiterKey("::1")).toBe("0:0:0:0");
    expect(limiterKey("1.2.3.4")).toBe("1.2.3.4");
    expect(limiterKey("::ffff:1.2.3.4")).toBe("::ffff:1.2.3.4");
    expect(limiterKey("unknown")).toBe("unknown");
  });

  it("addresses in one /64 share a counter; a single IP still limits and recovers", () => {
    const clock = { t: 0 };
    const rl = new RateLimiter(() => clock.t);
    for (let i = 0; i < 6; i++) rl.fail(`2001:db8:0:0:${i}::1`);
    expect(rl.isBlocked("2001:db8::ffff")).toBe(true);
    expect(rl.isBlocked("2001:db8:0:1::1")).toBe(false);
    const rl2 = new RateLimiter(() => clock.t);
    for (let i = 0; i < 5; i++) rl2.fail("7.7.7.7");
    expect(rl2.isBlocked("7.7.7.7")).toBe(false);
    rl2.fail("7.7.7.7");
    expect(rl2.isBlocked("7.7.7.7")).toBe(true);
    clock.t += 60_001;
    expect(rl2.isBlocked("7.7.7.7")).toBe(false);
  });
});
