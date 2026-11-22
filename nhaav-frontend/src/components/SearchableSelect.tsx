import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A single-value picker you can TYPE into.
 *
 * Native `<select>` elements ignore what you type (they only jump to an option
 * that starts with the letter), which is useless once a list has dozens of
 * entries — a provider looking for "Machinery Repairs" had to scroll. This is a
 * combobox: focus it (or type) and the matching options appear in a menu below,
 * filtered by what was typed. Arrow keys move, Enter selects, Escape closes.
 */

export interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  /** Shown when nothing is selected yet. */
  placeholder?: string;
  /** Menu text when the query matches nothing. */
  emptyLabel?: string;
  disabled?: boolean;
  /** Reused so the control matches the surrounding form fields. */
  inputStyle?: React.CSSProperties;
  menuMaxHeight?: number;
  ariaLabel?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  emptyLabel = 'No match',
  disabled = false,
  inputStyle,
  menuMaxHeight = 260,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Substring match: providers remember "repairs", not the first word.
    return options.filter(option => option.toLowerCase().includes(q));
  }, [options, query]);

  // Clicking anywhere else closes the menu and drops the half-typed query.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const commit = (option: string) => {
    onChange(option);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        style={inputStyle}
        value={open ? query : value}
        placeholder={value || placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onChange={event => {
          setOpen(true);
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive(current => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(current => Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            if (open && filtered[active]) {
              event.preventDefault();
              commit(filtered[active]);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
      />

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 60,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: menuMaxHeight,
            overflowY: 'auto',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: '#ffffff',
            border: '1px solid rgba(13,59,102,0.22)',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(13,59,102,0.14)',
          }}
        >
          {filtered.length === 0 && (
            <li style={{ padding: '0.5rem 0.65rem', fontSize: '0.82rem', color: '#6b6b7b' }}>
              {emptyLabel}
            </li>
          )}
          {filtered.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              // mousedown (not click) so the input's blur does not remove the
              // option before the selection is registered.
              onMouseDown={event => {
                event.preventDefault();
                commit(option);
              }}
              onMouseEnter={() => setActive(index)}
              style={{
                padding: '0.5rem 0.65rem',
                borderRadius: 6,
                fontSize: '0.85rem',
                cursor: 'pointer',
                color: '#0D3B66',
                background: index === active ? 'rgba(76,157,176,0.16)' : 'transparent',
                fontWeight: option === value ? 700 : 500,
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;
