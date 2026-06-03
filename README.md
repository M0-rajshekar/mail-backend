# Social CLI — Backend API

The backend server for Social CLI. Built with NestJS, Prisma, and the MCP protocol.

**Production URL:** `https://backend.socialcli.xyz`

---

## MCP Server

The MCP endpoint is available at:

```
https://backend.socialcli.xyz/mcp/social-cli
```

**MCP client config (Claude Desktop, Cursor, etc.):**

```json
{
  "mcpServers": {
    "social-cli": {
      "url": "https://backend.socialcli.xyz/mcp/social-cli",
      "headers": {
        "x-api-key": "sk_live_your_key_here"
      }
    }
  }
}
```

**Test the MCP endpoint:**

```bash
curl -X POST https://backend.socialcli.xyz/mcp/social-cli \
  -H "x-api-key: sk_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list","params":{},"jsonrpc":"2.0","id":1}'
```

---

## Development

```bash
# Install dependencies
yarn install

# Start in watch mode
yarn run start:dev

# Start in production mode
yarn run start:prod
```

The server runs on port `4000` by default.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=...
ZERNIO_API_KEY=...
ZERNIO_WEBHOOK_SECRET=...
```

---

## API Routes

| Route | Description |
|-------|-------------|
| `POST /mcp/social-cli` | MCP endpoint for AI agents |
| `GET /x402/subscriptions/:network/:plan/:period` | X402 subscription payment |
| `POST /x402/subscriptions/:network/:plan/:period` | X402 subscription confirm |
| `POST /payments/webhook/social/confirm-payin-completed` | Payment webhook |
| `GET /connect/callback` | OAuth callback for social account connections |

---

## License

MIT
