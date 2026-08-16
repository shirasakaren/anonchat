// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMessageMarkdown } from "./markdown.js";

describe("renderMessageMarkdown code blocks", () => {
  it("highlights fenced blocks with a registered language", () => {
    const html = renderMessageMarkdown("```javascript\nconst x = 1;\n```");
    expect(html).toContain('class="hljs language-javascript"');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-number");
    expect(html).toContain("const");
  });

  it("resolves common fence aliases to a registered language", () => {
    const js = renderMessageMarkdown("```js\nconst x = 1;\n```");
    expect(js).toContain('class="hljs language-javascript"');
    expect(js).toContain("hljs-keyword");

    const ts = renderMessageMarkdown("```ts\nconst x: number = 1;\n```");
    expect(ts).toContain('class="hljs language-typescript"');

    const py = renderMessageMarkdown("```py\nprint('hi')\n```");
    expect(py).toContain('class="hljs language-python"');
    expect(py).toContain("hljs-built_in");
  });

  it("keeps unknown languages as escaped plaintext", () => {
    const html = renderMessageMarkdown("```cobol\n<div>x</div>\n```");
    expect(html).toContain('class="hljs language-plaintext"');
    expect(html).not.toContain("<div>");
    expect(html).toContain("&lt;div&gt;");
  });
});

describe("renderMessageMarkdown links", () => {
  it("linkifies a bare URL with a query string", () => {
    const html = renderMessageMarkdown("https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l");
    expect(html).toContain('href="https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l"');
  });

  it("keeps the real href when the message is already a markdown link (Tiptap autolink serialization)", () => {
    const html = renderMessageMarkdown(
      "[https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l](https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l)",
    );
    // Regression: a second linkify pass used to nest the href inside a new
    // link, producing href="[url](url)" which the browser then resolved
    // against the current route instead of opening the real URL.
    expect(html).toContain('href="https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l"');
    expect(html).not.toContain("href=&quot;");
    expect(html).not.toContain("%5B");
  });

  it("keeps a labeled markdown link's href intact", () => {
    const html = renderMessageMarkdown("[my video](https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l)");
    expect(html).toContain('href="https://youtu.be/LO7oifC5K8Y?si=2BiVdwKWYSZpwc8l"');
    expect(html).toContain("my video");
  });

  it("linkifies a bare URL sitting after a markdown link in the same text", () => {
    const html = renderMessageMarkdown("see [docs](https://example.com/a) and https://example.com/b");
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('href="https://example.com/b"');
  });
});
