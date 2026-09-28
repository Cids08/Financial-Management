# Financial Management System — Microservices Architecture Diagram

> **Defense Presentation Guide**: This architecture diagram depicts the system using the canonical **Database-per-Service Microservices Pattern**, featuring an **Nginx API Gateway**, decentralized domain microservices with isolated PostgreSQL databases, asynchronous and synchronous internal communication, and dedicated Python FastAPI analytics services.

---

## 1. System Architecture Diagram

```mermaid
flowchart TD
    Client(["👤 Client / User\n(React.js + Vite Frontend)"])

    Gateway["🟩 Nginx API Gateway\n(Reverse Proxy · SSL · Rate Limiter · Auth Routing)"]

    Client -->|HTTPS / WSS| Gateway

    subgraph CorePlatform ["Laravel Microservices Ecosystem"]
        direction TB

        subgraph S1 ["Auth & Security Service"]
            AuthSvc["🔐 Auth & RBAC Service\n(Sanctum / Token Auth)"]
            AuthDB[("🗄️ Auth Database\nPostgreSQL")]
            AuthSvc --> AuthDB
        end

        subgraph S2 ["Accounts Receivable"]
            ARSvc["💳 AR & Collections\nService"]
            ARDB[("🗄️ AR Database\nPostgreSQL")]
            ARSvc --> ARDB
        end

        subgraph S3 ["Accounts Payable"]
            APSvc["📑 AP & Vendor\nService"]
            APDB[("🗄️ AP Database\nPostgreSQL")]
            APSvc --> APDB
        end

        subgraph S4 ["General Ledger"]
            GLSvc["⚖️ General Ledger &\nJournal Service"]
            GLDB[("🗄️ Ledger Database\nPostgreSQL")]
            GLSvc --> GLDB
        end

        subgraph S5 ["Budget & Expenses"]
            BudgetSvc["📊 Budget & Expense\nService"]
            BudgetDB[("🗄️ Budget Database\nPostgreSQL")]
            BudgetSvc --> BudgetDB
        end

        subgraph S6 ["Disbursements & Cash"]
            DisbSvc["💰 Cash & Disbursement\nService"]
            DisbDB[("🗄️ Cash Database\nPostgreSQL")]
            DisbSvc --> DisbDB
        end
    end

    Gateway -->|/api/auth/*| AuthSvc
    Gateway -->|/api/ar/*| ARSvc
    Gateway -->|/api/ap/*| APSvc
    Gateway -->|/api/gl/*| GLSvc
    Gateway -->|/api/budgets/*| BudgetSvc
    Gateway -->|/api/disbursements/*| DisbSvc

    %% Internal Communication Bus
    AuthDB ~~~ Bus["═════════════  Internal API Communication (REST / Event Broker)  ═════════════"]
    ARDB ~~~ Bus
    APDB ~~~ Bus
    GLDB ~~~ Bus
    BudgetDB ~~~ Bus
    DisbDB ~~~ Bus

    subgraph AISuite ["Python FastAPI Microservices"]
        direction TB
        AISvc["🐍 FastAPI AI Service\n(Port 8002 · OpenAI gpt-5-mini)"]
        ForecastSvc["📈 FastAPI Forecasting Service\n(Port 8001 · ARIMA Engine)"]
    end

    Bus <-->|Internal REST API| AISuite

    %% Styling
    style Client fill:#ffffff,stroke:#3b82f6,stroke-width:2px,color:#1e293b
    style Gateway fill:#10b981,stroke:#047857,stroke-width:2px,color:#ffffff
    style CorePlatform fill:#f8fafc,stroke:#94a3b8,stroke-width:2px,stroke-dasharray: 4 4
    style AISuite fill:#fdf4ff,stroke:#a855f7,stroke-width:2px
    style Bus fill:#f1f5f9,stroke:#64748b,stroke-width:1px,color:#334155

    style S1 fill:#ffffff,stroke:#cbd5e1,stroke-width:1px
    style S2 fill:#ffffff,stroke:#cbd5e1,stroke-width:1px
    style S3 fill:#ffffff,stroke:#cbd5e1,stroke-width:1px
    style S4 fill:#ffffff,stroke:#cbd5e1,stroke-width:1px
    style S5 fill:#ffffff,stroke:#cbd5e1,stroke-width:1px
    style S6 fill:#ffffff,stroke:#cbd5e1,stroke-width:1px

    style AuthDB fill:#e2e8f0,stroke:#64748b
    style ARDB fill:#e2e8f0,stroke:#64748b
    style APDB fill:#e2e8f0,stroke:#64748b
    style GLDB fill:#e2e8f0,stroke:#64748b
    style BudgetDB fill:#e2e8f0,stroke:#64748b
    style DisbDB fill:#e2e8f0,stroke:#64748b
```

---

## 2. Component Breakdown

| Tier | Component | Technology | Responsibility |
|---|---|---|---|
| **Presentation** | Client / Web App | React 19 + Vite + Tailwind | Responsive UI, state management, client-side caching |
| **Edge / Gateway** | API Gateway | Nginx | Reverse proxy, SSL termination, path-based routing, rate limiting, CORS |
| **Service 1** | Auth & Security Service | Laravel | User credentials, role-based access control (RBAC), tokens |
| **Service 2** | Accounts Receivable Service | Laravel | Invoices, customer billing, collections, aging reports |
| **Service 3** | Accounts Payable Service | Laravel | Vendor bills, vouchers, supplier tracking, purchase obligations |
| **Service 4** | General Ledger Service | Laravel | Chart of accounts, journal entries, balance sheet, trial balance |
| **Service 5** | Budget & Expense Service | Laravel | Department allocation, health tracker, operational expenditures |
| **Service 6** | Cash & Disbursement Service | Laravel | Check issuance, bank reconciliations, cash account balances |
| **Data Tier** | Database-per-Service | PostgreSQL 16 | Dedicated schema and database storage per service to ensure high cohesion and loose coupling |
| **AI & Analytics** | AI Advisor & Forecasting | FastAPI (Python) | High-speed async inference for LLM advisor (`gpt-5-mini`) and statistical ARIMA time-series forecasting |

---

## 3. Defense Talking Points (Panel Q&A Guide)

### Q1: *"Why do you have a separate database for each service?"*
> **Answer**: *"We follow the industry-standard **Database-per-Service pattern**. This guarantees **loose coupling**—no service can directly query or modify another service's private tables. If the Accounts Receivable schema changes, it does not break the General Ledger service. Data integrity is maintained strictly through APIs."*

### Q2: *"How do services communicate with each other?"*
> **Answer**: *"We utilize **Internal REST API communication** over a secured container network. When a transaction completes in Disbursements, it dispatches an event/API payload to the General Ledger service to create the corresponding journal entry."*

### Q3: *"Why are the AI and Forecasting services built in Python FastAPI instead of Laravel?"*
> **Answer**: *"Python is the industry benchmark for data science and AI integration. FastAPI provides native asynchronous non-blocking I/O (`async`/`await`), which is critical when waiting for LLM token completions from OpenAI and running matrix computations for ARIMA forecasting without freezing PHP worker threads."*

### Q4: *"What is the role of the Nginx API Gateway?"*
> **Answer**: *"The API Gateway acts as the single point of entry for the client frontend. It shields our internal microservices from direct public exposure, handles SSL/TLS termination, routes requests by path (e.g., `/api/ar/*` to AR Service), and enforces uniform CORS and rate-limiting policies."*
