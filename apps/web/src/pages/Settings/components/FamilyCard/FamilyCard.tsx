import {
  Alert,
  Box,
  Button,
  Card,
  ChevronRightIcon,
  CopyIcon,
  Link,
  Stack,
  Typography,
  radius,
  useToast,
  palette,
} from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import { translateApiError } from '@/i18n/translateApiError';
import { useFamily, type Family } from '@/lib/family';
import { daysUntil, localIso } from '@/lib/pantry';
import { useToday } from '@/lib/useToday';

/** Member avatars shown before the "+n" overflow. */
const AVATAR_LIMIT = 4;
/** Fills cycle through the Settings palette, as in the handoff. */
const AVATAR_FILLS = [
  palette('pp-accentTint'),
  palette('secondary-main'),
  palette('pp-chip'),
];

/** The invite code in groups of four, for reading aloud: `K7M2 PQ9X`. */
const groupCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1 ');

function SkeletonRows() {
  const { t } = useTranslation('settings');
  return (
    <Card role="status" aria-label={t('loading')}>
      <Stack spacing={1.5}>
        <Box
          sx={{
            height: 20,
            width: '50%',
            borderRadius: radius.control,
            bgcolor: palette('pp-subtle'),
          }}
        />
        <Box
          sx={{
            height: 14,
            width: '70%',
            borderRadius: radius.control,
            bgcolor: palette('pp-subtle'),
          }}
        />
        <Box
          sx={{
            height: 44,
            borderRadius: radius.control,
            bgcolor: palette('pp-subtle'),
          }}
        />
      </Stack>
    </Card>
  );
}

function Avatars({ family }: { family: Family }) {
  const { t } = useTranslation('settings');
  const shown = family.members.slice(0, AVATAR_LIMIT);
  const more = family.members.length - shown.length;
  return (
    <Stack
      direction="row"
      sx={{ alignItems: 'center', flexShrink: 0 }}
      aria-hidden="true"
    >
      {shown.map((member, index) => (
        <Box
          key={member.id}
          data-avatar
          sx={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            ml: index === 0 ? 0 : '-8px',
            border: 2,
            borderColor: 'background.paper',
            bgcolor: AVATAR_FILLS[index % AVATAR_FILLS.length],
            color: palette('text-primary'),
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {member.name.trim().charAt(0).toUpperCase()}
        </Box>
      ))}
      {more > 0 ? (
        <Box
          sx={{
            ml: '-8px',
            minWidth: 30,
            height: 30,
            px: 0.5,
            borderRadius: radius.chip,
            border: 2,
            borderColor: 'background.paper',
            bgcolor: palette('pp-chip'),
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {t('familyCard.more', { count: more })}
        </Box>
      ) : null}
    </Stack>
  );
}

/** The Family card: members, the invite code and its days left, and a link to the Family page. */
export function FamilyCard() {
  const { t } = useTranslation('settings');
  const family = useFamily();
  const today = useToday();
  const toast = useToast();
  const codeRef = useRef<HTMLSpanElement>(null);

  if (family.isPending) return <SkeletonRows />;
  if (!family.data) {
    return family.error ? (
      <Alert>{translateApiError(t, family.error)}</Alert>
    ) : null;
  }

  const data = family.data;
  const expiresAt = new Date(data.inviteCodeExpiresAt);
  // Expired is by the instant, as on the Family page; days left counts calendar days on the device.
  // oxlint-disable-next-line react/purity -- invite expiry is checked against the current time on each render; freezing it would keep an expired invite looking valid
  const expired = expiresAt.getTime() <= Date.now();
  const daysLeft = daysUntil(localIso(expiresAt), today);
  const expiryText =
    daysLeft <= 0
      ? t('familyCard.expiresToday')
      : t('familyCard.expiresIn', { count: daysLeft });

  const selectCode = () => {
    const node = codeRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.inviteCode);
      toast.show(t('familyCard.copied'));
    } catch {
      selectCode();
    }
  };

  const role = data.currentMemberIsOwner
    ? t('familyCard.youOwner')
    : t('familyCard.youMember');

  return (
    <Card>
      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body1"
              component="h2"
              sx={{ fontWeight: 700, fontSize: 21 }}
            >
              {t('familyCard.title')}
            </Typography>
            <Typography variant="meta" color="text.secondary">
              {`${role} · ${t('familyCard.members', { count: data.members.length })}`}
            </Typography>
          </Box>
          <Avatars family={data} />
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            p: '8px 8px 8px 14px',
            borderRadius: radius.control,
            bgcolor: palette('pp-subtle'),
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {expired ? (
            <>
              <Stack
                spacing={0.5}
                sx={{ minWidth: 0, alignItems: 'flex-start' }}
              >
                <ExpiryTag tag={{ tone: 'urgent', kind: 'expired' }} />
                <Typography variant="meta">
                  {data.currentMemberIsOwner
                    ? t('family:expiredOwnerPrompt')
                    : t('family:expiredMemberPrompt')}
                </Typography>
              </Stack>
              {data.currentMemberIsOwner ? (
                <Button
                  variant="secondary"
                  size="sm"
                  href="/family"
                  sx={{ flexShrink: 0 }}
                >
                  {t('familyCard.newCode')}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="meta" color="text.secondary">
                  {`${t('familyCard.inviteCode')} · ${expiryText}`}
                </Typography>
                <Typography
                  component="span"
                  ref={codeRef}
                  sx={{
                    display: 'block',
                    fontSize: 19,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {groupCode(data.inviteCode)}
                </Typography>
              </Box>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('familyCard.copyLabel')}
                startIcon={<CopyIcon size={16} />}
                onClick={copy}
                sx={{ flexShrink: 0 }}
              >
                {t('familyCard.copy')}
              </Button>
            </>
          )}
        </Stack>

        <Box>
          <Link
            href="/family"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            {t('familyCard.manage')}
            <ChevronRightIcon size={18} />
          </Link>
        </Box>
      </Stack>
    </Card>
  );
}
