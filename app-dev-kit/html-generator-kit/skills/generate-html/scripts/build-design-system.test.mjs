// Tests for build-design-system.mjs: the script that fills the CSS design-system templates from a
// compact design-values.json, replacing design-system-author's old "retype several hundred lines of
// CSS by hand" flow.
// Run with: node --test skills/generate-html/scripts/build-design-system.test.mjs

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildDesignSystem } from './build-design-system.mjs'

function baseValues(overrides = {}) {
  return {
    palette: { neutralHue: 240, neutralChroma: 0.01, primaryL: 0.55, primaryC: 0.15, primaryH: 165, accentH: 165 },
    radius: '0.625rem',
    shadowAlpha: 0.08,
    fonts: { body: "'Inter'", display: "'Space Grotesk'", import: "@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');" },
    density: { controlPy: '0.6rem', controlPx: '1rem', cellPy: '0.9rem', cellPx: '1.15rem', cardPad: '1.35rem', mainPadY: '2.5rem', mainPadX: '3rem' },
    motion: { durFast: '140ms', durBase: '220ms', durSlow: '360ms', liftY: '-2px' },
    signatureBlocks: [],
    layout: 'sidebar',
    designDirection: { archetype: 'modern SaaS', mood: 'calm', paletteNote: 'x', typeNote: 'y', densityLabel: 'comfortable', motionFeel: 'snappy', composition: ['dashboard: KPI strip'], voice: 'confident', emphasize: 'clarity' },
    ...overrides,
  }
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'build-design-system-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('full fill with no locked tokens leaves zero leftover ⟨...⟩ markers', () => {
  withTempDir((dir) => {
    const { report } = buildDesignSystem(baseValues(), dir)
    assert.equal(report.status, 'design-system-contract-ready')
    for (const file of ['css/tokens.css', 'css/base.css', 'css/components.css']) {
      const css = readFileSync(join(dir, file), 'utf8')
      assert.doesNotMatch(css, /⟨[^⟩]*⟩/, `${file} has a leftover slot marker`)
    }
  })
})

test('a lockedTokens entry appears verbatim in tokens.css and is not re-derived', () => {
  withTempDir((dir) => {
    const values = baseValues({ lockedTokens: { '--primary': '#0A3D62' } })
    const { report } = buildDesignSystem(values, dir)
    assert.equal(report.locked_applied, 1)
    const css = readFileSync(join(dir, 'css', 'tokens.css'), 'utf8')
    assert.match(css, /--primary: #0A3D62;/)
    // the templated oklch() expression for --primary must be gone from :root
    const rootBlock = css.slice(0, css.indexOf('.dark {'))
    assert.doesNotMatch(rootBlock, /--primary: oklch/)
  })
})

test('exactly the named signature blocks (and no others) are appended, 2 of 7', () => {
  withTempDir((dir) => {
    const values = baseValues({ signatureBlocks: ['bento', 'glass'] })
    const { report } = buildDesignSystem(values, dir)
    assert.deepEqual(report.signature_emitted, ['bento', 'glass'])
    const css = readFileSync(join(dir, 'css', 'components.css'), 'utf8')
    assert.match(css, /\.bento\s*\{/)
    assert.match(css, /\.surface-glass\s*\{/)
    // none of the other 5 blocks' signature classes leaked in
    assert.doesNotMatch(css, /\.text-gradient/)
    assert.doesNotMatch(css, /\.card-accent/)
    assert.doesNotMatch(css, /\.lede\b/)
    assert.doesNotMatch(css, /\.tab-row/)
  })
})

test('selecting more than 3 signature blocks is a hard failure', () => {
  withTempDir((dir) => {
    const values = baseValues({ signatureBlocks: ['bento', 'glass', 'gradient', 'editorial'] })
    assert.throws(() => buildDesignSystem(values, dir), /too many signature blocks/)
  })
})

test('selecting a signature block name that does not exist is a hard failure', () => {
  withTempDir((dir) => {
    const values = baseValues({ signatureBlocks: ['neon-glow'] })
    assert.throws(() => buildDesignSystem(values, dir), /does not exist under templates\/runtime\/css\/signature/)
  })
})

test('a missing required motion token is a hard failure', () => {
  withTempDir((dir) => {
    const values = baseValues()
    delete values.motion.liftY
    assert.throws(() => buildDesignSystem(values, dir), /missing required motion token: motion\.liftY/)
  })
})

test('a missing lockedTokens match is a hard failure (token name not found in tokens.css)', () => {
  withTempDir((dir) => {
    const values = baseValues({ lockedTokens: { '--not-a-real-token': '#fff' } })
    assert.throws(() => buildDesignSystem(values, dir), /lockedTokens entry not applied/)
  })
})

test('a missing required palette/density/font value is a hard failure', () => {
  withTempDir((dir) => {
    const values = baseValues()
    delete values.palette.primaryH
    assert.throws(() => buildDesignSystem(values, dir), /missing design value for ⟨PRIMARY_H⟩/)
  })
})

test('system-only fonts (no import) remove the ⟨FONT_IMPORT⟩ line entirely, no leftover line', () => {
  withTempDir((dir) => {
    const values = baseValues({ fonts: { body: "'Inter'", display: "'Inter'", import: '' } })
    buildDesignSystem(values, dir)
    const css = readFileSync(join(dir, 'css', 'base.css'), 'utf8')
    assert.doesNotMatch(css, /⟨FONT_IMPORT⟩/)
    assert.doesNotMatch(css, /@import/, 'should not emit an @import line when fonts.import is empty')
  })
})

test('the report shape matches what design-system-author.md is documented to relay', () => {
  withTempDir((dir) => {
    const { report } = buildDesignSystem(baseValues({ signatureBlocks: ['bento'] }), dir)
    assert.deepEqual(Object.keys(report).sort(), [
      'files', 'locked_applied', 'locked_missing', 'signature_emitted', 'signature_skipped', 'status',
    ].sort())
    assert.equal(report.status, 'design-system-contract-ready')
    assert.deepEqual(report.files, ['css/tokens.css', 'css/base.css', 'css/components.css', 'design-system-ref.md'])
    assert.ok(Array.isArray(report.locked_missing))
    assert.ok(Array.isArray(report.signature_skipped))
  })
})

test('design-system-ref.md lists only the emitted signature classes', () => {
  withTempDir((dir) => {
    buildDesignSystem(baseValues({ signatureBlocks: ['edge-accent'] }), dir)
    const ref = readFileSync(join(dir, 'design-system-ref.md'), 'utf8')
    assert.match(ref, /edge-accent/)
    assert.doesNotMatch(ref, /bento:/)
  })
})

test('design-system-ref.md JS load order points at vendored Alpine, not a jsdelivr CDN', () => {
  withTempDir((dir) => {
    buildDesignSystem(baseValues(), dir)
    const ref = readFileSync(join(dir, 'design-system-ref.md'), 'utf8')
    assert.doesNotMatch(ref, /cdn\.jsdelivr\.net/)
    assert.match(ref, /js\/vendor\/alpine\.min\.js/)
  })
})
