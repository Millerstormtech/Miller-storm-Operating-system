// src/lib/canvass/dbGuard.ts
// Is this database address the Canvass Map test database on this computer?
//
// The import scripts write millions of rows, so they refuse any other database
// unless --allow-remote is passed on purpose. "127.0.0.1" alone is NOT proof of
// a local database: the live database is reached from this laptop through an
// SSH tunnel on 127.0.0.1:27018. Only the plain local MongoDB counts: localhost
// or 127.0.0.1, port 27017, one host, and no user name or password (the local
// test database has none; the live one does).
//
// Pure: no network.

export function isLocalTestDatabase(uri: string): boolean {
  const match = /^mongodb:\/\/([^/?]+)(?:[/?].*)?$/.exec(uri.trim());
  if (!match) return false; // not a plain mongodb:// address (mongodb+srv is always a cloud cluster)

  const authority = match[1];
  if (authority.includes("@")) return false;

  const hosts = authority.split(",");
  if (hosts.length !== 1) return false;

  const [host, port = "27017"] = hosts[0].split(":");
  return (host === "127.0.0.1" || host === "localhost") && port === "27017";
}
