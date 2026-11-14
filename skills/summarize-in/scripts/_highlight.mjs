// Zero-dependency, build-time syntax highlighter. Emits <span class="t-x"> tokens:
//   t-k keyword · t-s string · t-c comment · t-n number/literal · t-f function/command
//   t-a attribute/key/variable · t-ins / t-del diff lines
// Accuracy target: "looks right in a summary", not a full parser.
import { escapeAttr as escapeHtml } from './_lib.mjs';

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

const S_DQ = String.raw`"(?:[^"\\\n]|\\.)*"`;
const S_SQ = String.raw`'(?:[^'\\\n]|\\.)*'`;
const S_BT = String.raw`\`(?:[^\`\\]|\\.)*\``;
const NUM = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)(?:[a-zA-Z]{0,3})\b`;
const C_LINE = String.raw`\/\/.*`;
const C_BLOCK = String.raw`\/\*[\s\S]*?(?:\*\/|$)`;
const HASH = String.raw`(?<=^|\s)#.*`;

const JS_KW = words(`async await break case catch class const continue debugger default delete do else export extends
  finally for from function get if import in instanceof let new of return set static super switch this throw try typeof
  var void while with yield as type interface enum implements declare namespace readonly keyof satisfies abstract
  private protected public`);
const C_KW = words(`auto break case char const continue default do double else enum extern float for goto if inline int
  long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool class
  namespace template typename public private protected virtual override new delete this using try catch throw nullptr
  constexpr include define ifdef ifndef endif pragma`);
const LANGS = {
  js: { kw: JS_KW, lit: words('true false null undefined NaN Infinity'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_BT, 's'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`@[\w.]+`, 'f']] },
  py: {
    kw: words(`and as assert async await break class continue def del elif else except finally for from global if import
      in is lambda nonlocal not or pass raise return try while with yield match case print self`),
    lit: words('True False None'),
    rules: [[HASH, 'c'], [String.raw`[rRbBfFuU]{0,2}"""[\s\S]*?(?:"""|$)`, 's'], [String.raw`[rRbBfFuU]{0,2}'''[\s\S]*?(?:'''|$)`, 's'],
      [String.raw`[rRbBfFuU]{0,2}` + S_DQ, 's'], [String.raw`[rRbBfFuU]{0,2}` + S_SQ, 's'], [String.raw`@[\w.]+`, 'f']],
  },
  sh: {
    kw: words('if then else elif fi for in do done case esac while until function return export local readonly set unset source alias exit'),
    lit: words('true false'),
    rules: [
      [HASH, 'c'], [S_DQ, 's'], [S_SQ, 's'],
      [String.raw`\$\{[^}\n]*\}|\$\(|\$[\w@#?*!$]+`, 'a'],
      [String.raw`(?<=\s)--?[A-Za-z][\w-]*`, 'a'],
      [String.raw`(?<=(?:^|[|;&(]|&&|\|\||\$\s|sudo\s)\s*)[A-Za-z_./][\w./-]*`, 'cmd'],
    ],
  },
  json: { kw: words(''), lit: words('true false null'), rules: [[C_LINE, 'c'], [C_BLOCK, 'c'], [S_DQ + String.raw`(?=\s*:)`, 'a'], [S_DQ, 's']] },
  yaml: {
    kw: words(''), lit: words('true false yes no on off null ~ True False Null'),
    rules: [[HASH, 'c'], [String.raw`(?<=^[ \t]*(?:- )?)[\w.\-/"' ]+?(?=:(?:\s|$))`, 'a'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`[&*][\w-]+`, 'f'], [String.raw`^---$`, 'c']],
  },
  toml: {
    kw: words(''), lit: words('true false'),
    rules: [[HASH, 'c'], [String.raw`^\s*\[\[?[^\]\n]+\]\]?`, 'k'], [String.raw`(?<=^\s*)[\w.\-"]+(?=\s*=)`, 'a'], [String.raw`"""[\s\S]*?"""`, 's'], [S_DQ, 's'], [S_SQ, 's']],
  },
  html: {
    kw: words(''), lit: words(''), noIdent: true,
    rules: [[String.raw`<!--[\s\S]*?(?:-->|$)`, 'c'], [String.raw`<!?\/?[\w:.-]+`, 'k'], [String.raw`\/?>`, 'k'], [String.raw`(?<=\s)[\w:.@-]+(?==)`, 'a'], [S_DQ, 's'], [S_SQ, 's']],
  },
  css: {
    kw: words(''), lit: words(''), noIdent: true,
    rules: [[C_BLOCK, 'c'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`@[\w-]+`, 'k'], [String.raw`!important`, 'k'],
      [String.raw`(?<=[{;]\s*)--?[\w-]+(?=\s*:)`, 'a'], [String.raw`#[\da-fA-F]{3,8}\b`, 'n'], [String.raw`[\w-]+(?=\()`, 'f'],
      [String.raw`-?\b\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|fr|in|pt|ch|deg)?\b`, 'n']],
  },
  sql: {
    kw: words(`select from where and or not insert into values update set delete create table index view drop alter add
      join left right inner outer full on as group by order having limit offset union all distinct case when then else
      end is null like in between exists primary key foreign references default with returning asc desc begin commit
      rollback transaction`),
    lit: words('true false null'), ci: true,
    rules: [[String.raw`--.*`, 'c'], [C_BLOCK, 'c'], [S_SQ, 's'], [S_DQ, 'a']],
  },
  go: { kw: words(`break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var`), lit: words('true false nil iota'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_BT, 's'], [S_DQ, 's'], [S_SQ, 's']] },
  rust: { kw: words(`as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while`), lit: words('true false None Some Ok Err'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_DQ, 's'], [String.raw`[\w]+!`, 'f'], [String.raw`#!?\[[^\]\n]*\]`, 'c']] },
  c: { kw: C_KW, lit: words('true false NULL'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`#\s*\w+`, 'k']] },
  java: { kw: words(`abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while var record`), lit: words('true false null'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`@\w+`, 'f']] },
  csharp: { kw: words(`abstract as async await base bool break case catch class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach get if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sealed set short sizeof static string struct switch this throw try typeof uint ulong using var virtual void while record`), lit: words('true false null'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [String.raw`[@$]?` + S_DQ, 's'], [S_SQ, 's']] },
  swift: { kw: words(`associatedtype class deinit enum extension func import init inout let operator protocol static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is rethrows throw throws try async await self Self some any`), lit: words('true false nil'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_DQ, 's'], [String.raw`@\w+`, 'f']] },
  kotlin: { kw: words(`as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor data enum finally get import init internal open override private protected public sealed set suspend`), lit: words('true false null'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`@\w+`, 'f']] },
  ruby: { kw: words(`alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require attr_accessor puts`), lit: words('true false nil'), rules: [[HASH, 'c'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`(?<![:\w]):\w+`, 'n'], [String.raw`@{1,2}\w+`, 'a']] },
  php: { kw: words(`abstract and array as break case catch class const continue declare default do echo else elseif empty endif extends final finally fn for foreach function global if implements include interface isset match namespace new or private protected public require return static switch throw trait try use var while yield`), lit: words('true false null TRUE FALSE NULL'), rules: [[C_BLOCK, 'c'], [C_LINE, 'c'], [HASH, 'c'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`\$\w+`, 'a'], [String.raw`<\?php|\?>`, 'k']] },
  diff: { kw: words(''), lit: words(''), noIdent: true, rules: [[String.raw`^(?:diff|index|---|\+\+\+).*`, 'c'], [String.raw`^@@.*`, 'f'], [String.raw`^\+.*`, 'ins'], [String.raw`^-.*`, 'del']] },
  dockerfile: { kw: words(''), lit: words(''), rules: [[HASH, 'c'], [String.raw`^\s*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b|\bAS\b`, 'k'], [S_DQ, 's'], [S_SQ, 's'], [String.raw`\$\{?\w+\}?`, 'a']] },
  text: { kw: words(''), lit: words(''), noIdent: true, rules: [] },
};
LANGS.cpp = LANGS.c;

