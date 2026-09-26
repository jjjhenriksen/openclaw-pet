/** Bound display-name retention and share concurrent lookups without caching failures. */
export function createLabelCache(lookup: (key: string) => Promise<unknown>, extract: (value: unknown) => string | undefined) {
  const labels = new Map<string, { value: string | undefined; expiresAt: number }>();
  const pending = new Map<string, Promise<string | undefined>>();
  return (key: string): Promise<string | undefined> => {
    const cached = labels.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    labels.delete(key);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(() => lookup(key)).then(extract).then((value) => {
      labels.set(key, { value, expiresAt: Date.now() + 30_000 });
      while (labels.size > 256) labels.delete(labels.keys().next().value!);
      return value;
    }).catch(() => undefined).finally(() => { pending.delete(key); });
    pending.set(key, request);
    return request;
  };
}
