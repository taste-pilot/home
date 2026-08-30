import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMarkdown, ingestHtml, ingestText, kindForPath } from "../src/ingest/index.js";
import { serializeDocument } from "../src/semantic/serialize.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (p: string) => readFileSync(join(here, "..", "fixtures", p), "utf8");

describe("markdown ingestion", () => {
  it("matches the hand-authored expected document byte-for-byte", () => {
    const doc = ingestMarkdown(fixture("simple-article.md"), "./fixtures/simple-article.md");
    expect(serializeDocument(doc)).toBe(fixture("expected/simple-article.json"));
  });

  it("RED LINE: prose survives ingestion byte-identical", () => {
    const source = fixture("simple-article.md");
    const doc = ingestMarkdown(source, "x.md");
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.type === "paragraph") {
          expect(source).toContain(block.content.text);
        }
      }
    }
  });

  it("handles the long guide: tables, images, ordered lists, quotes", () => {
    const doc = ingestMarkdown(fixture("long-guide.md"), "x.md");
    expect(doc.metadata.title).toBe("The Working Writer's Guide to Publishing Without a Designer");
    const types = doc.sections.flatMap((s) => s.blocks.map((b) => b.type));
    expect(types).toContain("table");
    expect(types).toContain("image");
    expect(types).toContain("quote");
    const lists = doc.sections.flatMap((s) => s.blocks).filter((b) => b.type === "list");
    expect(lists.some((l) => l.type === "list" && l.ordered)).toBe(true);
    expect(lists.some((l) => l.type === "list" && !l.ordered)).toBe(true);
  });

  it("preserves emphasis and links as annotations without altering text", () => {
    const doc = ingestMarkdown(
      "# T\n\nRead *slowly* and see [the guide](https://example.com/g) for **more**.\n",
      "x.md",
    );
    const block = doc.sections[0]!.blocks[0]!;
    if (block.type !== "paragraph") throw new Error("expected paragraph");
    expect(block.content.text).toBe("Read slowly and see the guide for more.");
    expect(block.content.links).toEqual([{ start: 20, end: 29, href: "https://example.com/g" }]);
    expect(block.content.marks).toContainEqual({ start: 5, end: 11, kind: "em" });
    expect(block.content.marks).toContainEqual({ start: 34, end: 38, kind: "strong" });
  });

  it("extracts fenced code blocks verbatim", () => {
    const doc = ingestMarkdown("# T\n\n```js\nconst a = 1;\n```\n", "x.md");
    const block = doc.sections[0]!.blocks[0]!;
    expect(block.type).toBe("code");
    if (block.type !== "code") throw new Error("expected code");
    expect(block.language).toBe("js");
    expect(block.text).toBe("const a = 1;");
  });
});

describe("html ingestion", () => {
  const doc = ingestHtml(fixture("source-article.html"), "./fixtures/source-article.html");

  it("extracts title, author and language", () => {
    expect(doc.metadata.title).toBe("Field Notes on Slow Publishing");
    expect(doc.metadata.author).toBe("A. Reader");
    expect(doc.metadata.language).toBe("en");
  });

  it("splits sections on h2 and keeps semantic blocks", () => {
    expect(doc.sections.length).toBe(2);
    const second = doc.sections[1]!;
    expect(second.heading).toBe("Three observations");
    const types = second.blocks.map((b) => b.type);
    expect(types).toContain("list");
    expect(types).toContain("quote");
    expect(types).toContain("image");
    expect(types).toContain("caption");
  });

  it("keeps ordered lists ordered and captions attached to their image", () => {
    const blocks = doc.sections[1]!.blocks;
    const list = blocks.find((b) => b.type === "list");
    if (!list || list.type !== "list") throw new Error("no list");
    expect(list.ordered).toBe(true);
    expect(list.items.map((i) => i.text)).toEqual([
      "Readers finish what respects them.",
      "Ornament earns its place or leaves.",
      "A print edition is an interpretation, not an export.",
    ]);
    const image = blocks.find((b) => b.type === "image");
    const caption = blocks.find((b) => b.type === "caption");
    if (!image || !caption || caption.type !== "caption") throw new Error("missing");
    expect(caption.for).toBe(image.id);
    expect(caption.content.text).toBe("The press that started it all.");
  });

  it("preserves inline links with correct offsets", () => {
    const last = doc.sections[1]!.blocks.at(-1)!;
    if (last.type !== "paragraph") throw new Error("expected paragraph");
    const [link] = last.content.links;
    expect(link?.href).toBe("https://example.com/measure");
    expect(last.content.text.slice(link!.start, link!.end)).toBe("measure");
  });

  it("RED LINE: sanitizes scripts, navigation, popups and event handlers", () => {
    const serialized = serializeDocument(doc);
    expect(serialized).not.toContain("trackPageView");
    expect(serialized).not.toContain("Subscribe to our newsletter");
    expect(serialized).not.toContain("Home · Archive");
  });

  it("strips hostile markup while preserving the words", () => {
    const hostile = `<html><body><article>
      <h1>Safe Title</h1>
      <p onclick="steal()">Words <a href="javascript:alert(1)">stay</a> intact.</p>
      <iframe src="https://evil.example"></iframe>
      <script>document.location='https://evil.example'</script>
      <p>Second <strong>paragraph</strong>.</p>
    </article></body></html>`;
    const clean = ingestHtml(hostile, "hostile.html");
    const serialized = serializeDocument(clean);
    expect(serialized).not.toContain("steal");
    expect(serialized).not.toContain("evil.example");
    expect(serialized).not.toContain("javascript:");
    const first = clean.sections[0]!.blocks[0]!;
    if (first.type !== "paragraph") throw new Error("expected paragraph");
    expect(first.content.text).toBe("Words stay intact.");
    expect(first.content.links).toEqual([]);
  });
});

