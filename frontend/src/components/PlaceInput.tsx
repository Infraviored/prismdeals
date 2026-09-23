/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useId } from 'react'
import { Input } from './ui/Input'

export type Place = {
  label: string
  name: string
  qualifier: string
  state: string
  postal_code: string
  lat: number
  lon: number
}

type Props = {
  label: string
  placeholder: string
  value: Place | null
  onChange: (place: Place | null) => void
  emptyHint: string
}

/**
 * A place field that offers what it knows instead of judging what was typed.
 *
 * The previous version took free text and resolved it when the form was
 * submitted, which meant "Landsberg am Lech" came back as *Could not place
 * 'Landsberg am Lech'. Give a postal code, or "Ort, Bundesland"* — after the
 * fact, in the interface's vocabulary rather than the user's, and asking them to
 * solve an ambiguity they never saw. There are two Landsbergs; only the person
 * typing knows which one they meant.
 *
 * So the list is the answer. Every entry names its postal code and state, both
 * Landsbergs appear, and picking one leaves nothing left to resolve. A place is
 * chosen, not parsed.
 */
export default function PlaceInput({ label, placeholder, value, onChange, emptyHint }: Props) {
  const [text, setText] = useState(value ? value.label : '')
  const [matches, setMatches] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [searching, setSearching] = useState(false)
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  // Suppresses the lookup that a selection's own text change would otherwise
  // trigger — picking a place should close the list, not repopulate it.
  const skipNextLookup = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)

  // The field follows its value. Clearing it from outside — which is what the
  // form does after planning a corridor — has to clear what is on screen too,
  // or the input keeps showing a place the application no longer holds.
  useEffect(() => {
    // Both directions matter. Clearing the value from outside — which the form
    // does after planning a corridor — has to clear the field. But a parent
    // that swaps in a *different* place has to be followed too: this used to
    // check only for null, so `text` kept its first value and the field went
    // on showing a town the application no longer held.
    const wanted = value ? value.label : ''
    if (wanted !== text) {
      skipNextLookup.current = true
      setText(wanted)
      setMatches([])
      setOpen(false)
    }
    // Keyed on the value alone: including `text` would undo the user's typing
    // on the very next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false
      return
    }
    if (text.trim().length < 2) {
      setMatches([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/suggest?q=${encodeURIComponent(text)}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setMatches(data.places || [])
        setActive(0)
        setOpen(true)
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 180)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [text])

  // Clicking away closes the list without choosing anything.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const choose = (place: Place) => {
    // Only arm the skip if the text is actually about to change. Choosing the
    // suggestion whose label already equals the input leaves React with nothing
    // to re-render, the effect never runs, and the flag would stay armed to
    // swallow the next real keystroke instead.
    skipNextLookup.current = place.label !== text
    setText(place.label)
    setMatches([])
    setOpen(false)
    onChange(place)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { setOpen(false); return }
    // Moving on with Tab is leaving this field; a list left floating over the
    // page belongs to a field the user is no longer in.
    if (event.key === 'Tab') { setOpen(false); return }
    if (!open || matches.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(i => (i + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(i => (i - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(matches[active])
    }
  }

  // Keep the highlighted option in view: arrowing past the bottom of a
  // scrollable list otherwise highlights something nobody can see.
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const clear = () => {
    skipNextLookup.current = true
    setText('')
    setMatches([])
    setOpen(false)
    onChange(null)
  }

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      {label ? (
        <label htmlFor={`${listId}-input`} className="text-xs text-[#8FA6A1] font-medium block">
          {label}
        </label>
      ) : null}
      <div className="relative flex items-center">
        <Input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches.length ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setText(e.target.value)
            // The typed text no longer describes the chosen place.
            if (value) onChange(null)
          }}
          onFocus={() => { if (matches.length) setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={text ? 'pr-9' : ''}
        />
        {text ? (
          <button
            type="button"
            data-testid="clear-place-button"
            aria-label="Ort löschen"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-[#8FA6A1] hover:text-[#F2F5F4] hover:bg-[#0E4A40]/50 cursor-pointer transition-colors text-xs font-bold"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* The chosen place stood a second time underneath the field, in green,
          repeating what the field already said. The field is the answer; only
          the absence of one needs a line of its own. */}
      {!value && text.trim().length >= 2 && !searching && matches.length === 0 ? (
        <p className="text-sm text-[#8FA6A1]">{emptyHint}</p>
      ) : null}

      {open && matches.length > 0 && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-30 left-0 top-full mt-1 min-w-full w-max max-w-[min(28rem,80vw)] max-h-72 overflow-y-auto rounded border border-[#0E4A40] bg-[#06322C] py-1 shadow-2xl"
        >
          {matches.map((place, index) => (
            <li
              key={`${place.postal_code}-${place.name}-${place.qualifier}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={e => { e.preventDefault(); choose(place) }}
              className={`px-3 py-2.5 min-h-[44px] flex flex-col justify-center cursor-pointer transition-colors ${
                index === active ? 'bg-[#00100F]' : ''
              }`}
            >
              <div className="text-sm text-[#F2F5F4] font-medium leading-snug">
                {place.qualifier ? `${place.name} ${place.qualifier}` : place.name}
              </div>
              <div className="text-xs text-[#8FA6A1] flex items-center gap-2 leading-snug">
                <span className="tabular-nums">{place.postal_code}</span>
                <span>{place.state}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
