function normalizeModifier(value) {
  if (typeof value === 'string') return { name: value.trim(), price: 0 };
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim();
  const price = Number(value.price || 0);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  return { name, price: Math.round(price * 100) / 100 };
}

function resolveModifiers(requested, available) {
  const availableModifiers = new Map((Array.isArray(available) ? available : []).map((modifier) => {
    const normalized = normalizeModifier(modifier);
    return normalized ? [normalized.name.toLowerCase(), normalized] : null;
  }).filter(Boolean));

  const selected = (Array.isArray(requested) ? requested : []).map(normalizeModifier);
  if (selected.some((modifier) => !modifier)) {
    throw new Error('Each add-on must have a valid name and non-negative price');
  }

  return selected.map((modifier) => {
    const stored = availableModifiers.get(modifier.name.toLowerCase());
    if (!stored) throw new Error(`Add-on "${modifier.name}" is not available for this item`);
    return stored;
  });
}

module.exports = { resolveModifiers };
