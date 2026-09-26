'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./register-typescript.cjs');
const { adaptColor, hasExplicitThemeColor, themeColor, themePalette } = require('../lib/theme-styles.ts');
const { colorModePreference } = require('../lib/color-mode.ts');

function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground, background) {
  const levels = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (levels[1] + 0.05) / (levels[0] + 0.05);
}

function sourceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test('all literal style colors on active screens have explicit theme assignments', () => {
  const roots = ['app', 'components', 'styles'].map(dir => path.join(__dirname, '..', dir));
  for (const file of roots.flatMap(sourceFiles)) {
    const source = fs.readFileSync(file, 'utf8');
    const pattern = /\b(backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|color):\s*['"](#[0-9a-f]{3,8}|rgba\([^'"\r\n]+\))['"]/gi;
    for (const match of source.matchAll(pattern)) {
      assert.ok(hasExplicitThemeColor(match[2], match[1]), `${path.relative(path.join(__dirname, '..'), file)}: ${match[1]} ${match[2]}`);
    }
  }
});

test('text roles meet the 4.5:1 design target on their light and dark surfaces', () => {
  for (const mode of ['dark', 'light']) {
    const p = themePalette[mode];
    for (const background of [p.canvas, p.surface, p.raised]) {
      for (const role of ['text', 'secondary', 'muted', 'accentText', 'successText', 'errorText', 'warningText', 'testnetText']) {
        assert.ok(contrast(p[role], background) >= 4.5,
          `${mode} ${role} on ${background}: ${contrast(p[role], background).toFixed(2)}:1`);
      }
    }
    assert.ok(contrast(p.onAccent, p.accentFill) >= 4.5);
    assert.ok(contrast(p.accentText, p.selected) >= 4.5,
      `${mode} selected amount label: ${contrast(p.accentText, p.selected).toFixed(2)}:1`);
    assert.ok(contrast(p.successText, p.successSurface) >= 4.5);
    assert.ok(contrast(p.warningText, p.warningSurface) >= 4.5);
    assert.ok(contrast(p.testnetText, p.testnetSurface) >= 4.5);
  }
});

test('known light colors resolve by role, unknown colors are never guessed', async () => {
  await colorModePreference.initialize({ getItem: async () => 'dark', setItem: async () => {} });
  await colorModePreference.setMode('light');
  assert.equal(adaptColor('#ffb000', 'color'), themeColor('accentText'));
  assert.equal(adaptColor('#ffb000', 'backgroundColor'), themeColor('accentFill'));
  assert.equal(adaptColor('#3a301c', 'backgroundColor'), themeColor('selected'));
  assert.equal(adaptColor('#123456', 'color'), '#123456');
  await colorModePreference.setMode('dark');
});

test('welcome wordmark has an explicit visible light variant', () => {
  const root = path.join(__dirname, '..');
  const welcome = fs.readFileSync(path.join(root, 'app/(auth)/login.tsx'), 'utf8');
  const darkMark = fs.readFileSync(path.join(root, 'assets/images/opago-wordmark.svg'), 'utf8');
  const lightMark = fs.readFileSync(path.join(root, 'assets/images/opago-wordmark-light.svg'), 'utf8');
  assert.match(welcome, /mode === 'light'[\s\S]*?opago-wordmark-light\.svg/);
  assert.match(darkMark, /fill="#ffffff"/);
  assert.match(lightMark, /fill="#18181d"/);
  assert.doesNotMatch(lightMark, /fill="#ffffff"/);
});
