import { PhotoReadingArt, ReceiptReadingArt } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  getScanSessionOrder,
  isBarcodeCard,
  useScanSession,
  type SessionScan,
} from '../../lib/scanSession';
import type { BackgroundItem, BackgroundStatus } from '@/lib/backgroundItem';

/** The Review overview, which already shows the Scan Session's cards, those still reading too. */
const REVIEW_OVERVIEW = '/scan/review';

/** What the strip counts of the Scan Session: barcode lookups and uncropped receipts are not Scans being read. */
export function summarizeScanSession(scans: SessionScan[]) {
  const counted = scans.filter(
    (scan) => !isBarcodeCard(scan) && scan.status !== 'uncropped',
  );
  const read = counted.filter((scan) => scan.status === 'read').length;
  const failed = counted.filter((scan) => scan.status === 'failed').length;
  return {
    counted,
    read,
    failed,
    reading: counted.length - read - failed,
    /** Every counted Scan is read (and there is at least one). */
    allRead: counted.length > 0 && read === counted.length,
  };
}

/** Whether the Scan Session has anything to show in the strip. */
export const useScanSessionInStrip = () =>
  summarizeScanSession(useScanSession().scans).counted.length > 0;

/**
 * The Scan Session seen as background items: ONE item however many Scans it holds, or none while it
 * holds no Scan to read. A view: how Scans are read, capped and saved stays in the Scan Session (ADR 0004).
 *
 * Barcode cards are lookups, not Scans, and a gallery receipt waiting for its crop is not read yet:
 * neither counts. The item is a receipt when every Scan is a receipt, else a photo. It is failed while
 * any Scan is failed or capped (the failure outlines the strip, whatever else is still reading),
 * reading while any is reading, ready once all are read.
 */
export function useScanSessionBackgroundItems(): BackgroundItem[] {
  const { t } = useTranslation('background');
  const navigate = useNavigate();
  const { scans } = useScanSession();

  const { counted, read, failed, reading } = summarizeScanSession(scans);
  if (counted.length === 0) return [];

  const kind = counted.every((scan) => scan.mode === 'receipt')
    ? 'receipt'
    : 'photo';
  const status: BackgroundStatus =
    failed > 0 ? 'failed' : reading > 0 ? 'reading' : 'ready';

  return [
    {
      kind,
      id: 'scan-session',
      title: t(`scan.${kind}`, { count: counted.length }),
      detail: [
        read > 0 ? t('scan.read', { count: read }) : null,
        reading > 0 ? t('reading', { count: reading }) : null,
        failed > 0 ? t('failed', { count: failed }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      status,
      // Stamped when the first Scan joined, so a newer read of another kind sorts above it.
      createdAt: getScanSessionOrder(),
      art:
        kind === 'receipt' ? (
          <ReceiptReadingArt size={28} />
        ) : (
          <PhotoReadingArt size={28} />
        ),
      open: {
        label: t('review'),
        ariaLabel: t('scan.reviewSession', {
          title: t(`scan.${kind}`, { count: counted.length }),
        }),
        onClick: () => navigate(REVIEW_OVERVIEW),
      },
      actions: [],
    },
  ];
}
