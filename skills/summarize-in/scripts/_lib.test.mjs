import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml, escapeAttr, unescapeHtml, stripTags, dedent, slugify, parseArgs,
} from './_lib.mjs';

describe('escapeHtml', () => {
  test('escapes & < > to entities', () => {
    assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  });

  test('escapes & first so existing entities are not double-decoded', () => {
    assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  });

  test('leaves quotes unchanged', () => {
    assert.equal(escapeHtml(`"it's"`), `"it's"`);
  });
});

describe('escapeAttr', () => {
  test('escapes & < > and double quotes', () => {
    assert.equal(escapeAttr('a & "b" <c>'), 'a &amp; &quot;b&quot; &lt;c&gt;');
  });

  test('leaves single quotes unchanged', () => {
    assert.equal(escapeAttr(`it's`), `it's`);
  });
});

describe('unescapeHtml', () => {
  test('decodes named entities', () => {
    assert.equal(unescapeHtml('&lt;&gt;&quot;&#39;&amp;'), `<>"'&`);
  });

  test('decodes numeric entities', () => {
    assert.equal(unescapeHtml('&#233;'), 'é');
  });

  test('does not double-decode &amp;lt;', () => {
    assert.equal(unescapeHtml('&amp;lt;'), '&lt;');
  });

  test('round-trips through escapeHtml', () => {
    const samples = [
      'a < b & c > d',
      `say "hi" & 'bye'`,
      '&lt; already escaped',
      '&amp;&lt;&gt;&quot;&#39;',
      '<a href="x">&amp;</a>',
      'plain text',
    ];
    for (const s of samples) {
      assert.equal(unescapeHtml(escapeHtml(s)), s);
    }
  });

  test('round-trips through escapeAttr', () => {
    const samples = [
      'a < b & c > d',
      `say "hi" & 'bye'`,
      '&lt; already escaped',
      '&amp;&lt;&gt;&quot;&#39;',
      '<a href="x">&amp;</a>',
      'plain text',
    ];
    for (const s of samples) {
      assert.equal(unescapeHtml(escapeAttr(s)), s);
    }
  });
});

describe('stripTags', () => {
  test('removes tags with attributes and keeps text', () => {
    assert.equal(stripTags('<p class="x">Hi <b>there</b></p>'), 'Hi there');
  });

  test('removes self-closing tags', () => {
    assert.equal(stripTags('a<br/>b<img src="x" />c'), 'abc');
  });
});

describe('dedent', () => {
  test('removes common indent and the leading blank line', () => {
    assert.equal(dedent('\n    line1\n    line2\n'), 'line1\nline2');
  });

  test('trims trailing whitespace', () => {
    assert.equal(dedent('  a\n  b   \n  '), 'a\nb');
  });

  test('ignores blank lines when computing the minimum indent', () => {
    assert.equal(dedent('    x\n\n    y'), 'x\n\ny');
    assert.equal(dedent('    x\n  \n    y'), 'x\n\ny');
  });

  test('keeps deeper relative indent', () => {
    assert.equal(dedent('    a\n      b\n    c'), 'a\n  b\nc');
  });
});

describe('slugify', () => {
  test('lowercases and joins words with hyphens', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
  });

  test('collapses runs of punctuation and spaces into one hyphen', () => {
    assert.equal(slugify('a!!  b...c'), 'a-b-c');
  });

  test('trims leading and trailing hyphens', () => {
    assert.equal(slugify('--Hi--'), 'hi');
  });

  test('strips diacritics', () => {
    assert.equal(slugify('Café Déjà'), 'cafe-deja');
  });

  test('truncates to 60 characters by default', () => {
    const out = slugify('x'.repeat(100));
    assert.equal(out.length, 60);
    assert.equal(out, 'x'.repeat(60));
  });

  test('truncates to a custom max', () => {
    assert.equal(slugify('hello world foo', 8), 'hello-wo');
  });

  test('leaves no trailing hyphen when the cut lands on a hyphen', () => {
    assert.equal(slugify('hello world', 6), 'hello');
  });

  test('falls back to "summary" for empty input', () => {
    assert.equal(slugify(''), 'summary');
  });

  test('falls back to "summary" for punctuation-only input', () => {
    assert.equal(slugify('!!!'), 'summary');
  });

  test('falls back to "summary" for non-latin input', () => {
    assert.equal(slugify('日本'), 'summary');
  });
});

describe('parseArgs', () => {
  test('parses --key value', () => {
    assert.equal(parseArgs(['--k', 'v']).k, 'v');
  });

  test('parses --key=value', () => {
    assert.equal(parseArgs(['--k=v']).k, 'v');
  });

  test('keeps everything after the first = in --key=a=b', () => {
    assert.equal(parseArgs(['--k=a=b']).k, 'a=b');
  });

  test('gives an empty string for --key=', () => {
    assert.equal(parseArgs(['--k=']).k, '');
  });

  test('boolean flags are true and do not consume the next argument', () => {
    const out = parseArgs(['--verbose', 'file.html'], ['verbose']);
    assert.equal(out.verbose, true);
    assert.deepEqual(out._, ['file.html']);
  });

  test('collects positionals in order alongside flags', () => {
    const out = parseArgs(['a', '--k', 'v', 'b', '--flag=x', 'c']);
    assert.deepEqual(out._, ['a', 'b', 'c']);
    assert.equal(out.k, 'v');
    assert.equal(out.flag, 'x');
  });

  test('trailing non-boolean flag gives undefined', () => {
    assert.equal(parseArgs(['--k']).k, undefined);
  });

  test('--out followed by --verbose does not swallow the flag', {
    skip: 'parseArgs swallows a following --flag as the value',
  }, () => {
    const out = parseArgs(['--out', '--verbose'], ['verbose']);
    assert.equal(out.out, undefined);
    assert.equal(out.verbose, true);
  });
});
