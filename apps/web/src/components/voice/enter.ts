/** The fade-and-rise a floating voice layer (the Listening card, the Gator bubble) arrives with. */
export const enter = {
  animation: 'pp-voice-in 200ms cubic-bezier(.2,.8,.2,1)',
  '@keyframes pp-voice-in': {
    from: { opacity: 0, transform: 'translateY(8px) scale(.98)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
};
