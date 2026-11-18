/**
 * The CSS custom property that sets the bubble's upper bound: the distance from the top of the
 * screen to the bottom of the header, as a CSS length. Whoever lays out the header sets it on an
 * ancestor (or `:root`); until then the bubble keeps clear of the top safe area plus 12 px.
 */
export const BUBBLE_TOP_VAR = '--gator-bubble-top';

/**
 * The CSS custom property that sets the bubble's lowest spot where there is no Dock: the height
 * of a page's own fixed bottom bar, as a CSS length. A page that has such a bar sets it on
 * `:root` while it is mounted (`useBubbleBottomBound`); without one the bubble keeps clear of the
 * bottom safe area.
 */
export const BUBBLE_BOTTOM_VAR = '--gator-bubble-bottom';
