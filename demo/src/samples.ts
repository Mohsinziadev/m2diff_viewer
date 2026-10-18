export interface CodeSample {
  id: string;
  label: string;
  language: string;
  originalName: string;
  modifiedName: string;
  original: string;
  modified: string;
}

export const CODE_SAMPLES: CodeSample[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    language: 'typescript',
    originalName: 'src/cart.ts',
    modifiedName: 'src/cart.ts',
    original: `import { formatPrice } from './format';

export interface LineItem {
  sku: string;
  price: number;
}

export function total(items: LineItem[]): number {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  return sum;
}

export function describe(items: LineItem[]): string {
  return \`\${items.length} items, \${formatPrice(total(items))}\`;
}

export function isEmpty(items: LineItem[]): boolean {
  return items.length == 0;
}

// Legacy helper kept for the checkout page.
export function legacyTotal(items: LineItem[]) {
  return total(items);
}
`,
    modified: `import { formatPrice } from './format';
import type { Currency } from './currency';

export interface LineItem {
  sku: string;
  price: number;
  quantity: number;
}

export function total(items: LineItem[], taxRate = 0): number {
  const net = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(net * (1 + taxRate) * 100) / 100;
}

export function describe(items: LineItem[], currency: Currency = 'USD'): string {
  return \`\${items.length} items, \${formatPrice(total(items), currency)}\`;
}

export function isEmpty(items: LineItem[]): boolean {
  return items.length === 0;
}
`,
  },
  {
    id: 'python',
    label: 'Python',
    language: 'python',
    originalName: 'app/users.py',
    modifiedName: 'app/users.py',
    original: `import json
from datetime import datetime


class UserStore:
    def __init__(self, path):
        self.path = path
        self.users = {}

    def load(self):
        with open(self.path) as f:
            self.users = json.load(f)

    def add(self, name, email):
        user_id = len(self.users) + 1
        self.users[user_id] = {"name": name, "email": email}
        return user_id

    def find_by_email(self, email):
        for uid, user in self.users.items():
            if user["email"] == email:
                return uid
        return None
`,
    modified: `import json
from datetime import datetime, timezone
from pathlib import Path


class UserStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.users: dict[int, dict] = {}

    def load(self) -> None:
        self.users = json.loads(self.path.read_text(encoding="utf-8"))

    def add(self, name: str, email: str) -> int:
        user_id = max(self.users, default=0) + 1
        self.users[user_id] = {
            "name": name,
            "email": email.lower(),
            "created": datetime.now(timezone.utc).isoformat(),
        }
        return user_id

    def find_by_email(self, email: str) -> int | None:
        email = email.lower()
        return next((uid for uid, u in self.users.items() if u["email"] == email), None)
`,
  },
  {
    id: 'go',
    label: 'Go',
    language: 'go',
    originalName: 'server/handler.go',
    modifiedName: 'server/handler.go',
    original: `package server

import (
	"encoding/json"
	"net/http"
)

type Handler struct {
	store Store
}

func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	user, err := h.store.Find(id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	json.NewEncoder(w).Encode(user)
}
`,
    modified: `package server

import (
	"encoding/json"
	"errors"
	"net/http"
)

type Handler struct {
	store Store
}

func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	user, err := h.store.Find(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
`,
  },
  {
    id: 'rust',
    label: 'Rust',
    language: 'rust',
    originalName: 'src/config.rs',
    modifiedName: 'src/config.rs',
    original: `use std::fs;

pub struct Config {
    pub port: u16,
    pub workers: usize,
}

impl Config {
    pub fn load(path: &str) -> Config {
        let text = fs::read_to_string(path).unwrap();
        let port = text.trim().parse().unwrap();
        Config { port, workers: 4 }
    }
}
`,
    modified: `use std::{fs, io, num::ParseIntError};

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub workers: usize,
}

#[derive(Debug)]
pub enum ConfigError {
    Io(io::Error),
    Parse(ParseIntError),
}

impl Config {
    pub fn load(path: &str) -> Result<Config, ConfigError> {
        let text = fs::read_to_string(path).map_err(ConfigError::Io)?;
        let port = text.trim().parse().map_err(ConfigError::Parse)?;
        Ok(Config { port, workers: num_cpus() })
    }
}
`,
  },
  {
    id: 'sql',
    label: 'SQL',
    language: 'sql',
    originalName: 'reports/monthly.sql',
    modifiedName: 'reports/monthly.sql',
    original: `SELECT c.name, SUM(o.total) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.created_at >= '2024-01-01'
GROUP BY c.name
ORDER BY revenue DESC;
`,
    modified: `SELECT c.name,
       COUNT(o.id)  AS orders,
       SUM(o.total) AS revenue
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
                  AND o.status <> 'refunded'
WHERE o.created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
GROUP BY c.name
HAVING SUM(o.total) > 0
ORDER BY revenue DESC
LIMIT 50;
`,
  },
  {
    id: 'css',
    label: 'CSS',
    language: 'css',
    originalName: 'styles/button.css',
    modifiedName: 'styles/button.css',
    original: `.button {
  display: inline-block;
  padding: 8px 16px;
  background: #3366ff;
  color: white;
  border-radius: 4px;
}

.button:hover {
  background: #254eda;
}
`,
    modified: `.button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--accent, #3366ff);
  color: white;
  border-radius: 6px;
}

.button:hover,
.button:focus-visible {
  background: var(--accent-strong, #254eda);
}

@media (prefers-reduced-motion: no-preference) {
  .button { transition: background-color 120ms ease; }
}
`,
  },
  {
    id: 'yaml',
    label: 'YAML',
    language: 'yaml',
    originalName: '.github/workflows/ci.yml',
    modifiedName: '.github/workflows/ci.yml',
    original: `name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm test
`,
    modified: `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
`,
  },
  {
    id: 'java',
    label: 'Java',
    language: 'java',
    originalName: 'CodeFormatting.java',
    modifiedName: 'CodeFormatting.java',
    original: `package com.example.formatting;

import java.util.List;

public class CodeFormatting {
    public void forceIfStatementsToHaveBraces(int someValue) {
        if (someValue == 2)
            System.out.println(someValue);

        System.out.println("Value is not two");
    }

    public void horriblyFormattedMethod  (){
        System.out.println("First line");
            System.out.println("Second line");
          System.out.println("Third line");
        for (int i = 0; i < 3; i++)
        System.out.println("I have no idea where the indent is");
    }
}
`,
    modified: `package com.example.formatting;

import java.util.List;

// TODO this file needs formatting
public class CodeFormatting {
    public void forceIfStatementsToHaveBraces(int someValue) {
        if (someValue == 2) {
            System.out.println(someValue);
        }
        System.out.println("Value is not two");
    }

    public void horriblyFormattedMethod() {
        System.out.println("First line");
        System.out.println("Second line");
        System.out.println("Third line");
        for (int i = 0; i < 3; i++) {
            System.out.println("This line has strange indentation");
        }
    }
}
`,
  },
  {
    id: 'csharp',
    label: 'C#',
    language: 'csharp',
    originalName: 'Services/Mailer.cs',
    modifiedName: 'Services/Mailer.cs',
    original: `public class Mailer
{
    private readonly SmtpClient _client;

    public Mailer(SmtpClient client)
    {
        _client = client;
    }

    public void Send(string to, string body)
    {
        _client.Send("noreply@example.com", to, "Notification", body);
    }
}
`,
    modified: `public sealed class Mailer(SmtpClient client, ILogger<Mailer> logger)
{
    public async Task SendAsync(string to, string body, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(to);
        await client.SendMailAsync(new MailMessage("noreply@example.com", to, "Notification", body), ct);
        logger.LogInformation("Mail sent to {Recipient}", to);
    }
}
`,
  },
  {
    id: 'php',
    label: 'PHP',
    language: 'php',
    originalName: 'src/Price.php',
    modifiedName: 'src/Price.php',
    original: `<?php

class Price
{
    public $amount;

    function __construct($amount)
    {
        $this->amount = $amount;
    }

    function withTax($rate)
    {
        return $this->amount + $this->amount * $rate;
    }
}
`,
    modified: `<?php

declare(strict_types=1);

final class Price
{
    public function __construct(public readonly int $cents)
    {
    }

    public function withTax(float $rate): self
    {
        return new self((int) round($this->cents * (1 + $rate)));
    }
}
`,
  },
  {
    id: 'bash',
    label: 'Bash',
    language: 'bash',
    originalName: 'scripts/deploy.sh',
    modifiedName: 'scripts/deploy.sh',
    original: `#!/bin/bash
cd /srv/app
git pull
npm install
npm run build
pm2 restart app
`,
    modified: `#!/usr/bin/env bash
set -euo pipefail

APP_DIR="\${APP_DIR:-/srv/app}"
cd "$APP_DIR"

git fetch --tags
git checkout "\${1:?usage: deploy.sh <tag>}"
npm ci
npm run build
pm2 reload app --update-env
echo "Deployed $1"
`,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    language: 'markdown',
    originalName: 'README.md',
    modifiedName: 'README.md',
    original: `# Widget

A small widget.

## Install

npm install widget

## Usage

Call \`widget()\` to start.
`,
    modified: `# Widget

A small, dependency-free widget for dashboards.

## Install

\`\`\`sh
npm install widget
\`\`\`

## Usage

Call \`widget({ target })\` to mount it. See the [API reference](./docs/api.md).
`,
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    language: 'graphql',
    originalName: 'schema.graphql',
    modifiedName: 'schema.graphql',
    original: `type User {
  id: ID!
  name: String
  email: String
}

type Query {
  user(id: ID!): User
  users: [User]
}
`,
    modified: `type User {
  id: ID!
  name: String!
  email: String! @deprecated(reason: "Use contact.email")
  contact: Contact
}

type Contact {
  email: String!
  phone: String
}

type Query {
  user(id: ID!): User
  users(first: Int = 20, after: String): UserConnection!
}
`,
  },
  {
    id: 'env',
    label: '.env',
    language: 'dotenv',
    originalName: '.env',
    modifiedName: '.env.production',
    original: `# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=app
LOG_LEVEL=debug
`,
    modified: `# Database
DB_HOST=db.internal
DB_PORT=5432
DB_USER=app
DB_POOL_SIZE=20
LOG_LEVEL=info
`,
  },
  {
    id: 'whitespace',
    label: 'Whitespace only',
    language: 'javascript',
    originalName: 'format.js',
    modifiedName: 'format.js',
    original: `function  format( value ){
    return value.toFixed(2)
}\r
`,
    modified: `function format(value) {
  return value.toFixed(2)
}
`,
  },
];

