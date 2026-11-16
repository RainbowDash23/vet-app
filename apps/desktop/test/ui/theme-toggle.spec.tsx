import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../src/context/theme-context';
import { Header } from '../../src/components/layout/header';
import { Role } from '@vet-app/shared-types';

describe('UI: Conmutador de Tema Claro / Oscuro (RNF-3)', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    });
    document.documentElement.removeAttribute('data-theme');
  });

  it('inicia en modo oscuro por defecto y aplica el atributo data-theme en el documento', () => {
    render(
      <ThemeProvider>
        <Header role={Role.ADMIN} userName="Dra. María" />
      </ThemeProvider>
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const toggleBtn = screen.getByTestId('header-theme-toggle-btn');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-label', 'Cambiar a modo claro');
  });

  it('al pulsar el botón, conmuta a modo claro y persiste en localStorage', () => {
    render(
      <ThemeProvider>
        <Header role={Role.ADMIN} userName="Dra. María" />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('header-theme-toggle-btn');
    fireEvent.click(toggleBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(store['vetapp_theme']).toBe('light');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Cambiar a modo oscuro');

    // Al pulsar de nuevo, regresa a modo oscuro
    fireEvent.click(toggleBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store['vetapp_theme']).toBe('dark');
  });

  it('no contiene caracteres emoji raw en el renderizado del botón', () => {
    render(
      <ThemeProvider>
        <Header role={Role.ADMIN} userName="Dra. María" />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('header-theme-toggle-btn');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]/u;
    expect(emojiRegex.test(toggleBtn.innerHTML)).toBe(false);
  });
});
