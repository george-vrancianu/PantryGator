import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';

type Report = (message: string | null) => void;

const RowToggleErrorContext = createContext<Report>(() => undefined);

/** The page's error report for row toggles; the Staple and Running low toggles both call it. */
export function useRowToggleReport(): Report {
  return useContext(RowToggleErrorContext);
}

/**
 * Mutation callbacks for a row toggle's save: success clears the page's error (then runs `onSaved`),
 * failure reports it, translated.
 */
export function useRowToggleOutcome() {
  const { t } = useTranslation();
  const report = useRowToggleReport();
  return (onSaved?: () => void) => ({
    onSuccess: () => {
      report(null);
      onSaved?.();
    },
    onError: (error: unknown) => report(translateApiError(t, error)),
  });
}

/** A page that lists row toggles (Staple, Running low) owns their error: show `message` in its Alert and wrap the list in `RowToggleErrorProvider`. */
export function useRowToggleErrors() {
  const [message, setMessage] = useState<string | null>(null);
  return { message, report: setMessage };
}

export function RowToggleErrorProvider({
  report,
  children,
}: {
  report: Report;
  children: ReactNode;
}) {
  return (
    <RowToggleErrorContext.Provider value={report}>
      {children}
    </RowToggleErrorContext.Provider>
  );
}
