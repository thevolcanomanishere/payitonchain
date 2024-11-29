## PayItOnChain Backend Example

```mermaid
sequenceDiagram
    actor M as Merchant
    actor B as Buyer
    participant API as Payment API
    participant BC as Blockchain
    participant IDX as Indexer

    M->>API: Sign up (address + signature)
    API-->>M: JWT Token
    
    B->>API: Create Payment Intent (signed message)
    API->>API: Verify signature
    API->>API: Check no pending payments
    API-->>B: Payment Intent Details
    
    B->>BC: Transfer tokens to merchant
    BC-->>IDX: New transfer event
    IDX->>API: Process transfer
    
    API->>API: Match transfer with intent
    API->>API: Update intent status
    API->>M: Webhook notification
    
    Note over B,M: Alternative Flow
    B->>API: Cancel Payment Intent
    API->>API: Verify signature
    API->>API: Update status to cancelled
```

#### Components

- Anvil local blockchain node
- [ponder.sh](https://ponder.sh) indexing service
- PostgresDb
- [Fastify](https://fastify.dev) server


