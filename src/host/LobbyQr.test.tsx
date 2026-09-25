import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtures } from '../dev/fixtures/host';
import { LangProvider } from '../i18n';
import { HostMotionProvider } from './motion';

function renderLobby() {
  const fixture = fixtures.find((f) => f.name === 'host.lobby-3');
  if (!fixture) throw new Error('host.lobby-3 fixture missing');
  return render(
    <LangProvider>
      <HostMotionProvider>{fixture.render()}</HostMotionProvider>
    </LangProvider>,
  );
}

describe('H1 Bigger QR toggle', () => {
  it('one rail button enlarges the QR and brings it back', () => {
    renderLobby();
    const toggle = screen.getByTestId('host-qr-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('Bigger QR');
    expect(screen.queryByTestId('host-qr-full')).toBeNull();
    expect(screen.getByTestId('host-players')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent('Smaller QR');
    expect(screen.getByTestId('host-qr-full')).toBeInTheDocument();
    // Only the QR and the code on the stage; still one QR and one code.
    expect(screen.getAllByTestId('host-qr')).toHaveLength(1);
    expect(screen.getAllByTestId('host-code')).toHaveLength(1);
    expect(screen.queryByTestId('host-players')).toBeNull();
    // The rail (Start, the lineup) stays.
    expect(screen.getByTestId('host-start')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByTestId('host-qr-full')).toBeNull();
    expect(screen.getByTestId('host-players')).toBeInTheDocument();
  });

  it('Escape or clicking the big QR brings it back', () => {
    renderLobby();
    fireEvent.click(screen.getByTestId('host-qr-toggle'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByTestId('host-qr-full')).toBeNull();

    fireEvent.click(screen.getByTestId('host-qr-toggle'));
    fireEvent.click(screen.getByTestId('host-qr-full'));
    expect(screen.queryByTestId('host-qr-full')).toBeNull();
    expect(screen.getByTestId('host-qr-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
});
