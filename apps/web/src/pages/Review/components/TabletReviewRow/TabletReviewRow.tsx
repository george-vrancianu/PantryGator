import { BarcodeLookupNotes } from '@/components/scan/BarcodeLookupNotes/BarcodeLookupNotes';
import {
  Box,
  CalendarIcon,
  CheckIcon,
  DeleteIcon,
  IconButton,
  ManualEntryIcon,
  SwapIcon,
  palette,
} from '@pocket-pantry/ui';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogParent } from '@/lib/catalog';
import { formatDate } from '@/lib/dateFormat';
import {
  displayName,
  invalidFields,
  type ReviewLine,
  type RowStatus,
} from '@/lib/review';
import type { CameraMode } from '@/lib/cameraMode';
import { ConfidencePill } from '../ConfidencePill/ConfidencePill';
import { controlSx } from '../Field/Field';
import {
  CategorySelect,
  DescriptionInput,
  ExpiryInput,
  ReviewLineExpirySheet,
  LocationSelect,
  NameInput,
  QuantityUnitInput,
} from '../RowInputs/RowInputs';
import { SourceText } from '../SourceText/SourceText';
import { StatusIcon } from '@/components/lists/StatusIcon/StatusIcon';
import {
  ROW_TINT,
  fieldId,
  linkButtonSx,
  rowId,
  tabletRowSx,
  titleId,
} from '../layout';

type Props = {
  line: ReviewLine;
  /** Live status: drives the icon, the pill and the tint. */
  status: RowStatus;
  /** Inputs show: a row to check always, a sure row once the Member opens it. */
  editing: boolean;
  /** The row sits among the rows to check: it has Confirm, a sure row has Finish editing. */
  toCheck: boolean;
  parents: CatalogParent[];
  mode: CameraMode;
  /** A Save or Done was blocked on this row: show every error now. */
  blocked: boolean;
  onEdit: () => void;
  onChange: (patch: Partial<ReviewLine>) => void;
  onRemove: () => void;
  onDone: () => void;
  /** Opens the page-level swap dialog for this line. */
  onSwapMatch: () => void;
  /** From `accessibleNamesOf`: the display name, position-qualified when repeated. */
  accessibleName: string;
};

const ellipsis = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** 12 px text input for the Description and Category lines under a name. */
const compactSx = { ...controlSx, height: 32, fontSize: 12 } as const;

function CellError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Box id={id} sx={{ mt: '4px', fontSize: 12, color: palette('error-main') }}>
      {children}
    </Box>
  );
}

/**
 * One row of the tablet table. Rows to check are always inputs; a sure row is
 * read-only text on one line until the Member clicks it or its pencil. The
 * Description and, for an Unmatched line, the Name and Category sit under the
 * name, so the columns stay the five of the spec.
 */
