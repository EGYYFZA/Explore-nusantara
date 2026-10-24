import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { searchRegions, type Region } from './regions';

type Props = {
  id: string; label: string; placeholder: string; options: Region[];
  value?: number; disabled?: boolean; onChange: (value: string) => void;
};

export default function RegionSelect({ id, label, placeholder, options, value, disabled, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [menu, setMenu] = useState({ value, open: false, query: '', active: 0 });
  if (menu.value !== value) setMenu({ value, open: false, query: '', active: 0 });
  const selected = options.find(option => option.id === value);
  const matches = searchRegions(options, menu.query).map(option => ({ id: String(option.id), name: option.name }));
  const choices = menu.query.trim() ? matches : [{ id: '', name: placeholder }, ...matches];
  const open = menu.open && !disabled;
  const active = choices[menu.active];

  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, menu.active, menu.query]);

  function close() { setMenu(current => ({ ...current, open: false, query: '' })); }
  function choose(id: string) { close(); onChange(id); }
  function show() {
    setMenu({ value, open: true, query: '', active: Math.max(0, choices.findIndex(option => option.id === String(value ?? ''))) });
  }

  return (
    <div className="region-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
      <label htmlFor={id}>{label}</label>
      <div className="region-combobox">
        <input ref={input} id={id} name={id} type="text" role="combobox" autoComplete="off" spellCheck={false}
          disabled={disabled} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
          aria-activedescendant={open && active ? `${id}-option-${active.id || 'all'}` : undefined}
          placeholder={selected?.name ?? placeholder} value={open ? menu.query : selected?.name ?? ''}
          onFocus={show} onClick={() => { if (!open) show(); }}
          onChange={event => setMenu({ value, open: true, query: event.target.value, active: 0 })}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) show();
              else if (choices.length) setMenu(current => ({ ...current,
                active: (current.active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length }));
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active) choose(active.id);
            } else if (event.key === 'Escape' && open) { event.preventDefault(); close(); }
          }} />
        <button type="button" className="region-toggle" tabIndex={-1} disabled={disabled}
          aria-label={`Tampilkan pilihan ${label}`} onMouseDown={event => event.preventDefault()}
          onClick={() => { if (open) close(); else { input.current?.focus(); show(); } }}><ChevronDown size={15} aria-hidden="true" /></button>
      </div>
      {open && <ul ref={list} className="region-options" id={`${id}-options`} role="listbox" aria-label={label}
        onMouseDown={event => event.preventDefault()}>
        {choices.map((option, index) => <li key={option.id} id={`${id}-option-${option.id || 'all'}`} role="option"
          aria-selected={option.id === String(value ?? '')} data-active={menu.active === index}
          onMouseMove={() => setMenu(current => ({ ...current, active: index }))} onClick={() => choose(option.id)}>
          <span>{option.name}</span>{option.id === String(value ?? '') && <Check size={15} aria-hidden="true" />}
        </li>)}
        {!choices.length && <li className="region-no-results" role="presentation"><span role="status">Wilayah tidak ditemukan</span></li>}
      </ul>}
    </div>
  );
}
