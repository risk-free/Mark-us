import { LOCALES } from "@/i18n/locales";

import { getAdjacentPosts, getPost, posts, postsByDateDescending } from "./posts";

/**
 * Blog content store (ARCH-01 §491).
 *
 * Content is data, not markup, so the tests are about the data: every post must
 * be complete in all three locales (an incomplete post renders an empty heading
 * on that locale), slugs must be unique (they are the URL), and ordering must be
 * derived from the post's own date so builds are reproducible (M13.6).
 */

describe("post content", () => {
  it("has at least one post", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it("has unique slugs, because the slug is the URL", () => {
    const slugs = posts.map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(LOCALES)("has non-empty copy in %s for every post and section", (locale) => {
    for (const post of posts) {
      expect(post.title[locale].length).toBeGreaterThan(0);
      expect(post.description[locale].length).toBeGreaterThan(0);
      expect(post.keywords[locale].length).toBeGreaterThan(0);
      expect(post.sections.length).toBeGreaterThan(0);

      for (const section of post.sections) {
        expect(section.heading[locale].length).toBeGreaterThan(0);
        expect(section.paragraphs[locale].length).toBeGreaterThan(0);
      }
    }
  });

  it("uses an ISO date, not a locale-formatted one", () => {
    for (const post of posts) {
      expect(post.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${post.publishedAt}T00:00:00Z`))).toBe(false);
    }
  });

  it("orders newest first, deterministically", () => {
    const dates = postsByDateDescending.map((post) => post.publishedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    // Same input, same order, every machine, every build.
    expect(postsByDateDescending.map((p) => p.slug)).toEqual(
      postsByDateDescending.map((p) => p.slug),
    );
  });
});

describe("lookups", () => {
  it("finds a post by slug and returns undefined for an unknown one", () => {
    const [first] = postsByDateDescending;
    expect(first).toBeDefined();
    expect(getPost(first!.slug)?.slug).toBe(first!.slug);
    expect(getPost("no-such-post")).toBeUndefined();
  });

  it("walks neighbours without running off either end", () => {
    // Ordering is newest-first, so the newest post has no `next` and the oldest
    // has no `previous`.
    const [newest, ...rest] = postsByDateDescending;
    expect(getAdjacentPosts(newest!.slug).next).toBeUndefined();
    expect(getAdjacentPosts(newest!.slug).previous?.slug).toBe(rest[0]?.slug);

    const oldest = rest.at(-1) ?? newest!;
    expect(getAdjacentPosts(oldest.slug).previous).toBeUndefined();
    expect(getAdjacentPosts("no-such-post")).toEqual({});
  });
});