const ALIASES = {
  javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js',
  python: 'py', python3: 'py',
  bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh', ps: 'sh', powershell: 'sh',
  jsonc: 'json', json5: 'json', yml: 'yaml', http: 'yaml', headers: 'yaml', ini: 'toml', xml: 'html', svg: 'html', vue: 'html',
  scss: 'css', less: 'css', golang: 'go', rs: 'rust', 'c++': 'cpp', h: 'c', hpp: 'cpp',
  cs: 'csharp', 'c#': 'csharp', kt: 'kotlin', rb: 'ruby', docker: 'dockerfile',
  patch: 'diff', txt: 'text', plain: 'text', plaintext: 'text', mermaid: 'text', none: 'text',
};

const compiled = new Map();
function compile(lang) {
  if (compiled.has(lang)) return compiled.get(lang);
  const def = LANGS[lang];
  const rules = def.rules.map(([src, cls]) => [new RegExp(src, 'ym'), cls]);
  rules.push([new RegExp(NUM, 'y'), 'n']);
  const c = { ...def, rules };
  compiled.set(lang, c);
  return c;
}

export function resolveLang(name) {
  const n = (name || 'text').toLowerCase().trim();
  const lang = ALIASES[n] ?? n;
  return LANGS[lang] ? lang : null;
}

/** Highlight plain source text and return escaped HTML. */
export function highlight(code, langName) {
  const lang = resolveLang(langName) ?? 'text';
  if (lang === 'text') return escapeHtml(code);
  const def = compile(lang);
  const ident = /[A-Za-z_$][\w$]*/y;
  let out = '';
  let plain = '';
  const flush = () => { out += escapeHtml(plain); plain = ''; };
  const emit = (cls, text) => { flush(); out += `<span class="t-${cls}">${escapeHtml(text)}</span>`; };
  let i = 0;
  outer: while (i < code.length) {
    for (const [re, cls] of def.rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length) {
        let c = cls;
        if (c === 'cmd') c = def.kw.has(m[0]) ? 'k' : 'f';
        emit(c, m[0]);
        i += m[0].length;
        continue outer;
      }
    }
    if (!def.noIdent) {
      ident.lastIndex = i;
      const m = ident.exec(code);
      if (m) {
        const w = m[0];
        const key = def.ci ? w.toLowerCase() : w;
        if (def.kw.has(key)) emit('k', w);
        else if (def.lit.has(key)) emit('n', w);
        else if (/^\s*\(/.test(code.slice(i + w.length, i + w.length + 8)) && lang !== 'sh') emit('f', w);
        else plain += w;
        i += w.length;
        continue;
      }
    }
    plain += code[i++];
  }
  flush();
  return out;
}
