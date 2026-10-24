import { describe, it, expect } from "vitest";
import { supportTypeLabel } from "./categories";

describe("supportTypeLabel", () => {
  it("gives every current category its readable name, never the stored key", () => {
    expect(supportTypeLabel("billing")).toBe("Billing");
    expect(supportTypeLabel("draw_request")).toBe("Draw Request");
    expect(supportTypeLabel("tech")).toBe("Miller Storm Tech");
    expect(supportTypeLabel("msrr_tools")).toBe("MSRR Tools Issue");
  });

  it("still names tickets raised before categories existed", () => {
    expect(supportTypeLabel("bug")).toBe("Bug / Issue Fix");
    expect(supportTypeLabel("feature")).toBe("Request New Feature");
    expect(supportTypeLabel("other")).toBe("Other");
  });
});
