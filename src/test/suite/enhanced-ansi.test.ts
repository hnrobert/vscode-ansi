import * as assert from "assert";
import { Parser, AttributeFlags } from "../../ansi";

suite("Enhanced ANSI Parser Test Suite", () => {
  let parser: Parser;

  setup(() => {
    parser = new Parser();
  });

  test("should parse DEC private mode sequences", () => {
    const text = "\x1b[?1h\x1b[?25l\x1b[?1000h";
    const spans = parser.appendLine(text);

    // Should have 3 escape sequence spans
    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 3);

    // Check sequence lengths
    assert.strictEqual(escapeSpans[0].length, 5); // \x1b[?1h
    assert.strictEqual(escapeSpans[1].length, 6); // \x1b[?25l
    assert.strictEqual(escapeSpans[2].length, 8); // \x1b[?1000h
  });

  test("should parse cursor movement sequences", () => {
    const text = "\x1b[H\x1b[2;5H\x1b[5A\x1b[3C";
    const spans = parser.appendLine(text);

    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 4);

    // Check sequence lengths
    assert.strictEqual(escapeSpans[0].length, 3); // \x1b[H
    assert.strictEqual(escapeSpans[1].length, 6); // \x1b[2;5H
    assert.strictEqual(escapeSpans[2].length, 4); // \x1b[5A
    assert.strictEqual(escapeSpans[3].length, 4); // \x1b[3C
  });

  test("should parse OSC sequences", () => {
    const text = "\x1b]0;Window Title\x07\x1b]2;Title\x1b\\";
    const spans = parser.appendLine(text);

    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 2);

    // Check sequence lengths include terminators
    assert.strictEqual(escapeSpans[0].length, 17); // \x1b]0;Window Title\x07
    assert.strictEqual(escapeSpans[1].length, 11); // \x1b]2;Title\x1b\\
  });

  test("should parse non-CSI escape sequences", () => {
    const text = "\x1b(B\x1b(0\x1b)A";
    const spans = parser.appendLine(text);

    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 3);

    // All should be 2 characters long
    escapeSpans.forEach((span) => {
      assert.strictEqual(span.length, 2);
    });
  });

  test("should parse complex mixed sequences", () => {
    const text = "\x1b[?1h=\x1b[31m\x1b[1mBold Red\x1b[0m\x1b[?25l";
    const spans = parser.appendLine(text);

    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 5);

    // Should handle the mixed content correctly
    assert.ok(spans.length > 5); // Should have text spans too
  });

  test("should handle device status and attributes", () => {
    const text = "\x1b[6n\x1b[>c\x1b[!p";
    const spans = parser.appendLine(text);

    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 3);

    assert.strictEqual(escapeSpans[0].length, 4); // \x1b[6n
    assert.strictEqual(escapeSpans[1].length, 4); // \x1b[>c
    assert.strictEqual(escapeSpans[2].length, 4); // \x1b[!p
  });

  test("should preserve existing SGR functionality", () => {
    const text = "\x1b[31;1mRed Bold\x1b[0m";
    const spans = parser.appendLine(text);

    // Should still handle colors and formatting correctly
    const redBoldSpan = spans.find(
      (span) => span.attributeFlags & AttributeFlags.Bold && span.foregroundColor === ((1 << 24) | 1) // Red named color
    );
    assert.ok(redBoldSpan !== undefined);
  });

  test("should handle escape sequences with intermediate characters", () => {
    const text = '\x1b[!p\x1b[ q\x1b["q';
    const spans = parser.appendLine(text);

    const escapeSpans = spans.filter((span) => span.attributeFlags & AttributeFlags.EscapeSequence);
    assert.strictEqual(escapeSpans.length, 3);

    // Check that intermediate characters are included in length
    assert.strictEqual(escapeSpans[0].length, 4); // \x1b[!p
    assert.strictEqual(escapeSpans[1].length, 4); // \x1b[ q
    assert.strictEqual(escapeSpans[2].length, 4); // \x1b["q
  });
});
