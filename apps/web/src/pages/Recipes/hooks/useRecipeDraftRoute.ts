import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DRAFT_PARAM } from '@/lib/recipeRoutes';
import { useRecipeDraft, type RecipeDraftView } from '@/lib/recipeDrafts';

/**
 * A form page's relation to the `draft` URL parameter (ADR 0028): which form
 * instance to show, the Recipe Draft to resume, and putting a new id in the URL.
 * Render the form with `key={formKey}` once `loading` and `error` are clear.
 */
export function useRecipeDraftRoute(): {
  formKey: string;
  /** The Recipe Draft to open the form on; undefined for a blank or supplied form. */
  resumed: RecipeDraftView | undefined;
  loading: boolean;
  error: unknown;
  /** Call with the id once it exists: puts it in the URL by replacing the entry. */
  onDraftId: (id: string) => void;
  /** Reload the form on this Recipe Draft as fetched now (a version conflict's "Load latest"): the form remounts on it, with its new version. */
  adopt: (latest: RecipeDraftView) => void;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const draftParam = new URLSearchParams(location.search).get(DRAFT_PARAM);
  // `own` is the Recipe Draft this form created itself (it already holds it).
  // A new navigation (even to this same route) starts the form afresh, but not our own `draft` param.
  const [formInstance, setFormInstance] = useState({
    key: location.key,
    seen: location.key,
    own: null as string | null,
    /** A Recipe Draft fetched on purpose to replace the form's content. */
    adopted: null as RecipeDraftView | null,
    reloads: 0,
  });
  if (formInstance.seen !== location.key) {
    const ours = formInstance.own !== null && draftParam === formInstance.own;
    setFormInstance({
      key: ours ? formInstance.key : location.key,
      seen: location.key,
      own: ours ? formInstance.own : null,
      adopted: null,
      reloads: 0,
    });
  }
  const resumeId =
    draftParam !== null &&
    draftParam !== formInstance.own &&
    !formInstance.adopted
      ? draftParam
      : null;
  const resuming = useRecipeDraft(resumeId, formInstance.key);
  return {
    formKey: formInstance.reloads
      ? `${formInstance.key}:${formInstance.reloads}`
      : formInstance.key,
    resumed: formInstance.adopted
      ? formInstance.adopted
      : resumeId !== null
        ? resuming.data
        : undefined,
    loading: resumeId !== null && !resuming.data && !resuming.error,
    error: resumeId !== null ? resuming.error : null,
    adopt: (latest) =>
      setFormInstance((current) => ({
        ...current,
        own: null,
        adopted: latest,
        reloads: current.reloads + 1,
      })),
    onDraftId: (id) => {
      if (id === draftParam) return;
      setFormInstance((current) => ({ ...current, own: id }));
      // Replace: the Recipe Draft is the same page, not a new step in the history.
      const search = new URLSearchParams(location.search);
      search.set(DRAFT_PARAM, id);
      navigate(
        { pathname: location.pathname, search: `?${search}` },
        { replace: true, state: location.state },
      );
    },
  };
}
