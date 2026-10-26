import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Sidebar } from '../../src/components/layout/sidebar';
import { fakeTagReader } from '../../src/readers/fake-tag-reader';

describe('Sidebar NFC Reader Widget (SPEC EARS)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeTagReader.stop();
    fakeTagReader.start();
  });

  afterEach(() => {
    vi.useRealTimers();
    fakeTagReader.stop();
  });

  it('muestra "Esperando llavero..." cuando no hay lectura reciente', () => {
    render(<Sidebar role="RECEPTION" />);
    expect(screen.getByText('Esperando llavero...')).toBeInTheDocument();
  });

  it('al leer una tarjeta muestra "UID: <UID> (<HH:mm:ss>)" durante exactamente 10 segundos antes de volver al estado de espera', () => {
    // Fijar una hora de prueba conocida
    const mockDate = new Date('2026-10-25T14:32:05');
    vi.setSystemTime(mockDate);

    render(<Sidebar role="RECEPTION" />);

    expect(screen.getByText('Esperando llavero...')).toBeInTheDocument();

    // Simular lectura de tag NFC
    act(() => {
      fakeTagReader.emitTag('04A1B2C3D4E5');
    });

    // Debe mostrar UID: 04A1B2C3D4E5 (14:32:05)
    expect(screen.getByText('UID: 04A1B2C3D4E5 (14:32:05)')).toBeInTheDocument();
    expect(screen.queryByText('Esperando llavero...')).not.toBeInTheDocument();

    // Avanzar 5 segundos: todavía debe mostrarse
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('UID: 04A1B2C3D4E5 (14:32:05)')).toBeInTheDocument();

    // Avanzar a 9.9 segundos: todavía debe mostrarse
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.getByText('UID: 04A1B2C3D4E5 (14:32:05)')).toBeInTheDocument();

    // Avanzar los 100 ms restantes para completar 10 segundos: debe volver a "Esperando llavero..."
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText('UID: 04A1B2C3D4E5 (14:32:05)')).not.toBeInTheDocument();
    expect(screen.getByText('Esperando llavero...')).toBeInTheDocument();
  });

  it('una nueva lectura reinicia la ventana de 10 segundos', () => {
    const time1 = new Date('2026-10-25T14:32:05');
    vi.setSystemTime(time1);

    render(<Sidebar role="RECEPTION" />);

    act(() => {
      fakeTagReader.emitTag('04A1B2C3D4E5');
    });
    expect(screen.getByText('UID: 04A1B2C3D4E5 (14:32:05)')).toBeInTheDocument();

    // Avanzar 6 segundos y leer otra tarjeta
    act(() => {
      vi.advanceTimersByTime(6000);
      const time2 = new Date('2026-10-25T14:32:11');
      vi.setSystemTime(time2);
      fakeTagReader.emitTag('04F6E5D4C3B2');
    });

    // Muestra la nueva tarjeta con su hora
    expect(screen.getByText('UID: 04F6E5D4C3B2 (14:32:11)')).toBeInTheDocument();

    // Avanzar 7 segundos más (total 13s desde la primera, 7s desde la segunda): sigue visible
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('UID: 04F6E5D4C3B2 (14:32:11)')).toBeInTheDocument();

    // Avanzar 3 segundos más (10s desde la segunda): vuelve a espera
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Esperando llavero...')).toBeInTheDocument();
  });
});
