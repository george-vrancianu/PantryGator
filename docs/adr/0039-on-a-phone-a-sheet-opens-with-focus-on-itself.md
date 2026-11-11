# On a phone, a Sheet or Dialog opens with focus on itself, never on a text field

When a sheet opened with focus on a text field, the phone keyboard came up during the slide-in and the sheet jumped. This happened on iOS, Android and the mobile web. MUI was not the cause: its focus trap puts focus on the paper (`role="dialog"`, `tabIndex=-1`, named by the sheet's `label`). The cause was callers moving focus to a field afterwards, with `autoFocus` or in `onEntered`. We decided that below `md`, a Sheet or Dialog opens with focus on its paper whenever the requested opening focus is a text field. The keyboard comes up only when the Member taps a field. From `md` up, the requested field still gets focus, because a desktop has no keyboard to jump.

## Decision

- **`Sheet` and `Dialog` own the opening focus.** Callers pass an `initialFocus` ref instead of focusing something in `onEntered` or with `autoFocus`. Once the open transition ends, the component focuses that element, unless it is a text field and the screen is below `md`. In that case focus stays on the paper. It never moves focus the Member has already moved to a control inside the sheet, so a Member who has already reached a field keeps it. Focus still on the paper, or outside the sheet (a tap on the scrim leaves it on the body), has not been moved by the Member.
- **With no target to take focus, the paper takes it.** If focus is outside the sheet when the transition ends and there is no `initialFocus` (or it is a text field on a phone), the paper is focused, so focus never stays behind the scrim.
- **The paper is the landing element.** It is already focusable, a screen reader announces the sheet's name, and Tab from it goes to the first control. No hidden first item is added.
- **Only the opening focus is covered.** A field that appears because of the Member's tap inside an open sheet, such as Add tip, Rename, Edit or the next search after an add, may still take focus and raise the keyboard.
- **A field that blocks Confirm is scrolled into view, not focused**, when it is a text field on a phone (Voice Review).

## Considered options

- **Fix each caller.** Rejected: six or more call sites, and nothing stops the next sheet from doing it again.
- **Add a hidden focusable element as the sheet's first item.** Rejected: it duplicates the paper that MUI already focuses. It also cannot win against `autoFocus`, which runs on mount, before the focus trap looks.
- **Never focus a field, on any screen.** Rejected: on a desktop, a ready cursor in the search field helps and costs nothing.

## Consequences

- `Sheet` cannot override React `autoFocus`, so `CODING_STANDARDS.md` forbids `autoFocus` and `onEntered` focusing on a field that is present when a Sheet or Dialog opens.
- Sheets that land on a title or close button today (Background, Voice Answer, Editor, Quick View, Health) move to `initialFocus` and behave the same.