/** A synthetic large file with scattered edits, generated on demand to show virtualised rendering. */
export function largeSample(lines: number): CodeSample {
  const original: string[] = [];
  for (let i = 0; i < lines; i++) {
    original.push(
      i % 50 === 0 ? `// ——— section ${i / 50 + 1} ———` : `export const value${i} = compute(${i}, ${(i * 7919) % 1000}); // item ${i}`,
    );
  }
  const modified = original.map((line, i) =>
    i % 409 === 7 ? line.replace('compute', 'calculate') : i % 997 === 3 ? `${line}\nexport const extra${i} = ${i};` : line,
  );
  return {
    id: `large-${lines}`,
    label: `Large file (${lines.toLocaleString('en-US')} lines)`,
    language: 'typescript',
    originalName: 'generated/values.ts',
    modifiedName: 'generated/values.ts',
    original: original.join('\n') + '\n',
    modified: modified.filter((_, i) => i % 1499 !== 11).join('\n') + '\n',
  };
}

export const JSON_SAMPLE = {
  original: JSON.stringify(
    {
      id: 'ord_1042',
      status: 'processing',
      customer: { id: 77, name: 'Ada Lovelace', email: 'ada@example.com' },
      items: [
        { sku: 'KB-01', name: 'Keyboard', qty: 1, price: 89.0 },
        { sku: 'MS-02', name: 'Mouse', qty: 2, price: 25.5 },
      ],
      shipping: { method: 'standard', address: { city: 'London', zip: 'N1 9GU' } },
      request: { id: 'req_81f2', timestamp: '2025-03-09T10:12:44Z' },
      metadata: { updatedAt: '2025-03-09T10:12:44Z', version: 3 },
    },
    null,
    2,
  ),
  modified: JSON.stringify(
    {
      id: 'ord_1042',
      status: 'shipped',
      customer: { id: 77, name: 'Ada Lovelace', email: 'ada.lovelace@example.com', vip: true },
      items: [
        { sku: 'MS-02', name: 'Mouse', qty: 3, price: 25.5 },
        { sku: 'KB-01', name: 'Keyboard', qty: 1, price: 89.0 },
        { sku: 'PD-07', name: 'Mouse pad', qty: 1, price: 9.99 },
      ],
      shipping: { method: 'express', address: { city: 'London', zip: 'N1 9GU' }, tracking: '1Z999AA10123456784' },
      request: { id: 'req_93c0', timestamp: '2025-03-10T08:01:02Z' },
      metadata: { updatedAt: '2025-03-10T08:01:02Z', version: 4 },
    },
    null,
    2,
  ),
};

export const CSV_SAMPLE = {
  original: `sku,name,category,price,stock
KB-01,"Keyboard, mechanical",Peripherals,89.00,14
MS-02,Mouse,Peripherals,25.50,120
MN-27,"27"" Monitor",Displays,279.00,8
CB-10,USB-C cable,Accessories,9.99,300
HD-05,Headset,Audio,59.00,0
`,
  modified: `sku,name,category,price,stock
MS-02,Mouse,Peripherals,24.00,118
KB-01,"Keyboard, mechanical",Peripherals,89.00,14
MN-27,"27"" Monitor (IPS)",Displays,299.00,6
CB-10,USB-C cable,Accessories,9.99,300
WC-11,Webcam,Video,49.00,35
`,
};
