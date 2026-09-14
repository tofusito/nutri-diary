#!/usr/bin/env bash
set -euo pipefail

# Nutri Diary keeps two databases, so the application user lives in admin with
# readWrite scoped to each of them and nothing else.
mongosh \
  --quiet \
  --host 127.0.0.1 \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  admin <<'MONGOSH'
const username = process.env.MONGO_APP_USERNAME;
const password = process.env.MONGO_APP_PASSWORD;

if (!username || !password) {
  throw new Error("Missing application database initialization variables");
}

const adminDatabase = db.getSiblingDB("admin");

if (adminDatabase.getUser(username) === null) {
  adminDatabase.createUser({
    user: username,
    pwd: password,
    roles: [
      { role: "readWrite", db: "nutrition_catalog" },
      { role: "readWrite", db: "nutrition_tracking" },
    ],
  });
}
MONGOSH
