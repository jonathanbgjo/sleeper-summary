export async function j(url, opts = {}) {
  const res = await fetch(url, { headers: { accept: "application/json" }, ...opts });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