describe("text ingestion", () => {
  it("treats a short first line as the title and keeps paragraphs verbatim", () => {
    const doc = ingestText(
      "My Notes\n\nFirst paragraph line one.\nLine two.\n\nSecond.\n",
      "n.txt",
    );
    expect(doc.metadata.title).toBe("My Notes");
    const blocks = doc.sections[0]!.blocks;
    expect(blocks).toHaveLength(2);
    if (blocks[0]!.type !== "paragraph") throw new Error("expected paragraph");
    expect(blocks[0]!.content.text).toBe("First paragraph line one.\nLine two.");
  });
});

describe("source router", () => {
  it("maps extensions to kinds", () => {
    expect(kindForPath("a.md")).toBe("markdown");
    expect(kindForPath("a.html")).toBe("html");
    expect(kindForPath("a.txt")).toBe("text");
    expect(() => kindForPath("a.docx")).toThrow(/unsupported/);
  });
});

describe("statistic and callout conventions", () => {
  const blocks = (md: string) => ingestMarkdown(md, "x.md").sections[0]!.blocks;

  it("promotes STAT: into a statistic block", () => {
    const [block] = blocks("STAT: 38% — of readers abandon hard-to-read documents\n");
    expect(block).toEqual({
      id: "section-1-statistic-1",
      type: "statistic",
      value: "38%",
      label: "of readers abandon hard-to-read documents",
    });
  });

  it("promotes CALLOUT: and keeps the body's links and emphasis", () => {
    const [block] = blocks(
      "CALLOUT: The rule — Every section gets **one** visual, see [here](https://example.com).\n",
    );
    expect(block?.type).toBe("callout");
    if (block?.type !== "callout") throw new Error("expected a callout");
    expect(block.title).toBe("The rule");
    expect(block.content.text).toBe("Every section gets one visual, see here.");
    // Offsets are relative to the body, not to the original paragraph.
    const mark = block.content.marks[0]!;
    const link = block.content.links[0]!;
    expect(mark.kind).toBe("strong");
    expect(block.content.text.slice(mark.start, mark.end)).toBe("one");
    expect(link.href).toBe("https://example.com");
    expect(block.content.text.slice(link.start, link.end)).toBe("here");
  });

  it("reads a separator that the author wrapped across lines", () => {
    const [block] = blocks("STAT: 4 seconds —\nthe average time before a reader scrolls\n");
    expect(block).toMatchObject({
      type: "statistic",
      value: "4 seconds",
      label: "the average time before a reader scrolls",
    });
  });

  it("RED LINE: leaves prose alone when the em dash is missing", () => {
    const [block] = blocks("STAT: this is a sentence about statistics, not a statistic\n");
    expect(block?.type).toBe("paragraph");
    if (block?.type !== "paragraph") throw new Error("expected a paragraph");
    expect(block.content.text).toBe("STAT: this is a sentence about statistics, not a statistic");
  });

  it("only matches the prefix at the start of a paragraph", () => {
    const [block] = blocks("The label reads STAT: 38% — of readers, which is a quotation.\n");
    expect(block?.type).toBe("paragraph");
  });
});