export function TabletReviewRow({
  line,
  status,
  editing,
  toCheck,
  parents,
  mode,
  blocked,
  onEdit,
  onChange,
  onRemove,
  onDone,
  onSwapMatch,
  accessibleName,
}: Props) {
  const { t } = useTranslation(['review', 'common', 'pantry']);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [expirySheetOpen, setExpirySheetOpen] = useState(false);
  const pickExpiry = useRef<HTMLButtonElement>(null);
  // Labels use the position-qualified `accessibleName`; the visible text stays the plain one.
  const name = displayName(line);
  const unmatched = line.match === null;
  const invalid = invalidFields(line);
  const expiryError = invalid.includes('expiry') && (expiryTouched || blocked);
  const id = (field: string) => fieldId(line.key, field);
  const named = (field: string) =>
    t('review:row.fieldFor', { field, name: accessibleName });
  const unit = t(`common:units.${line.unit}`);

  const swap = (
    <IconButton
      id={toCheck ? rowId(line.key) : undefined}
      label={t(unmatched ? 'review:action.choose' : 'review:action.swap', {
        name: accessibleName,
      })}
      tone="accentOutline"
      size={40}
      aria-haspopup="dialog"
      onClick={onSwapMatch}
    >
      <SwapIcon size={18} />
    </IconButton>
  );
  const confirm = (
    <IconButton
      label={t('review:action.confirmFor', { name: accessibleName })}
      tone="accentOutline"
      size={40}
      onClick={onDone}
    >
      <CheckIcon size={18} />
    </IconButton>
  );
  const remove = (
    <IconButton
      label={t('review:action.remove', { name: accessibleName })}
      tone={toCheck ? 'urgentOutline' : 'plain'}
      size={40}
      onClick={onRemove}
    >
      <DeleteIcon size={18} />
    </IconButton>
  );
  const edit = (
    <IconButton
      id={rowId(line.key)}
      label={t(editing ? 'review:action.finish' : 'review:action.edit', {
        name: accessibleName,
      })}
      tone="plain"
      size={40}
      aria-expanded={editing}
      onClick={editing ? onDone : onEdit}
    >
      {editing ? <CheckIcon size={18} /> : <ManualEntryIcon size={18} />}
    </IconButton>
  );

  const readOnly = !editing;
  return (
    <Box
      role="row"
      onClick={readOnly ? onEdit : undefined}
      sx={{
        ...tabletRowSx,
        alignItems: readOnly ? 'center' : 'start',
        minHeight: readOnly ? 52 : 68,
        py: readOnly ? '6px' : '14px',
        borderTop: `1px solid ${palette('divider')}`,
        // Only a row that still needs a look is tinted, by its live status; sure rows stay white even when open.
        bgcolor:
          editing && status !== 'ok'
            ? ROW_TINT[status]
            : palette('background-paper'),
        cursor: readOnly ? 'pointer' : undefined,
        '&:hover': readOnly ? { bgcolor: palette('pp-subtle') } : undefined,
      }}
    >
      <Box
        role="cell"
        sx={{ display: 'flex', alignItems: 'center', minHeight: 40 }}
      >
        <StatusIcon status={status} />
      </Box>

      <Box
        role="cell"
        sx={{ minWidth: 0, minHeight: readOnly ? undefined : 40 }}
      >
        {readOnly ? (
          <Box sx={{ ...ellipsis, pl: '12px' }}>
            <Box
              component="span"
              id={titleId(line.key)}
              sx={{ fontSize: 14, fontWeight: 700 }}
            >
              {name}
            </Box>
            {line.sourceText === null ? null : (
              <>
                {' · '}
                <SourceText text={line.sourceText} mode={mode} inline />
              </>
            )}
            {line.description === '' ? null : (
              <Box
                component="span"
                title={line.description}
                sx={{ fontSize: 12, color: palette('text-secondary') }}
              >
                {` · ${line.description}`}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: '4px' }}>
            {unmatched ? (
              <Box>
                <NameInput
                  line={line}
                  onChange={onChange}
                  id={id('name')}
                  invalid={invalid.includes('name')}
                  errorId={`${id('name')}-error`}
                  ariaLabel={named(t('review:field.name'))}
                  sx={{ fontSize: 15, fontWeight: 700 }}
                />
                {invalid.includes('name') ? (
                  <CellError id={`${id('name')}-error`}>
                    {t('review:error.name')}
                  </CellError>
                ) : null}
              </Box>
            ) : (
              <Box
                id={titleId(line.key)}
                sx={{ ...ellipsis, fontSize: 15, fontWeight: 700 }}
              >
                {name}
              </Box>
            )}
            <SourceText text={line.sourceText} mode={mode} />
            {line.lookup ? <BarcodeLookupNotes lookup={line.lookup} /> : null}

            <DescriptionInput
              line={line}
              onChange={onChange}
              id={id('description')}
              placeholder={t('review:field.description')}
              ariaLabel={named(t('review:field.description'))}
              sx={compactSx}
            />

            {unmatched ? (
              <CategorySelect
                line={line}
                onChange={onChange}
                id={id('category')}
                parents={parents}
                otherLabel={t('review:row.categoryNone')}
                ariaLabel={named(t('review:field.category'))}
                sx={compactSx}
              />
            ) : null}
            {!toCheck ? (
              // A sure row's actions are edit and delete only, so (Change|Choose) match lives here while it is open.
              <Box
                component="button"
                type="button"
                aria-label={t(
                  unmatched ? 'review:action.choose' : 'review:action.swap',
                  { name: accessibleName },
                )}
                aria-haspopup="dialog"
                onClick={onSwapMatch}
                sx={{ ...linkButtonSx, justifySelf: 'start', px: 0 }}
              >
                {t(unmatched ? 'review:match.choose' : 'review:match.change')}
              </Box>
            ) : null}
          </Box>
        )}
      </Box>

      <Box role="cell" sx={{ minWidth: 0 }}>
        {readOnly ? (
          <Box sx={{ pl: '12px', fontSize: 13, fontWeight: 600 }}>
            {line.quantity.trim() === ''
              ? `? ${unit}`
              : `${line.quantity} ${unit}`}
          </Box>
        ) : (
          <>
            <QuantityUnitInput
              line={line}
              onChange={onChange}
              id={id('quantity')}
              invalid={invalid.includes('quantity')}
              errorId={`${id('quantity')}-error`}
              ariaLabel={named(t('review:field.quantity'))}
              unitAriaLabel={named(t('review:field.unit'))}
            />
            {invalid.includes('quantity') ? (
              <CellError id={`${id('quantity')}-error`}>
                {t('pantry:form.quantityInvalid')}
              </CellError>
            ) : null}
          </>
        )}
      </Box>

      <Box role="cell" sx={{ minWidth: 0 }}>
        {readOnly ? (
          <Box sx={{ ...ellipsis, pl: '12px', fontSize: 13 }}>
            {t(`common:locations.${line.location}`)}
          </Box>
        ) : (
          // A table cell is too narrow for the Location toggle, so the table keeps the dropdown (issue 521).
          <LocationSelect
            line={line}
            onChange={onChange}
            id={id('location')}
            ariaLabel={named(t('review:field.location'))}
          />
        )}
      </Box>
      <Box role="cell" sx={{ minWidth: 0 }}>
        {readOnly ? (
          <Box
            sx={{
              ...ellipsis,
              pl: '12px',
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatDate(line.expiryDate)}
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <ExpiryInput
                  line={line}
                  onChange={onChange}
                  id={id('expiry')}
                  error={expiryError}
                  errorId={`${id('expiry')}-error`}
                  onBlur={() => setExpiryTouched(true)}
                  ariaLabel={named(t('review:field.expiry'))}
                />
              </Box>
              <IconButton
                ref={pickExpiry}
                label={named(t('review:pickExpiry'))}
                tone="plain"
                size={34}
                aria-haspopup="dialog"
                onClick={() => setExpirySheetOpen(true)}
              >
                <CalendarIcon size={18} />
              </IconButton>
            </Box>
            <ReviewLineExpirySheet
              line={line}
              onChange={onChange}
              open={expirySheetOpen}
              onClose={() => setExpirySheetOpen(false)}
              // A tap doesn't always focus the button (Safari), so put focus back explicitly.
              onExited={() => pickExpiry.current?.focus()}
            />
            {expiryError ? (
              <CellError id={`${id('expiry')}-error`}>
                {t('review:error.expiry')}
              </CellError>
            ) : null}
          </>
        )}
      </Box>

      <Box
        role="cell"
        sx={{ display: 'flex', alignItems: 'center', minHeight: 40 }}
      >
        <ConfidencePill status={status} />
      </Box>

      {/* Buttons act on their own: a click must not also open the row. */}
      <Box
        role="cell"
        onClick={(event) => event.stopPropagation()}
        sx={{ display: 'flex', gap: '8px' }}
      >
        {toCheck ? (
          <>
            {swap}
            {confirm}
            {remove}
          </>
        ) : (
          <>
            {edit}
            {remove}
          </>
        )}
      </Box>
    </Box>
  );
}
