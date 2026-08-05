import { describe, it, expect } from "vitest";
import { resolveSubdomain } from "./subdomain";

describe("resolveSubdomain", () => {
  it("returns null for the bare production domain", () => {
    expect(resolveSubdomain("millerstorm.tech")).toBeNull();
  });

  it("returns null for the bare production domain with a port", () => {
    expect(resolveSubdomain("millerstorm.tech:443")).toBeNull();
  });

  it("returns null for www", () => {
    expect(resolveSubdomain("www.millerstorm.tech")).toBeNull();
  });

  it("returns null for www with a port", () => {
    expect(resolveSubdomain("www.millerstorm.tech:443")).toBeNull();
  });

  it("extracts a genuine subdomain", () => {
    expect(resolveSubdomain("jett.millerstorm.tech")).toBe("jett");
  });

  it("extracts a genuine subdomain even with a port", () => {
    expect(resolveSubdomain("jett.millerstorm.tech:6790")).toBe("jett");
  });

  it("returns null for an IPv4 host", () => {
    expect(resolveSubdomain("127.0.0.1")).toBeNull();
  });

  it("returns null for an IPv4 host with a port", () => {
    expect(resolveSubdomain("127.0.0.1:6799")).toBeNull();
  });

  it("returns null for a production IP host with a port", () => {
    expect(resolveSubdomain("203.0.113.10:6790")).toBeNull();
  });

  it("returns null for localhost", () => {
    expect(resolveSubdomain("localhost")).toBeNull();
  });

  it("returns null for localhost with a port", () => {
    expect(resolveSubdomain("localhost:6799")).toBeNull();
  });

  it("returns null for a bracketed IPv6 host", () => {
    expect(resolveSubdomain("[::1]")).toBeNull();
  });

  it("returns null for a bracketed IPv6 host with a port", () => {
    expect(resolveSubdomain("[::1]:6799")).toBeNull();
  });

  it("returns null for a bracketed IPv6 host with an embedded IPv4 mapping", () => {
    expect(resolveSubdomain("[::ffff:192.168.1.1]:6799")).toBeNull();
  });

  it("returns null for an empty host", () => {
    expect(resolveSubdomain("")).toBeNull();
  });
});
