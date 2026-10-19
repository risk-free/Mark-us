import type { Locale } from "@/i18n/locales";
import { LOCALES } from "@/i18n/locales";

import corpusFreshness from "./posts/corpus-freshness.json";
import readingAScreeningResult from "./posts/reading-a-screening-result.json";

/**
 * Blog content store (ARCH-01 §491: "Marketing content, static copy | Git
 * (MDX/locale JSON) | RSC").
 *
 * Content is versioned in Git as per-locale JSON and loaded at build time, so a
 * copy change is a reviewable diff and the pages stay statically generated. Real
 * marketing copy can replace these files without touching a single component.
 */

type PostJson = typeof readingAScreeningResult;

/** Every user-visible string on a post is present in all three locales. */
type Localized<T> = { [K in Locale]: T };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`content/posts: ${message}`);
  }
}

function assertLocalized(
  value: unknown,
  path: string,
  isArrayOfStrings = false,
): void {
  assert(value !== null && typeof value === "object", `${path} must be an object`);
  const record = value as Record<string, unknown>;
  for (const locale of LOCALES) {
    const entry = record[locale];
    if (isArrayOfStrings) {
      assert(Array.isArray(entry), `${path}.${locale} must be an array`);
      assert(entry.length > 0, `${path}.${locale} must not be empty`);
      for (const [index, item] of (entry as unknown[]).entries()) {
        assert(typeof item === "string", `${path}.${locale}[${index}] must be a string`);
      }
    } else {
      assert(typeof entry === "string", `${path}.${locale} must be a string`);
      assert(entry.length > 0, `${path}.${locale} must not be empty`);
    }
  }
}

export interface PostSection {
  heading: Localized<string>;
  paragraphs: Localized<string[]>;
}

export interface Post {
  slug: string;
  publishedAt: string;
  author: string;
  readingMinutes: number;
  title: Localized<string>;
  description: Localized<string>;
  keywords: Localized<string[]>;
  sections: PostSection[];
}

/**
 * Content is validated at module load rather than at first render (M14.1): a
 * malformed post fails the build loudly instead of shipping a half-empty page.
 */
function validate(post: PostJson, index: number): Post {
  const path = `post[${index}] (${post.slug})`;
  assert(typeof post.slug === "string" && post.slug.length > 0, `${path}: slug is required`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(post.publishedAt), `${path}: publishedAt must be YYYY-MM-DD`);
  assert(Number.isInteger(post.readingMinutes), `${path}: readingMinutes must be an integer`);
  assert(Array.isArray(post.sections) && post.sections.length > 0, `${path}: sections is required`);
  assertLocalized(post.title, `${path}.title`);
  assertLocalized(post.description, `${path}.description`);
  assertLocalized(post.keywords, `${path}.keywords`, true);

  for (const [sectionIndex, section] of post.sections.entries()) {
    assertLocalized(section.heading, `${path}.sections[${sectionIndex}].heading`);
    assertLocalized(
      section.paragraphs,
      `${path}.sections[${sectionIndex}].paragraphs`,
      true,
    );
  }

  return post as unknown as Post;
}

const raw: readonly PostJson[] = [readingAScreeningResult, corpusFreshness];

export const posts: readonly Post[] = raw.map(validate);

/**
 * Newest first. Sorting is on the post's own `publishedAt` value rather than the
 * clock (M13.6), so the order is identical on every machine and every build.
 */
export const postsByDateDescending: readonly Post[] = [...posts].sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
);

export function getPost(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug);
}

export function getAdjacentPosts(slug: string): { previous?: Post; next?: Post } {
  const index = postsByDateDescending.findIndex((post) => post.slug === slug);
  if (index === -1) return {};
  return {
    next: postsByDateDescending[index - 1],
    previous: postsByDateDescending[index + 1],
  };
}