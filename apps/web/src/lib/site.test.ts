import { absoluteUrl, isPlaceholderSiteUrl } from "./site";

describe("site url (M14.1)", () => {
  it("normalises the path to one absolute URL with no double slash", () => {
    expect(absoluteUrl("/")).toMatch(/\/$/);
    expect(absoluteUrl("")).toMatch(/\/$/);
    expect(absoluteUrl("about")).toMatch(/\/about$/);
    expect(absoluteUrl("/about")).toMatch(/\/about$/);
    expect(absoluteUrl("/about")).toBe(`${absoluteUrl("/").replace(/\/$/, "")}/about`);
  });

  it("flags the reserved placeholder domain so a production build can refuse it", () => {
    // The .com does not exist yet; a real-looking default would let a
    // misconfigured build publish canonicals to somebody else's domain.
    expect(isPlaceholderSiteUrl("https://markus.example")).toBe(true);
    expect(isPlaceholderSiteUrl("https://www.example.com")).toBe(false);
  });

  it("has a default that is the placeholder, not a guessed real domain", () => {
    // Guards the default specifically: if NEXT_PUBLIC_SITE_URL is unset at build
    // time the build must be visibly provisional.
    expect(isPlaceholderSiteUrl()).toBe(true);
  });
});