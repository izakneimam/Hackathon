import { useEffect, useState } from 'react';

let cachedOffsetMs = 0;
let synced = false;

export async function syncServerTimeOffset(): Promise<number> {
  if (synced) return cachedOffsetMs;

  // Sincroniza via cabeçalho Date do servidor HTTP (gratuito, sem Cloud Functions)
  try {
    const start = Date.now();
    const res = await fetch(window.location.origin + '/', {
      method: 'HEAD',
      cache: 'no-store',
    });
    const end = Date.now();
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      if (!Number.isNaN(serverMs)) {
        const rtt = (end - start) / 2;
        cachedOffsetMs = serverMs + rtt - end;
        synced = true;
      }
    }
  } catch {
    // Fallback para relógio local
  }
  return cachedOffsetMs;
}

export function getServerNowMs(): number {
  return Date.now() + cachedOffsetMs;
}

export function useServerTimeOffset(): number {
  const [offset, setOffset] = useState(cachedOffsetMs);

  useEffect(() => {
    let active = true;
    void syncServerTimeOffset().then((val) => {
      if (active) setOffset(val);
    });
    return () => {
      active = false;
    };
  }, []);

  return offset;
}

export interface CountdownParts {
  days: string;
  hours: string;
  mins: string;
  secs: string;
  expired: boolean;
}

export function getCountdownParts(targetMs: number | null | undefined, offsetMs = 0): CountdownParts {
  if (!targetMs) {
    return { days: '00', hours: '00', mins: '00', secs: '00', expired: false };
  }
  const now = Date.now() + offsetMs;
  const diff = Math.max(0, targetMs - now);
  if (diff === 0) {
    return { days: '00', hours: '00', mins: '00', secs: '00', expired: true };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    days: pad(days),
    hours: pad(hours),
    mins: pad(mins),
    secs: pad(secs),
    expired: false,
  };
}

export function formatSaoPauloDateTime(ms: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}
