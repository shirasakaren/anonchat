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
