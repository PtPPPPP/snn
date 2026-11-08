/** Single source for CSS, SVG and Canvas materials. Numeric colors are not class or status colors. */
import charcoal from './charcoal-v2.json' with { type: 'json' };

export const material = {
  background: charcoal.color.background, surface: '#1d1d1c', raised: '#252524', elevated: '#30302e',
  ink: charcoal.color.text.primary, secondary: charcoal.color.text.secondary, muted: charcoal.color.text.muted, rule: charcoal.color.border.default,
  wire: '#8d8d84', grid: '#343432', highlight: '#ffffff',
  class0: charcoal.color.class.zero, class1: charcoal.color.class.one, region0: '#1c1c1b', region1: '#242423',
} as const;

export const VALUE_COLOR_STOPS = charcoal.color.numeric.stops;

export const foundation = {
  'bg': material.background, 'surface-1': material.surface, 'surface-2': material.raised,
  'surface-3': material.elevated, 'text-primary': material.ink,
  'text-secondary': material.secondary, 'text-muted': material.muted,
  'border-subtle': material.grid, 'border-default': material.rule, 'border-active': material.wire,
  'accent': material.ink, 'accent-soft': material.elevated,
  'control-fill': material.ink, 'control-hover': material.highlight, 'control-ink': material.background,
  'status-success': material.ink, 'status-success-soft': material.raised,
  'status-error': '#e4afa7', 'status-error-soft': '#332725',
  'status-warning': '#e2cc72', 'status-warning-soft': '#332e20',
  'radius-1': '0px', 'radius-2': '0px', 'radius-3': '0px', 'radius-4': '0px',
  'space-1': 'calc(var(--snn-cw) * .5)', 'space-2': 'var(--snn-cw)',
  'space-3': 'calc(var(--snn-cw) * 1.5)', 'space-4': 'calc(var(--snn-cw) * 2)',
  'space-5': 'var(--snn-ch)', 'space-6': 'calc(var(--snn-cw) * 4)',
  'space-7': 'calc(var(--snn-ch) * 2)', 'space-8': 'calc(var(--snn-cw) * 8)',
  'space-9': 'calc(var(--snn-ch) * 4)', 'space-10': 'calc(var(--snn-cw) * 16)',
  'type-display': 'var(--snn-type-display)', 'type-h1': 'var(--snn-type-heading)',
  'type-h2': 'var(--snn-type-heading)', 'type-h3': 'var(--snn-type-subheading)',
  'type-large': 'var(--snn-type-body)', 'type-body': 'var(--snn-type-body)',
  'type-label': 'var(--snn-type-body)', 'type-caption': 'var(--snn-type-meta)',
  'font-geist-sans': charcoal.font.body, 'font-geist-mono': charcoal.font.mono,
  'motion-fast': '0ms', 'motion-panel': '0ms', 'motion-entrance': '0ms',
  'ease': 'linear',
  'shadow-button': 'none', 'shadow-surface': 'none', 'shadow-panel': 'none',
  'overlay-scrim': 'rgb(0 0 0 / 65%)',
  'opening-bg': material.background, 'opening-surface': material.surface, 'opening-ink': material.ink,
  'opening-secondary': material.secondary, 'opening-muted': material.muted,
  'opening-rule': material.rule, 'opening-wire': material.wire,
  'opening-class-0': material.class0, 'opening-class-1': material.class1,
  'opening-region-0': material.region0, 'opening-region-1': material.region1,
  'opening-space-1': 'var(--snn-cw)', 'opening-space-2': 'calc(var(--snn-cw) * 2)',
  'opening-space-3': 'var(--snn-ch)', 'opening-space-4': 'calc(var(--snn-ch) * 2)',
  'opening-space-5': 'calc(var(--snn-ch) * 3)',
  'opening-radius': '0px', 'opening-stroke': '1px', 'opening-control-height': 'var(--snn-control-size)',
  'opening-mono': 'var(--snn-font-mono)',
  'opening-body': 'var(--snn-type-body)', 'opening-label': 'var(--snn-type-body)', 'opening-meta': 'var(--snn-type-meta)',
  'opening-heading': 'var(--snn-type-display)', 'opening-line-height': 'var(--snn-leading)',
  'graph-stroke': '1px', 'graph-selection-stroke': '2px', 'graph-glyph-size': 'var(--snn-type-glyph)',
  'graph-zero': VALUE_COLOR_STOPS[2].color,
} as const;
