import { useState } from 'react';
import { PEN_COLORS } from '../ink/inkStyle.js';
import { FONTS, fontFamily } from './fonts.js';
import { stepSize } from './useTextStyle.js';
import '../ink/ink.css';
import './text.css';

/**
 * Font, size, bold, italic and color for text boxes (pages and boards).
 *   style:    { font, size, color, bold, italic } of the text being edited,
 *             or of new text
 *   onChange: (fields) => void
 * Tapping here doesn't take the keyboard away from the text you're typing.
 */
export function TextOptions({ style, onChange }) {
  const [fontsOpen, setFontsOpen] = useState(false);
  const font = FONTS.find((f) => f.id === style.font) ?? FONTS[0];
  const keepFocus = (e) => e.preventDefault();

  return (
    <div className="text-options" onPointerDown={keepFocus} onMouseDown={keepFocus}>
      <div className="font-picker">
        <button
          className={`font-button ${fontsOpen ? 'on' : ''}`}
          style={{ fontFamily: font.family }}
          onClick={() => setFontsOpen(!fontsOpen)}
          aria-expanded={fontsOpen}
          title="Font"
        >
          {font.label} <span className="caret">▾</span>
        </button>
        {fontsOpen && (
          <div className="font-list" role="listbox">
            {FONTS.map((f) => (
              <button
                key={f.id}
                role="option"
                aria-selected={f.id === font.id}
                className={f.id === font.id ? 'on' : ''}
                style={{ fontFamily: fontFamily(f.id) }}
                onClick={() => {
                  onChange({ font: f.id });
                  setFontsOpen(false);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="toolbar-sep" />
      <button className="text-step" onClick={() => onChange({ size: stepSize(style.size, -1) })} aria-label="Smaller" title="Smaller">
        A<small>−</small>
      </button>
      <span className="text-size" title="Size">{style.size}</span>
      <button className="text-step" onClick={() => onChange({ size: stepSize(style.size, 1) })} aria-label="Bigger" title="Bigger">
        A<small>+</small>
      </button>
      <span className="toolbar-sep" />
      <button
        className={`text-toggle ${style.bold ? 'on' : ''}`}
        onClick={() => onChange({ bold: !style.bold })}
        aria-pressed={style.bold}
        aria-label="Bold"
        title="Bold"
      >
        <b>B</b>
      </button>
      <button
        className={`text-toggle ${style.italic ? 'on' : ''}`}
        onClick={() => onChange({ italic: !style.italic })}
        aria-pressed={style.italic}
        aria-label="Italic"
        title="Italic"
      >
        <i>I</i>
      </button>
      <span className="toolbar-sep" />
      <div className="text-colors">
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            className={`color-dot ${c === style.color ? 'on' : ''}`}
            style={{ '--c': c }}
            aria-label={`Color ${c}`}
            onClick={() => onChange({ color: c })}
          />
        ))}
      </div>
    </div>
  );
}
