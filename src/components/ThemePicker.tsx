import { useCallback, useRef, useState } from 'react';
import { isDarkColor, type CustomTheme } from '../customTheme';
import { THEMES, type ThemeId } from '../themes';
import { CheckIcon, ChevronIcon, EditIcon, PaletteIcon } from './Icons';
import { Popover } from './Popover';

interface Props {
  value: ThemeId;
  custom: CustomTheme;
  onChange: (id: ThemeId) => void;
  onCustomChange: (theme: CustomTheme) => void;
}

const BG_SUGGESTIONS = ['#121214', '#0e1322', '#1a2420', '#2a1e2e', '#f4efe6', '#eef0fb', '#fdf0f5', '#e8f4ec'];
const ACCENT_SUGGESTIONS = ['#f5c518', '#22c8d8', '#ff7a59', '#8b7cf6', '#4ade80', '#f472b6', '#3d8bfd', '#e11d48'];

function ColorField({
  label,
  value,
  suggestions,
  onChange,
}: {
  label: string;
  value: string;
  suggestions: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="color-field">
        <label className="color-well" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
        </label>
        <code className="color-hex">{value.toUpperCase()}</code>
      </div>
      <div className="swatches small">
        {suggestions.map((c) => (
          <button
            type="button"
            key={c}
            className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

export function ThemePicker({ value, custom, onChange, onCustomChange }: Props) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setEditing(false);
  }, []);

  const select = (id: ThemeId) => {
    onChange(id);
    close();
  };

  const startEditing = () => {
    onChange('custom');
    setEditing(true);
  };

  return (
    <>
      <button
        ref={anchor}
        className="clay-btn icon-btn"
        aria-label="Change theme"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <PaletteIcon />
      </button>

      <Popover anchor={anchor} open={open} onClose={close} className="theme-pop" align="end">
        {editing ? (
          <>
            <div className="pop-head">
              <button type="button" className="clay-btn icon-btn small" aria-label="Back to themes" onClick={() => setEditing(false)}>
                <ChevronIcon dir="left" width={16} height={16} />
              </button>
              <p className="pop-title">Create your theme</p>
            </div>

            <ColorField
              label="Base colour"
              value={custom.bg}
              suggestions={BG_SUGGESTIONS}
              onChange={(bg) => onCustomChange({ ...custom, bg })}
            />
            <ColorField
              label="Accent colour"
              value={custom.accent}
              suggestions={ACCENT_SUGGESTIONS}
              onChange={(accent) => onCustomChange({ ...custom, accent })}
            />

            <p className="pop-hint">
              {isDarkColor(custom.bg) ? '🌙 Dark base — dark mode is applied.' : '☀️ Light base — light mode is applied.'}
            </p>

            <button type="button" className="clay-btn primary pop-done" onClick={close}>Done</button>
          </>
        ) : (
          <>
            <p className="pop-title">Theme</p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-option ${t.id === value ? 'active' : ''}`}
                onClick={() => select(t.id)}
              >
                <span className="theme-swatch" style={{ background: t.colors[0] }}>
                  <i style={{ background: t.colors[1] }} />
                  <i style={{ background: t.colors[2] }} />
                </span>
                <span className="theme-name">{t.name}</span>
                {t.id === value && <CheckIcon width={18} height={18} />}
              </button>
            ))}

            <div className="pop-divider" />

            <div className={`theme-option custom ${value === 'custom' ? 'active' : ''}`}>
              <button type="button" className="theme-option-main" onClick={() => select('custom')}>
                <span className="theme-swatch" style={{ background: custom.bg }}>
                  <i style={{ background: custom.accent }} />
                </span>
                <span className="theme-name">My theme</span>
                {value === 'custom' && <CheckIcon width={18} height={18} />}
              </button>
              <button type="button" className="clay-btn icon-btn small" aria-label="Create or edit custom theme" onClick={startEditing}>
                <EditIcon width={15} height={15} />
              </button>
            </div>
          </>
        )}
      </Popover>
    </>
  );
}
