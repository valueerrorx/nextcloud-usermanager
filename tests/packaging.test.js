import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_WINDOW_OPTIONS } from '../src/main/windowOptions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Parses the entries directly under `files:`; unsupported forms are reported as errors.
function parseFiles(yml) {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^files:\s*$/.test(l));
  const include = [];
  const exclude = [];
  const errors = [];
  if (start < 0) return { include, exclude, errors: ['files: block not found'] };
  let i = start + 1;
  for (; i < lines.length; i++) {
    const lineMatch = /^ {2}- (.*)$/.exec(lines[i]);
    if (!lineMatch) break;
    const entry = lineMatch[1].trim().replace(/^(['"])(.*)\1$/, '$2');
    const excludeMatch = /^!(.+)\/\*\*$/.exec(entry);
    const dirMatch = /^(.+)\/\*\*\/\*$/.exec(entry);
    if (excludeMatch && !/[*!]/.test(excludeMatch[1])) exclude.push(excludeMatch[1] + '/');
    else if (dirMatch && !/[*!]/.test(dirMatch[1])) include.push({ prefix: dirMatch[1] + '/' });
    else if (!/[*!?{}[\]]/.test(entry)) include.push({ exact: entry });
    else errors.push(`unsupported files entry: ${entry}`);
  }
  // an entry after a blank/comment line would be silently ignored
  for (; i < lines.length && !/^[A-Za-z_]\w*:/.test(lines[i]); i++) {
    if (/^ {2}- /.test(lines[i])) errors.push(`files entry after interruption: ${lines[i].trim()}`);
  }
  return { include, exclude, errors };
}

function isCovered(files, file) {
  const covered = files.include.some((e) => (e.exact ? e.exact === file : file.startsWith(e.prefix)));
  const excluded = files.exclude.some((p) => file.startsWith(p));
  return { covered, excluded };
}

function extractSpecifiers(text) {
  const specs = [];
  const errors = [];
  for (const re of [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g]) {
    for (const found of text.matchAll(re)) specs.push(found[1]);
  }
  const callLiteral = /\b(?:import|require)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let literalCalls = 0;
  for (const found of text.matchAll(callLiteral)) {
    specs.push(found[2]);
    literalCalls++;
  }
  const allCalls = [...text.matchAll(/\b(?:import|require)\s*\(/g)].length;
  if (allCalls > literalCalls) errors.push('non-literal import/require call');
  if (/\bfrom\s*`/.test(text)) errors.push('template literal specifier');
  return { specs, errors };
}

function buildGraph() {
  const errors = [];
  const importers = new Map();
  const mainAbs = path.resolve(ROOT, pkg.main);
  const preloadDir = path.join(ROOT, 'src/preload');
  const queue = [mainAbs];
  importers.set(mainAbs, 'package.json main');
  for (const f of fs.readdirSync(preloadDir, { recursive: true })) {
    const abs = path.join(preloadDir, f);
    if (fs.statSync(abs).isFile()) {
      queue.push(abs);
      importers.set(abs, 'src/preload');
    }
  }
  const visited = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!fs.existsSync(file)) {
      errors.push(`missing file ${rel(file)} (imported by ${importers.get(file)})`);
      continue;
    }
    const { specs, errors: specErrors } = extractSpecifiers(fs.readFileSync(file, 'utf8'));
    for (const e of specErrors) errors.push(`${e} in ${rel(file)}`);
    for (const spec of specs) {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = path.resolve(path.dirname(file), spec);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          errors.push(`unresolvable import '${spec}' in ${rel(file)}`);
          continue;
        }
        if (!importers.has(target)) importers.set(target, rel(file));
        queue.push(target);
      } else if (spec !== 'electron' && !spec.startsWith('node:')) {
        errors.push(`bare specifier '${spec}' not allowed in ${rel(file)} (node_modules is not packaged)`);
      }
    }
  }
  return { visited, importers, errors, mainAbs };
}

let graph;
let files;
beforeAll(() => {
  graph = buildGraph();
  files = parseFiles(fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8'));
});

describe('packaging guard', () => {
  it('has only supported files entries in electron-builder.yml', () => {
    expect(files.errors).toEqual([]);
    expect(files.include.length).toBeGreaterThan(0);
  });

  it('resolves every import of main and preload to a packable specifier', () => {
    expect(graph.errors).toEqual([]);
  });

  it('reaches shared modules (no empty traversal)', () => {
    const shared = [...graph.visited].map(rel).filter((f) => f.startsWith('src/shared/'));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('covers every reached file, package.json and main by files and no exclusion', () => {
    const targets = new Map();
    for (const abs of graph.visited) targets.set(rel(abs), graph.importers.get(abs));
    targets.set('package.json', 'electron-builder');
    targets.set(rel(graph.mainAbs), 'package.json main');
    const problems = [];
    for (const [file, by] of targets) {
      const { covered, excluded } = isCovered(files, file);
      if (!covered || excluded) {
        problems.push(`${file} is ${excluded ? 'excluded' : 'not covered'} by electron-builder.yml files (imported by ${by})`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('app icon packaging', () => {
  it('packs the runtime window icon and does not exclude it', () => {
    const file = rel(BROWSER_WINDOW_OPTIONS.icon);
    expect(file.startsWith('..')).toBe(false);
    const { covered, excluded } = isCovered(files, file);
    expect({ file, covered, excluded }).toEqual({ file, covered: true, excluded: false });
  });

  it('sets linux.icon to icons in electron-builder.yml', () => {
    const lines = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => /^linux:\s*$/.test(l));
    expect(start).toBeGreaterThanOrEqual(0);
    const block = [];
    for (let i = start + 1; i < lines.length && !/^\S/.test(lines[i]); i++) block.push(lines[i]);
    expect(block.some((l) => /^ {2}icon:\s*icons\s*$/.test(l))).toBe(true);
  });
});

describe('extractSpecifiers', () => {
  const ok = (text, specs) => {
    const r = extractSpecifiers(text);
    expect(r.errors).toEqual([]);
    expect(r.specs).toEqual(specs);
  };
  it('extracts export-from', () => ok("export * from './x.js';", ['./x.js']));
  it('extracts multi-line import-from', () => ok("import a, { b } from\n './x.js';", ['./x.js']));
  it('extracts side-effect import', () => ok("import './side.js';", ['./side.js']));
  it('extracts require with space before paren', () => ok("require ('./x.js')", ['./x.js']));
  it('extracts dynamic import with inner whitespace', () => ok("import( './x.js' )", ['./x.js']));
  it('extracts multi-line require', () => ok("require(\n './x.js'\n)", ['./x.js']));
  it('rejects concatenated require', () => {
    expect(extractSpecifiers("require('./a/' + n)").errors).not.toEqual([]);
  });
  it('rejects concatenated dynamic import', () => {
    expect(extractSpecifiers("import('./locales/' + lang)").errors).not.toEqual([]);
  });
  it('rejects template literal import', () => {
    expect(extractSpecifiers('import(`./x`)').errors).not.toEqual([]);
    expect(extractSpecifiers('import a from `./x`').errors).not.toEqual([]);
  });
  it('rejects a variable argument next to a literal one', () => {
    expect(extractSpecifiers("require('./a.js'); require(n)").errors).not.toEqual([]);
  });
});

describe('parseFiles and coverage', () => {
  const parse = (entries, tail = '') => parseFiles(`files:\n${entries.map((e) => `  - ${e}`).join('\n')}\n${tail}`);
  it('accepts the three supported forms', () => {
    const f = parse(['src/main/**/*', 'package.json', '"!node_modules/**"']);
    expect(f.errors).toEqual([]);
    expect(isCovered(f, 'src/main/a.js')).toEqual({ covered: true, excluded: false });
    expect(isCovered(f, 'package.json').covered).toBe(true);
    expect(isCovered(f, 'node_modules/x').excluded).toBe(true);
  });
  it('flags src/**/*.js as unsupported', () => {
    expect(parse(['src/**/*.js']).errors).not.toEqual([]);
  });
  it('flags a file-level exclusion as unsupported', () => {
    expect(parse(['!src/main/x.js']).errors).not.toEqual([]);
  });
  it('does not cover src/main/index.js with ./src/main/**/*', () => {
    const f = parse(['./src/main/**/*']);
    expect(f.errors.length > 0 || !isCovered(f, 'src/main/index.js').covered).toBe(true);
  });
  it('does not let prefix src/main/ cover src/mainX/a.js', () => {
    expect(isCovered(parse(['src/main/**/*']), 'src/mainX/a.js').covered).toBe(false);
  });
  it('errors on an entry after a blank line', () => {
    const f = parseFiles('files:\n  - src/main/**/*\n\n  - "!src/main/**"\nlinux:\n  target: x\n');
    expect(f.errors).not.toEqual([]);
  });
  it('errors on an entry after a comment line', () => {
    const f = parseFiles('files:\n  - a.js\n  # c\n  - b.js\n');
    expect(f.errors).not.toEqual([]);
  });
  it('ignores list entries of later top-level keys', () => {
    const f = parseFiles('files:\n  - a.js\nlinux:\n  - b\n');
    expect(f.errors).toEqual([]);
  });
});
