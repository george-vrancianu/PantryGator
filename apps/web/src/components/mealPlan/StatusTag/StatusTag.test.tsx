import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders as render } from '@/test/render';
import { StatusTag } from './StatusTag';

describe('StatusTag', () => {
  afterEach(cleanup);

  it('puts a check on Covered and a trolley on On list', () => {
    render(
      <>
        <StatusTag status="covered">Covered</StatusTag>
        <StatusTag status="onList">On list</StatusTag>
        <StatusTag status="short">2 short</StatusTag>
      </>,
    );
    expect(screen.getByText('Covered').querySelector('svg')).not.toBeNull();
    expect(screen.getByText('On list').querySelector('svg')).not.toBeNull();
    expect(screen.getByText('2 short').querySelector('svg')).toBeNull();
  });

  it('takes an icon over the default', () => {
    render(
      <StatusTag status="short" icon={<svg data-testid="own" />}>
        1 short
      </StatusTag>,
    );
    expect(screen.getByTestId('own')).toBeTruthy();
  });
});
