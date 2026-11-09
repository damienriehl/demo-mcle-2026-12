import { useEffect, useRef } from 'react';
import { calendarCovered, isCalendarDate } from '../../engine/dates';

export function MoveDateInput({ date, disabled, onCommit }: { date: string; disabled: boolean; onCommit: (date: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const typing = useRef(false);
  useEffect(() => { if (input.current && !disabled) input.current.value = date; }, [date, disabled]);
  function commit(value: string) {
    if (!isCalendarDate(value) || !calendarCovered(value)) { if (input.current) input.current.value = date; return; }
    if (value !== date) onCommit(value);
  }
  return <label>Move<input type="date" min="2024-01-01" max="2030-12-31" ref={input} defaultValue={date} disabled={disabled}
    onPointerDown={() => { typing.current = false; }}
    onKeyDown={event => {
      typing.current = true;
      if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); }
    }}
    onChange={event => {
      // Picker selections report a completed value without a keyboard edit.
      if (!typing.current) commit(event.target.value);
    }}
    onBlur={event => { commit(event.currentTarget.value); typing.current = false; }} />
  </label>;
}
